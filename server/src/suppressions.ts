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
import {Settings, DevSkimSettings,AutoFix, DevSkimAutoFixEdit} from "./devskimObjects";
import { Range } from 'vscode-languageserver';
import {DevSkimWorker} from "./devskimWorker";

/**
 * Class to handle Suppressions (i.e. comments that direct devskim to ignore a finding for either a period of time or permanently)
 * a suppression in practice would looke something like this (assuming a finding in a C file):
 * 
 *      strcpy(a,b); //DevSkim: ignore DS185832 until 2016-12-28
 * 
 * The comment after strcpy (which DevSkim would normally flag) tells devskim to ignore that specific finding (as Identified by the DS185832 - the strcpy rule)
 * until 2016-12-28.  prior to that date DevSkim shouldn't flag the finding. After that date it should.  This is an example of a temporary suppression, and is used
 * when the dev wants to fix something but is busy with other work at the moment.  If the date is ommitted DevSkim will never flag that finding again (provided the 
 * suppression comment remains next to the finding).
 * 
 * The logic to determine if a finding should be suppressed, as well as the logic to create the code action to add a suppression exist in this class
 * @export
 * @class DevSkimSuppression
 */
export class DevSkimSuppression
{
    public static suppressionRegEx : RegExp = /DevSkim: ignore ([^\s]+)(?:\suntil ((\d{4})-(\d{2})-(\d{2})))?/i;
    public static reviewRegEx      : RegExp = /DevSkim: reviewed ([^\s]+)(?:\son ((\d{4})-(\d{2})-(\d{2})))?/i;

    /**
     * Retrieve the characters to start a comment in the given language (ex. "//" for C/C++/C#/Etc. )
     * 
     * @private
     * @param {string} langID VSCode language identifier (should be lower case)
     * @returns {string} the starting characters to spin up a comment
     * 
     * @memberOf DevSkimSuppression
     */
    private GetCommentStart(langID : string) : string
    {
        switch(langID)
        {
            case "vb": return "'";

            case "lua": return "--";

            case "clojure": return ";;";           

            case "yaml":
            case "shellscript":
            case "ruby":
            case "powershell":
            case "coffeescript":
            case "python":
            case "r":
            case "perl6":
            case "perl": return "#";

            case "jade": return "//-";

            case "c":
            case "cpp":
            case "csharp":
            case "fsharp":
            case "groovy":
            case "php":
            case "javascript":
            case "javascriptreact":
            case "typescript":
            case "typescriptreact":
            case "java":
            case "objective-c":
            case "swift":
            case "go":
            case "rust":
            default: return "//";
        }
    }

    /**
     * Retrieves any closing comment tags for the given language, for those languages that only support block style comments
     * 
     * @private
     * @param {string} langID VSCode ID for the language (should be lower case)
     * @returns {string} closing comment characters, if any (empty string if not)
     * 
     * @memberOf DevSkimSuppression
     */
    private GetCommentEnd(langID : string) : string
    {
        //currently none of the supported languages require a closing tag, but this is maintained in case that changes
        return "";
    }

    /**
     * Generate the string that gets inserted into a comment for a suppression
     * 
     * @private
     * @param {string} ruleIDs the DevSkim Rule ID that is being suppressed (e.g. DS102158). Can be a list of IDs, comma seperated (eg. DS102158,DS162445) if suppressing
     *                         multiple issues on a single line
     * @param {Date} untilDate (optional) Date the suppression is valid for, if valid for a limited time.  If ommitted suppression lasts forever
     * @returns {string} 
     * 
     * @memberOf DevSkimSuppression
     */
    private makeSuppressionString(ruleIDs : string, untilDate : Date) : string
    {
        let suppressionString : string = "DevSkim: ignore " + ruleIDs;
        if(untilDate !== undefined && untilDate != null && untilDate.getTime() > Date.now())
        {
            //both month and day should be in two digit format, so prepend a "0".  Also, month is 0 indexed so needs to be incremented 
            //to be in a format that reflects how months are actually represented by humans (and every other programming language)
            var day : string = (untilDate.getDate() > 9) ? untilDate.getDate().toString() : "0" + untilDate.getDate().toString();
            var month : string = ((untilDate.getMonth() + 1) > 9) ? (untilDate.getMonth() + 1).toString(10) : "0" + (untilDate.getMonth() + 1).toString(10);

            suppressionString = suppressionString + " until " + untilDate.getFullYear() + "-" + month + "-" + day;
        }
        return suppressionString;
    }  

    /**
     * 
     * 
     * @private
     * @param {string} ruleIDs
     * @returns {string}
     * 
     * @memberOf DevSkimSuppression
     */
    private makeReviewString(ruleIDs : string) : string
    {
        let reviewString : string = "DevSkim: reviewed " + ruleIDs;
        var today : Date = new Date();

        //both month and day should be in two digit format, so prepend a "0".  Also, month is 0 indexed so needs to be incremented 
        //to be in a format that reflects how months are actually represented by humans (and every other programming language)
        var day : string = (today.getDate() > 9) ? today.getDate().toString() : "0" + today.getDate().toString();
        var month : string = ((today.getMonth() + 1) > 9) ? (today.getMonth() + 1).toString(10) : "0" + (today.getMonth() + 1).toString(10);

        reviewString = reviewString + " on " + today.getFullYear() + "-" + month + "-" + day;
        
        return reviewString;        

    }

    /**
     * Create a Code Action(s) for the user to invoke should they want to suppress a finding
     * 
     * @param {string} ruleID the rule to be suppressed
     * @param {string} documentContents the current document
     * @param {number} startCharacter the start point of the finding
     * @param {number} lineStart the line the finding starts on
     * @param {string} langID the language for the file according to VSCode (so that we can get the correct comment syntax)
     * @returns {DevSkimAutoFixEdit[]} an array of code actions for suppressions (usually "Suppress X Days" and "Suppress Indefinitely")
     * 
     * @memberOf DevSkimSuppression
     */
    public addSuppressionAction(ruleID : string, documentContents : string, startCharacter : number, lineStart : number, langID : string) : DevSkimAutoFixEdit[]
    {
        let suppressionActions : DevSkimAutoFixEdit[] = [];
        let temporarySuppression : DevSkimAutoFixEdit = Object.create(null);
        let permanentSuppression : DevSkimAutoFixEdit = Object.create(null);
        
        let suppressionDays : number = DevSkimWorker.settings.devskim.suppressionDurationInDays;

        //these are the strings that appear on the lightbulb menu to the user.  
        //<TO DO> make this localizable.  Right now these are the only hard coded strings in the app.  The rest come from the rules files
        //and we have plans to make those localizable as well  
        temporarySuppression.fixName = "DevSkim: Suppress issue for "+suppressionDays.toString(10)+" days";
        permanentSuppression.fixName = "DevSkim: Suppress issue permenantly";

        var suppressionDate = new Date();
        suppressionDate.setDate(suppressionDate.getDate() + suppressionDays);

        let XRegExp = require('xregexp');
        let range : Range;
        var match;

        //if there is an existing suppression that has expired (or is there for a different issue) then it needs to be replaced
        if(match = XRegExp.exec(documentContents,DevSkimSuppression.suppressionRegEx,startCharacter))
        {
            let columnStart : number = (lineStart == 0) ? match.index : match.index -  documentContents.substr(0,match.index).lastIndexOf("\n") -1;
            range = Range.create(lineStart,columnStart ,lineStart, columnStart + match[0].length);
            if(match[1] !== undefined && match[1] != null && match[1].length > 0)
            {
                if(match[1].indexOf(ruleID) >= 0)
                {
                    ruleID = match[1];
                }
                else
                {
                    ruleID = ruleID + "," + match[1];
                }                
            }

            temporarySuppression.text = this.makeSuppressionString(ruleID,suppressionDate);
            permanentSuppression.text = this.makeSuppressionString(ruleID,null);              
        }
        //if there is not an existing suppression then we need to find the newline and insert the suppression just before the newline
        else
        {
            let newlinePattern : RegExp = /(\r\n|\n|\r)/gm;           

            if(match = XRegExp.exec(documentContents,newlinePattern,startCharacter))
            {             
                let columnStart : number = (lineStart == 0) ? match.index : match.index -  documentContents.substr(0,match.index).lastIndexOf("\n") -1;
                range = Range.create(lineStart,columnStart ,lineStart, columnStart + match[0].length);                
            }
            else
            {
                //replace with end of file
                range = Range.create(lineStart,0 ,lineStart,1);
            }            
            temporarySuppression.text = " " + this.GetCommentStart(langID) + this.makeSuppressionString(ruleID,suppressionDate) + this.GetCommentEnd(langID);
            permanentSuppression.text = " " + this.GetCommentStart(langID) + this.makeSuppressionString(ruleID,null) + this.GetCommentEnd(langID);           
        }

        temporarySuppression.range = range;
        permanentSuppression.range = range;

        //if the temporary suppression duration is greater than 0, enable that code action
        if(suppressionDays > 0)
        {
            suppressionActions.push(temporarySuppression);
        }
        
        suppressionActions.push(permanentSuppression);
        return suppressionActions;
    }   

    /**
     * Create a Code Action(s) for the user to invoke should they want to suppress a finding
     * 
     * @param {string} ruleID the rule to be suppressed
     * @param {string} documentContents the current document
     * @param {number} startCharacter the start point of the finding
     * @param {number} lineStart the line the finding starts on
     * @param {string} langID the language for the file according to VSCode (so that we can get the correct comment syntax)
     * @returns {DevSkimAutoFixEdit[]} an array of code actions for suppressions (usually "Suppress X Days" and "Suppress Indefinitely")
     * 
     * @memberOf DevSkimSuppression
     */
    public addReviewAction(ruleID : string, documentContents : string, startCharacter : number, lineStart : number, langID : string) : DevSkimAutoFixEdit
    {
        let reviewAction : DevSkimAutoFixEdit = Object.create(null);
              

        //these are the strings that appear on the lightbulb menu to the user.  
        //<TO DO> make this localizable.  Right now these are the only hard coded strings in the app.  The rest come from the rules files
        //and we have plans to make those localizable as well  
        reviewAction.fixName = "DevSkim: Mark Finding as Reviewed";

        let XRegExp = require('xregexp');
        let range : Range;
        var match;

        //if there is an existing suppression that has expired (or is there for a different issue) then it needs to be replaced
        if(match = XRegExp.exec(documentContents,DevSkimSuppression.reviewRegEx,startCharacter))
        {
            let columnStart : number = (lineStart == 0) ? match.index : match.index -  documentContents.substr(0,match.index).lastIndexOf("\n") -1;
            range = Range.create(lineStart,columnStart ,lineStart, columnStart + match[0].length);
            if(match[1] !== undefined && match[1] != null && match[1].length > 0)
            {
                if(match[1].indexOf(ruleID) >= 0)
                {
                    ruleID = match[1];
                }
                else
                {
                    ruleID = ruleID + "," + match[1];
                }                
            }         
            reviewAction.text = this.makeReviewString(ruleID);            
        }
        //if there is not an existing suppression then we need to find the newline and insert the suppression just before the newline
        else
        {
            let newlinePattern : RegExp = /(\r\n|\n|\r)/gm;           

            if(match = XRegExp.exec(documentContents,newlinePattern,startCharacter))
            {             
                let columnStart : number = (lineStart == 0) ? match.index : match.index -  documentContents.substr(0,match.index).lastIndexOf("\n") -1;
                range = Range.create(lineStart,columnStart ,lineStart, columnStart + match[0].length);                
            }
            else
            {
                //replace with end of file
                let columnStart : number = documentContents.length - startCharacter;
                range = Range.create(lineStart,columnStart ,lineStart,columnStart);
            }  
            reviewAction.text = " " + this.GetCommentStart(langID) + this.makeReviewString(ruleID) + this.GetCommentEnd(langID);              
        }
        reviewAction.range = range;

        return reviewAction;
    }       

    /**
     * Determine if there is a suppression comment in the line of the finding, if it
     * corresponds to the rule that triggered the finding, and if there is a date the suppression
     * expires.  Return true if the finding should be suppressed for now, so that it isn't added
     * to the list of diagnostics
     * 
     * @private
     * @param {number} startPosition the start of the finding in the document (#of chars from the start)
     * @param {string} documentContents the content containing the finding
     * @param {string} ruleID the rule that triggered the finding
     * @returns {boolean} true if this finding should be ignored, false if it shouldn't
     * 
     * @memberOf DevSkimWorker
     */
    public static isFindingSuppressed(startPosition : number, documentContents: string, ruleID : string) : boolean
    {
        let XRegExp = require('xregexp');
        let match;
        let newlinePattern : RegExp = /(\r\n|\n|\r)/gm;
        

        if(match = XRegExp.exec(documentContents,newlinePattern,startPosition))
        {
            let line = documentContents.substr(startPosition, match.index - startPosition);
            let ignoreMatch;

            //look for the suppression comment
            if(ignoreMatch = XRegExp.exec(line,DevSkimSuppression.suppressionRegEx))
            {
                if(ignoreMatch[0].indexOf(ruleID) > -1 || ignoreMatch[0].indexOf("all") > -1 )
                {
                    line = line.substr(ignoreMatch.index);

                    if(ignoreMatch[2] !== undefined && ignoreMatch[2] != null && ignoreMatch[2].length >0)
                    {
                        var untilDate : number = Date.UTC(ignoreMatch[3],ignoreMatch[4]-1,ignoreMatch[5],0,0,0,0);
                        //we have a match of the rule, and haven't yet reached the "until" date, so ignore finding
                        //if the "until" date is less than the current time, the suppression has expired and we should not ignore
                        if (untilDate > Date.now()) 
                        {
                            return true;
                        }
                    }
                    else //we have a match with the rule (or all rules), and now "until" date, so we should ignore this finding
                    {
                        return true;
                    }                    
                }                
            }
        }

        return false;
    }      

  /**
     * Determine if there is a review comment in the line of a manual review finding, if it
     * corresponds to the rule that triggered the finding.  
     * Return true if the finding has been reviewed, so that it isn't added
     * to the list of diagnostics
     * 
     * @private
     * @param {number} startPosition the start of the finding in the document (#of chars from the start)
     * @param {string} documentContents the content containing the finding
     * @param {string} ruleID the rule that triggered the finding
     * @returns {boolean} true if this finding should be ignored, false if it shouldn't
     * 
     * @memberOf DevSkimWorker
     */
    public static isFindingReviewed(startPosition : number, documentContents: string, ruleID : string) : boolean
    {
        let XRegExp = require('xregexp');
        let match;
        let newlinePattern : RegExp = /(\r\n|\n|\r)/gm;
        

        if(match = XRegExp.exec(documentContents,newlinePattern,startPosition))
        {
            let line = documentContents.substr(startPosition, match.index - startPosition);
            let ignoreMatch;

            //look for the review comment
            if(ignoreMatch = XRegExp.exec(line,DevSkimSuppression.reviewRegEx))
            {
                if(ignoreMatch[0].indexOf(ruleID) > -1 || ignoreMatch[0].indexOf("all") > -1 )
                {
                        return true;
                }                
            }
        }

        return false;
    }          

}