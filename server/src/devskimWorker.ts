/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * 
 * This file contains the actual meat and potatoes of analysis.  The DevSkimWorker class does 
 * the actual work of analyzing data it was given
 * 
 * Most of the type declerations representing things like the rules used to analyze a file, and 
 * problems found in a file, are in devskimObjects.ts
 * 
 * ------------------------------------------------------------------------------------------ */
import { Range } from 'vscode-languageserver';
import {computeKey, DevSkimProblem, Settings, DevSkimSettings,DevskimRuleSeverity, Fixes, Map, AutoFix, Rule,FixIt,Pattern, DevSkimAutoFixEdit} from "./devskimObjects";
import {DevSkimSuppression, DevSkimSuppressionFinding} from "./suppressions"
import * as path from 'path';

export class DevSkimWorker
{
    public static settings : Settings;

    //directory that the extension rules live in.  
    private rulesDirectory: String;

    //collection of rules to run analysis with
    private analysisRules: Rule[];
   
    private dir = require('node-dir'); 

    //codeActions is the object that holds all of the autofix mappings. we need to store them because
    //the CodeActions are created at a different point than the diagnostics, yet we still need to be able
    //to associate the action with the diagnostic.  So we create a mapping between them and look up the fix
    //in the map using values out of the diagnostic as a key
    //
    //We use nested Maps to store the fixes.  The key to the first map is the document URI.  This maps a 
    //specific file to a map of the fixes for that file.  The key for this second map is created in
    //the devskimObjects.ts file, in the function computeKey.  the second key is in essence a combination of
    //a diagnostic and a string represetnation of a number for a particular fix, as there may be multiple fixes associated with a single diagnostic
    //i.e. we suggest both strlcpy and strcpy_s to fix strcpy
    //
    //it's format is essentially <document URI <diagnostic + fix#>>.  We could instead have done <document <diagnostic <fix#>>>, but three deep
    //map seemed a little excessive to me.  Then again, I just wrote 3 paragraphs for how this works, so maybe I'm being too clever
    public codeActions: Map<Map<AutoFix>> = Object.create(null);    

    constructor()
    {
        //this file runs out of the server directory.  The rules directory should be in ../rules
        //so pop over to it
        this.rulesDirectory =  path.join(__dirname,"..","rules");
        
        this.loadRules();
    }

    /**
     * Look for problems in the provided text
     * 
     * @param {string} documentContents the contents of a file to analyze
     * @param {string} langID the programming language for the file
     * @param {string} documentURI the URI identifying the file
     * @returns {DevSkimProblem[]} an array of all of the issues found in the text
     */
    public analyzeText(documentContents : string, langID : string, documentURI : string) : DevSkimProblem[]
    {
        var problems : DevSkimProblem[];

        problems = this.runAnalysis(documentContents,langID,documentURI);
        
        //remove any findings from rules that have been overriden by other rules
        problems = this.processOverrides(problems);

        return problems;

    }

    /**
     * Save a codeaction for a particular auto-fix to the codeActions map, so that it can be looked up when onCodeAction is called
     * and actually communicated to the VSCode engine.  Since creating a diagnostic and assigning a code action happen at different points
     * its important to be able to look up what code actions should be populated at a given time
     * 
     * @param {string} documentURI the path to the document, identifying it
     * @param {number} documentVersion the current revision of the document (vs code calculates this)
     * @param {Diagnostic} diagnostic the diagnostic a fix is associated with
     * @param {DevSkimAutoFixEdit} fix the actual data about the fix being applied (location, name, action, etc.)
     * @param {string} ruleID an identifier for the rule that was triggered
     * @returns {void}
     */
    public recordCodeAction(documentURI: string, documentVersion: number, range: Range, diagnosticCode : string | number, fix: DevSkimAutoFixEdit, ruleID : string): void 
    {
        if (!fix || !ruleID) {
            return;
        }
        let fixName: string = (fix.fixName !== undefined && fix.fixName.length > 0) ? fix.fixName : `Fix this ${ruleID} problem`;
        let edits: Map<AutoFix> = this.codeActions[documentURI];
        if (!edits) {
            edits = Object.create(null);
            this.codeActions[documentURI] = edits;
        }

        let x : number = 0;
        //figure out how many existing fixes are associated with a given diagnostic by checking if it exists, and incrementing until it doesn't
        while(edits[computeKey(range,diagnosticCode) + x.toString(10)]) {x++;}

        //create a new mapping, using as the key the diagnostic the fix is associated with and a number representing whether this is the 1st fix
        //to associate with that diagnostic, 2nd, 3rd, and so on.  This lets us map multiple fixes to one diagnostic while providing an easy way
        //to iterate.  we could have instead made this a three nested map <file<diagnostic<fix#>>> but this achieves the same thing 
        edits[computeKey(range,diagnosticCode) + x.toString(10)] = { label: fixName, documentVersion: documentVersion, ruleId: ruleID, edit: fix};
    }    

    /**
     * Reload the rules from the file system.  Since this right now is just a proxy for loadRules this *could* have been achieved by
     * exposing loadRules as public.  I chose not to, as eventually it might make sense here to check if an analysis is actively running
     * and hold off until it is complete.  I don't forsee that being an issue when analyzing an indivudal file (it's fast enoguh a race condition
     * should exist with reloading rules), but might be if doing a full analysis of a lot of files.  So in anticipation of that, I broke this
     * into its own function so such a check could be added.
     */
    public refreshAnalysisRules() : void
    {
        this.loadRules();
    }

    /**
     * recursively load all of the JSON files in the $userhome/.vscode/extensions/vscode-devskim/rules sub directories
     * 
     * @private
     */
    private loadRules() : void 
    {
        this.analysisRules = [];

        this.analysisRules = [];

        //read the rules files recursively from the file system - get all of the .json files under the rules directory.  
        //first read in the default & custom directories, as they contain the required rules (i.e. exclude the "optional" directory)
        //and then do the inverse to populate the optional rules
        this.dir.readFiles(this.rulesDirectory, {	match: /.json$/ },
            (err, content, file, next) => 
            { 
                if (err) throw err;
                //Load the rules from files add the file path & whether the rule is required 
                //or optional (based on the file path) to the rule objects
                var loadedRules : Rule[] = JSON.parse(content);
                for(var rule of loadedRules)
                {
                    rule.filepath = file;
                }

                this.analysisRules = this.analysisRules.concat(loadedRules);
                next();  
            });          
    }

    /**
     * Low, Defense In Depth, and Informational severity rules may be turned on and off via a setting 
     * prior to running an analysis, verify that the rule is enabled based on its severity and the user settings
     * 
     * @private
     * @param {DevskimRuleSeverity} ruleSeverity
     * @returns {boolean}
     * 
     * @memberOf DevSkimWorker
     */
    private RuleSeverityEnabled(ruleSeverity : DevskimRuleSeverity) : boolean
    {
        if(ruleSeverity == DevskimRuleSeverity.Critical  || 
           ruleSeverity == DevskimRuleSeverity.Important || 
           ruleSeverity == DevskimRuleSeverity.Moderate  ||
           (ruleSeverity == DevskimRuleSeverity.BestPractice            && DevSkimWorker.settings.devskim.enableLowSeverityRules == true )            ||
           (ruleSeverity == DevskimRuleSeverity.ManualReview   && DevSkimWorker.settings.devskim.enableManualReviewRules == true  ))
        {
            return true;
        }
        return false;
    }

    /**
     * maps the string for severity recieved from the rules into the enum (there is inconsistencies with the case used
     * in the rules, so this is case incencitive)
     * 
     * @param {string} severity
     * @returns {DevskimRuleSeverity}
     * 
     * @memberOf DevSkimWorker
     */
    public MapRuleSeverity(severity: string) : DevskimRuleSeverity
    {
        switch (severity.toLowerCase())
		{
			case "critical":         return DevskimRuleSeverity.Critical;
			case "important":        return DevskimRuleSeverity.Important;
			case "moderate":         return DevskimRuleSeverity.Moderate;
			case "best-practice":    return DevskimRuleSeverity.BestPractice
            case "manual-review":    return DevskimRuleSeverity.ManualReview;
			default:                 return DevskimRuleSeverity.BestPractice;
		}  
    }

    /**
     * Perform the actual analysis of the text, using the provided rules
     * 
     * @param {string} documentContents the full text to analyze
     * @param {string} langID the programming language for the text
     * @param {string} documentURI URI identifying the document
     * @returns {DevSkimProblem[]} all of the issues identified in the analysis
     */
    private runAnalysis(documentContents : string, langID : string, documentURI : string) : DevSkimProblem[]
    {
        let problems : DevSkimProblem[] = [];
        let suppression : DevSkimSuppression = new DevSkimSuppression();

        let XRegExp = require('xregexp');


        //iterate over all of the rules, and then all of the patterns within a rule looking for a match.  
        for(var rule of this.analysisRules)
        {
            var ruleSeverity : DevskimRuleSeverity = this.MapRuleSeverity(rule.severity);
            //if the rule doesn't apply to whatever language we are analyzing (C++, Java, etc.) or we aren't processing
            //that particular severity skip the rest
            if((rule.active === undefined || rule.active == null || rule.active == true) && 
               this.appliesToLanguage(langID, rule.applies_to) &&
               this.RuleSeverityEnabled(ruleSeverity))
            {
                for(let patternIndex:number = 0; patternIndex < rule.patterns.length; patternIndex++)
                {
                    //the pattern type governs how we form the regex.  regex_word is wrapped in \b, string is as well, but is also escaped.
                    //substring is not wrapped in \b, but is escapped, and regex/the default behavior is a vanilla regular expression
                    switch(rule.patterns[patternIndex].type.toLowerCase())
                    {
                        case 'regex_word': var matchPattern = XRegExp('\\b'+rule.patterns[patternIndex].pattern+'\\b', "g");
                            break;
                        case 'string': var matchPattern = XRegExp('\\b'+XRegExp.escape(rule.patterns[patternIndex].pattern)+'\\b', "g");
                            break; 
                        case 'substring': var matchPattern = XRegExp(XRegExp.escape(rule.patterns[patternIndex].pattern), "g");
                            break;   
                        default: var matchPattern = XRegExp(rule.patterns[patternIndex].pattern, "g");                                                
                    }
                    
                    let matchPosition: number = 0;
                    var match;

                    //go through all of the text looking for a match with the given pattern
                    while(match = XRegExp.exec(documentContents,matchPattern,matchPosition))
                    {
                        let suppressionFinding : DevSkimSuppressionFinding = DevSkimSuppression.isFindingCommented(match.index,documentContents, rule.id,ruleSeverity);
                        //calculate what line we are on by grabbing the text before the match & counting the newlines in it
                        let lineStart: number = this.getLineNumber(documentContents,match.index);
                        let columnStart : number = (lineStart == 0) ? match.index : match.index -  documentContents.substr(0,match.index).lastIndexOf("\n") -1;
                        
                        //look for the suppression comment for that finding
                        if(!suppressionFinding.showFinding)
                        {
                            //since a match may span lines (someone who broke a long function invocation into multiple lines for example)
                            //it's necessary to see if there are any newlines WITHIN the match so that we get the line the match ends on,
                            //not just the line it starts on.  Also, we use the substring for the match later when making fixes
                            let replacementSource : string = documentContents.substr(match.index, match[0].length);
                            let lineEnd : number = this.getLineNumber(replacementSource,replacementSource.length) + lineStart;                 
                                    
                            let range : Range = Range.create(lineStart,columnStart,lineEnd, columnStart + match[0].length);

                            let problem : DevSkimProblem = new DevSkimProblem(rule.description,rule.name,
                                rule.id, this.MapRuleSeverity(rule.severity), rule.replacement, rule.rule_info, range);

                            if(rule.overrides !== undefined && rule.overrides.length > 0)
                            {
                                problem.overrides = rule.overrides; 
                            }
                        
                            //add in any fixes
                            problem.fixes = problem.fixes.concat(this.makeFixes(rule,replacementSource,range));
                            problem.fixes = problem.fixes.concat(suppression.createActions(rule.id,documentContents,match.index,lineStart, langID,ruleSeverity));
                           
                            problems.push(problem);
                        }  
                        //throw a pop up if there is a review/suppression comment with the rule id, so that people can figure out what was
                        //suppressed/reviewed
                        else if(suppressionFinding.ruleColumn > 0)
                        {
                            //highlight suppression finding for context
                            let range : Range = Range.create(lineStart,columnStart + suppressionFinding.ruleColumn,lineStart, columnStart + suppressionFinding.ruleColumn + rule.id.length);
                            let problem : DevSkimProblem = new DevSkimProblem(rule.description,rule.name,
                                rule.id, DevskimRuleSeverity.WarningInfo, rule.replacement, rule.rule_info, range);
                            problems.push(problem);

                        }
                        //advance the location we are searching in the line
                        matchPosition = match.index + match[0].length;                              
                    }
                }
            }
        }
        return problems;
    }

    /**
     * returns the number of newlines (regardless of platform) from the beginning of the provided text to the
     * current location
     * 
     * @private
     * @param {string} documentContents the text to search for nelines in
     * @param {number} currentPosition the point in the text that we should count newlines to
     * @returns {number}
     * 
     * @memberOf DevSkimWorker
     */
    private getLineNumber(documentContents : string, currentPosition : number) : number
    {

        let newlinePattern : RegExp = /(\r\n|\n|\r)/gm;
        let subDocument : string = documentContents.substr(0,currentPosition);        
        let linebreaks : RegExpMatchArray = subDocument.match(newlinePattern);
        let lineStart = (linebreaks !== undefined && linebreaks !== null) ? linebreaks.length : 0;

        return lineStart;
    }

    /**
     * Create an array of fixes from the rule and the vulnerable part of the file being scanned
     * 
     * @private
     * @param {Rule} rule
     * @param {string} replacementSource
     * @param {Range} range
     * @returns {DevSkimAutoFixEdit[]}
     * 
     * @memberOf DevSkimWorker
     */
    private makeFixes(rule: Rule, replacementSource : string, range : Range) : DevSkimAutoFixEdit[]
    {
        var fixes : DevSkimAutoFixEdit[] = [];
        //if there are any fixes, add them to the fix collection so they can be used in code fix commands
        if(rule.fix_it !== undefined && rule.fix_it.length > 0)
        {   
            let XRegExp = require('xregexp');

            //recordCodeAction below acts like a stack, putting the most recently added rule first.
            //Since the very first fix in the rule is usually the prefered one (when there are multiples)
            //we want it to be first in the fixes collection, so we go through in reverse order 
            for(var fixIndex = rule.fix_it.length -1; fixIndex >= 0; fixIndex--) 
            {
                let fix : DevSkimAutoFixEdit = Object.create(null);
                var replacePattern = XRegExp(rule.fix_it[fixIndex].search);

                fix.text = XRegExp.replace(replacementSource, replacePattern,  rule.fix_it[fixIndex].replace);
                fix.fixName = "DevSkim: "+ rule.fix_it[fixIndex].name;
                
                fix.range = range;
                fixes.push(fix);                                
            }
        }
        return fixes;        
    }

    /**
     * Removes any findings from the problems array corresponding to rules that were overriden by other rules
     * for example, both the Java specific MD5 rule and the generic MD5 rule will trigger on the same usage of MD5 
     * in Java.  We should only report the Java specific finding, as it supercedes the generic rule
     * 
     * @private
     * @param {DevSkimProblem[]} problems array of findings
     * @returns {DevSkimProblem[]} findings with any overriden findings removed
     */
    private processOverrides(problems : DevSkimProblem[]) : DevSkimProblem[]
    {
        for(var problem of problems)
        {
            //if this problem overrides other ones, THEN do the processing
            if(problem.overrides.length > 0 )
            {
                //one rule can override multiple other rules, so create a regex of all
                //of the overrides so we can search all at once - i.e. override1|override2|override3
                var regexString : string = problem.overrides[0];
                for(let x : number = 1; x < problem.overrides.length; x ++)
                {
                    regexString = regexString + "|" + problem.overrides[x];
                }

                //now search all of the existing findings for matches on both the regex, and the line of code
                //there is some assumption that both will be on the same line, and it *might* be possible that they
                //aren't BUT we can't blanket say remove all instances of the overriden finding, because it might flag
                //issues the rule that supercedes it does not
                for(let x : number = 0; x < problems.length; x++)
                {
                    var matches = problems[x].ruleId.match(regexString);
                    if((matches !== undefined && matches != null && matches.length > 0) 
                        && problems[x].range.start.line == problem.range.start.line )
                        {
                            problems.splice(x,1);
                        }
                }

            }
        }
        return problems;
    }  

    /**
     * compares the languageID against all of the languages listed in the appliesTo array to check 
     * for a match.  If it matches, then the rule/pattern applies to the language being analyzed.  Absent
     * any value in appliesTo we assume it applies to everything so return true
     * 
     * @param {string} languageID the vscode languageID for the current document
     * @param {string[]} appliesTo the array of languages a rule/pattern applies to
     * @returns {boolean} true if it applies, false if it doesn't
     */
    private appliesToLanguage(languageID : string, appliesTo : string[]) : boolean
    {
        console.log("\nLanguage is: " + languageID);
        //if the parameters are empty, assume it applies.  Also, apply all the rules to plaintext documents	
        if(languageID !== undefined && languageID != null && appliesTo !== undefined && appliesTo != null && appliesTo.length > 0)
        {	
            for(let i: number = 0; i < appliesTo.length; i++)
            {
                if(languageID.toLowerCase() == appliesTo[i].toLowerCase() )
                {
                    return true;
                }
            }
            return false;
        }
        else
        {
            return true;
        }	
    }       
}