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
import {computeKey, Condition, DevSkimProblem, Settings, DevSkimSettings,DevskimRuleSeverity, Fixes, Map, AutoFix, Rule,FixIt,Pattern, DevSkimAutoFixEdit} from "./devskimObjects";
import {DevSkimSuppression, DevSkimSuppressionFinding} from "./suppressions";
import {PathOperations} from "./pathOperations";
import * as path from 'path';
import {SourceComments} from "./comments";
import {RuleValidator} from "./ruleValidator";


/**
 * The bulk of the DevSkim analysis logic.  Loads rules in, exposes functions to run rules across a file
 */
export class DevSkimWorker
{
    public static settings : Settings;

    //directory that the extension rules live in.  
    private rulesDirectory: string;

    //collection of rules to run analysis with
    private analysisRules: Rule[];
    private tempRules: Object[];
   
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
        var problems : DevSkimProblem[] = [];
        var ignore : PathOperations = new PathOperations();

        //Before we do any processing, see if the file (or its directory) are in the ignore list.  If so
        //skip doing any analysis on the file
        if(!ignore.ignoreFile(documentURI,DevSkimWorker.settings.devskim.ignoreFilesList))
        {
            //find out what issues are in the current document
            problems = this.runAnalysis(documentContents,langID,documentURI);
            
            //remove any findings from rules that have been overriden by other rules
            problems = this.processOverrides(problems);
        }

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
        this.tempRules = [];
        this.analysisRules = [];

        //read the rules files recursively from the file system - get all of the .json files under the rules directory.  
        //first read in the default & custom directories, as they contain the required rules (i.e. exclude the "optional" directory)
        //and then do the inverse to populate the optional rules
        this.dir.readFiles(this.rulesDirectory, {	match: /.json$/ },
            (err, content, file, next) => 
            { 
                if (err) throw err;
                //Load the rules from files add the file path 
                var loadedRules : Rule[] = JSON.parse(content);
                for(var rule of loadedRules)
                {
                    rule.filepath = file;
                }

                this.tempRules = this.tempRules.concat(loadedRules);
                next();  
            },
            (err, files) => 
            {
                //now that we have all of the rules objects, lets clean them up and make
                //sure they are in a format we can use.  This will overwrite any badly formed JSON files
                //with good ones so that it passes validation in the future
                let validator : RuleValidator = new RuleValidator(this.rulesDirectory,__dirname);
                this.analysisRules = validator.validateRules(this.tempRules, DevSkimWorker.settings.devskim.validateRulesFiles);
                
                //don't need to keep this around anymore
                delete this.tempRules;
            }
        );          
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
           (ruleSeverity == DevskimRuleSeverity.BestPractice   && DevSkimWorker.settings.devskim.enableBestPracticeRules == true )            ||
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
     * the pattern type governs how we form the regex.  regex-word is wrapped in \b, string is as well, but is also escaped.
     * substring is not wrapped in \b, but is escapped, and regex/the default behavior is a vanilla regular expression
     * @param regexType regex|regex-word|string|substring
     * @param pattern 
     * @param modifiers modifiers to use when creating regex. can be null
     */
    public MakeRegex(regexType : string, pattern : string, modifiers : string[]) : RegExp
    {
        //create any regex modifiers
        let regexModifer = "g"; //always want to do a global search
        if(modifiers != undefined && modifiers != null)
        {
            for(let mod of modifiers)
            {
                //xregexp implemented dotmatchall as s instead of d
                if(mod == "d")
                {
                    regexModifer = regexModifer + "s";
                }
                else
                {
                    regexModifer = regexModifer + mod;
                }
                
            }
        }

        //now create a regex based on the 
        let XRegExp = require('xregexp');
        switch(regexType.toLowerCase())
        {            
            case 'regex-word': return XRegExp('\\b'+pattern+'\\b', regexModifer);    
            case 'string': return XRegExp('\\b'+XRegExp.escape(pattern)+'\\b', regexModifer);                            
            case 'substring': return XRegExp(XRegExp.escape(pattern), regexModifer);                              
            default: return XRegExp(pattern, regexModifer);                                                
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
            if(DevSkimWorker.settings.devskim.ignoreRulesList.indexOf(rule.id) == -1 &&  /*check to see if this is a rule the user asked to ignore */
               this.appliesToLangOrFile(langID, rule.applies_to, documentURI) &&
               this.RuleSeverityEnabled(ruleSeverity))
            {
                for(let patternIndex:number = 0; patternIndex < rule.patterns.length; patternIndex++)
                {                    
                    var matchPattern: RegExp = this.MakeRegex(rule.patterns[patternIndex].type,rule.patterns[patternIndex].pattern, rule.patterns[patternIndex].modifiers );
                    
                    let matchPosition: number = 0;
                    var match;

                    //go through all of the text looking for a match with the given pattern
                    while(match = XRegExp.exec(documentContents,matchPattern,matchPosition))
                    {
                        //if the rule doesn't contain any conditions, set it to an empty array to make logic later easier
                        if(rule.conditions == undefined || rule.conditions == null)
                        {
                            rule.conditions = [];
                        }
                        
                        //check to see if this finding has either been suppressed or reviewed (for manual-review rules)
                        //the suppressionFinding object contains a flag if the finding has been suppressed as well as
                        //range info for the ruleID in the suppression text so that hover text can be added describing
                        //the finding that was suppress
                        let suppressionFinding : DevSkimSuppressionFinding = DevSkimSuppression.isFindingCommented(match.index,documentContents, rule.id,ruleSeverity);
                        
                        //calculate what line we are on by grabbing the text before the match & counting the newlines in it
                        let lineStart: number = this.getLineNumber(documentContents,match.index);
                        let newlineIndex : number = (lineStart == 0 ) ? -1 : documentContents.substr(0,match.index).lastIndexOf("\n");
                        let columnStart : number =  match.index - newlineIndex - 1;                    
                        
                        //since a match may span lines (someone who broke a long function invocation into multiple lines for example)
                        //it's necessary to see if there are any newlines WITHIN the match so that we get the line the match ends on,
                        //not just the line it starts on.  Also, we use the substring for the match later when making fixes
                        let replacementSource : string = documentContents.substr(match.index, match[0].length);
                        let lineEnd : number = this.getLineNumber(replacementSource,replacementSource.length) + lineStart;  

                        let columnEnd = (lineStart == lineEnd) ?   
                            columnStart + match[0].length :
                            match[0].length - documentContents.substr(match.index).indexOf("\n") - 1;

                        let range : Range = Range.create(lineStart,columnStart,lineEnd, columnEnd);

                        //look for the suppression comment for that finding
                        if(!suppressionFinding.showFinding && 
                           this.matchIsInScope(langID, documentContents.substr(0, match.index), newlineIndex,rule.patterns[patternIndex].scope ) &&
                            this.matchesConditions(rule.conditions,match[0],documentContents,range))
                        {
                            let problem : DevSkimProblem = this.makeProblem(rule,this.MapRuleSeverity(rule.severity), range);

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
                            //this will look
                            let suppressionRange : Range = Range.create(lineStart,columnStart + suppressionFinding.ruleColumn,lineStart, columnStart + suppressionFinding.ruleColumn + rule.id.length);
                            let problem : DevSkimProblem = this.makeProblem(rule,DevskimRuleSeverity.WarningInfo, suppressionRange, range);
                            
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
     * Check to see if the finding occurs within the scope expected
     * see scope param for details
     * 
     * @private
     * @param {string} langID 
     * @param {string} docContentsToFinding 
     * @param {number} newlineIndex 
     * @param {string} scope values are code (finding should only occur in code), comment (finding should only occur code comments), or all (finding occurs anywhere)
     * @returns {boolean} 
     * @memberof DevSkimWorker
     */
    private matchIsInScope(langID : string, docContentsToFinding : string, newlineIndex : number, scope : string) : boolean
    {
        if(scope == "all")
            return true;

        //this is a stub.  Once the new schema is accepted this will check if the rule scope is all, code, or comment
        //and then check where the finding occured.  If the finding is in the expected scope it will return true, otherwise false
        let findingInComment : boolean = SourceComments.IsFindingInComment(langID,docContentsToFinding, newlineIndex);

        if((scope == "code" && !findingInComment) || (scope == "comment" && findingInComment))
            return true;

        return false;
    }

    /**
     * There are two conditions where this function gets called.  The first is to mark the code a rule triggered on and
     * in that case the rule, the severity of that rule, and the range of code for a specific finding found by that rule are
     * passed in.  suppressedFindingRange is ignored
     * 
     * The second instance is when decorating the ruleID in a suppression or review comment.  e.g.:
     *     //DevSkim ignore: DS123456 or //DevSkim reviewed:DS123456
     * DevSkim will create a problem to mark the DS123456 so that when moused over so other people looking through the code
     * know what was suppressed or reviewed.  In this instance we still pass in the rule.  a Rule severity of warningInfo should
     * be passed in for warningLevel.  problemRange should be the range of the "DSXXXXXX" text that should get the information squiggle
     * and suppressedFindingRange should be the range of the finding that was suppressed or reviewed by the comment.  This last
     * is important, as we need to save that info for later to cover overrides that also should be suppressed
     * @param {Rule} rule
     * @param {DevskimRuleSeverity} warningLevel 
     * @param {Range} problemRange 
     * @param {Range} [suppressedFindingRange] 
     */
    private makeProblem(rule: Rule, warningLevel : DevskimRuleSeverity, problemRange: Range, suppressedFindingRange?:Range) : DevSkimProblem
    {
        let problem : DevSkimProblem = new DevSkimProblem(rule.description,rule.name,
            rule.id, warningLevel, rule.recommendation, rule.rule_info, problemRange);

        if(suppressedFindingRange != undefined && suppressedFindingRange != null)
        {
            problem.suppressedFindingRange = suppressedFindingRange;
        }
        

        if(rule.overrides !== undefined && rule.overrides.length > 0)
        {
            problem.overrides = rule.overrides; 
        }

        return problem;
    }
    
    private matchesConditions(conditions : Condition[], findingContents: string, documentContents : string, findingRange : Range ) : boolean
    {

        return true;
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
        if(rule.fix_its !== undefined && rule.fix_its.length > 0)
        {   

            //recordCodeAction below acts like a stack, putting the most recently added rule first.
            //Since the very first fix in the rule is usually the prefered one (when there are multiples)
            //we want it to be first in the fixes collection, so we go through in reverse order 
            for(var fixIndex = rule.fix_its.length -1; fixIndex >= 0; fixIndex--) 
            {
                let fix : DevSkimAutoFixEdit = Object.create(null);
                //TO DO - support the rest of the pattern object
                var replacePattern = RegExp(rule.fix_its[fixIndex].pattern.pattern);
                try
                {
                    fix.text = replacementSource.replace(replacePattern,rule.fix_its[fixIndex].replacement); 
                    fix.fixName = "DevSkim: "+ rule.fix_its[fixIndex].name;
                    
                    fix.range = range;
                    fixes.push(fix);    
                }   
                catch(e)
                {
                    //console.log(e);
                }                        
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
        let overrideRemoved : boolean = false;

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
                    let range : Range = (problem.suppressedFindingRange != null) ? problem.suppressedFindingRange : problem.range;

                    if((matches !== undefined && matches != null && matches.length > 0) 
                        && problems[x].range.start.line == range.start.line && 
                           problems[x].range.start.character == range.start.character)
                        {
                            problems.splice(x,1);
                            overrideRemoved = true;
                        }
                }
                //clear the overrides so we don't process them on subsequent recursive calls to this
                //function
                problem.overrides = []

            }
        }
        // I hate recursion - it gives me perf concerns, but because we are modifying the 
        //array that we are iterating over we can't trust that we don't terminate earlier than
        //desired (because the length is going down while the iterator is going up), so run
        //until we don't modify anymore.  To make things from getting too ugly, we do clear a 
        //problem's overrides after we processed them, so we don't run it again in 
        //recursive calls
        if(overrideRemoved)
        {
            return this.processOverrides(problems)
        }
        else
        {
            return problems;
        }        
    }  

    /**
     * compares the languageID against all of the languages listed in the appliesTo array to check 
     * for a match.  If it matches, then the rule/pattern applies to the language being analyzed.  
     * 
     * Also checks to see if appliesTo has the specific file name for the current file
     * 
     * Absent any value in appliesTo we assume it applies to everything so return true
     * 
     * @param {string} languageID the vscode languageID for the current document
     * @param {string[]} appliesTo the array of languages a rule/pattern applies to
     * @param {string} documentURI the current document URI
     * @returns {boolean} true if it applies, false if it doesn't
     */
    private appliesToLangOrFile(languageID : string, appliesTo : string[], documentURI : string) : boolean
    {
        //if the parameters are empty, assume it applies.  Also, apply all the rules to plaintext documents	
        if(appliesTo != undefined && appliesTo != null && appliesTo.length > 0)
        {	
            for(let i: number = 0; i < appliesTo.length; i++)
            {
                //if the list of languages this rule applies to matches the current lang ID
                if(languageID !== undefined && languageID != null && languageID.toLowerCase() == appliesTo[i].toLowerCase() )
                {
                    return true;
                }
                else if(appliesTo[i].indexOf(".") != -1 /*applies to is probably a specific file name instead of a langID*/
                    && documentURI.toLowerCase().indexOf(appliesTo[i].toLowerCase()) != -1) /*and its in the current doc URI*/
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