/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * 
 * This file contains the actual meat and potatoes of analysis.  The DevSkimWorker class does 
 * the actual work of analyzing data it was given
 * 
 * Most of the type declarations representing things like the rules used to analyze a file, and 
 * problems found in a file, are in devskimObjects.ts
 * 
 * ------------------------------------------------------------------------------------------ */
import { DevSkimAutoFixEdit, DevskimRuleSeverity, IDevSkimSettings } from "../devskimObjects";
import { Range } from 'vscode-languageserver';
import { SourceContext } from "./sourceContext";
import { DocumentUtilities } from './document';

/**
 * Class to handle Suppressions (i.e. comments that direct devskim to ignore a finding for either a period of time or permanently)
 * a suppression in practice would look something like this (assuming a finding in a C file):
 * 
 *      strcpy(a,b); //DevSkim: ignore DS185832 until 2016-12-28
 * 
 * The comment after strcpy (which DevSkim would normally flag) tells devskim to ignore that specific finding (as Identified by the DS185832 - the strcpy rule)
 * until 2016-12-28.  prior to that date DevSkim shouldn't flag the finding. After that date it should.  This is an example of a temporary suppression, and is used
 * when the dev wants to fix something but is busy with other work at the moment.  If the date is omitted DevSkim will never flag that finding again (provided the 
 * suppression comment remains next to the finding).
 * 
 * The logic to determine if a finding should be suppressed, as well as the logic to create the code action to add a suppression exist in this class
 * @export
 * @class DevSkimSuppression
 */
export class DevSkimSuppression
{
    public static suppressionRegEx: RegExp = /DevSkim: ignore ([^\s]+)(?:\suntil ((\d{4})-(\d{2})-(\d{2})))?/i;
    public static reviewRegEx: RegExp = /DevSkim: reviewed ([^\s]+)(?:\son ((\d{4})-(\d{2})-(\d{2})))?/i;

    /**
     * Instantiate a Suppressions object.  This is necessary to insert a new suppression, but if 
     * the only action necessary is checking if a finding is already suppressed, the static method
     * isFindingCommented() should be used without instantiating the class
     * @param dsSettings - the current settings, necessary to determine preferred comment style and reviewer name
     */
    constructor(public dsSettings: IDevSkimSettings)
    {

    }

    /**
    * Create an array of Code Action(s) for the user to invoke should they want to suppress or mark a finding reviews
    * 
    * @param {string} ruleID the rule to be suppressed
    * @param {string} documentContents the current document
    * @param {number} startCharacter the start point of the finding
    * @param {number} lineStart the line the finding starts on
    * @param {string} langID the language for the file according to VSCode (so that we can get the correct comment syntax)
    * @param {DevskimRuleSeverity} ruleSeverity (option) the severity of the rule - necessary if the rule is a Manual Review rule, since slightly different
    *                                           logic is employed because of the different comment string.  If omitted, assume a normal suppression 
    * @returns {DevSkimAutoFixEdit[]} an array of code actions for suppressions (usually "Suppress X Days" and "Suppress Indefinitely")
    * 
    * @memberOf DevSkimSuppression
    */
    public createActions(ruleID: string, documentContents: string, startCharacter: number, lineStart: number,
        langID: string, ruleSeverity: DevskimRuleSeverity): DevSkimAutoFixEdit[]
    {
        let codeActions: DevSkimAutoFixEdit[] = [];
        let isReviewRule = (ruleSeverity !== undefined
            && ruleSeverity != null
            && ruleSeverity == DevskimRuleSeverity.ManualReview);

        //if this is a suppression and temporary suppressions are enabled (i.e. the setting for suppression duration is > 0) then
        //first add a code action for a temporary suppression
        if (!isReviewRule && this.dsSettings.suppressionDurationInDays > 0)
        {
            codeActions.push(this.addAction(ruleID, documentContents, startCharacter, lineStart,
                langID, isReviewRule, this.dsSettings.suppressionDurationInDays));
        }

        //now either add a code action to mark this reviewed, or to suppress the finding indefinitely
        codeActions.push(this.addAction(ruleID, documentContents, startCharacter, lineStart, langID, isReviewRule));
        return codeActions;
    }

    /**
     * Create a Code Action for the user to invoke should they want to suppress a finding
     * 
     * @private
     * @param {string}  ruleID the rule to be suppressed
     * @param {string}  documentContents the current document
     * @param {number}  startCharacter the start point of the finding
     * @param {number}  lineStart the line the finding starts on
     * @param {string}  langID the language for the file according to VSCode (so that we can get the correct comment syntax)
     * @param {boolean} isReviewRule true if this is a manual review rule - the text is slightly different if it is
     * @param {number}  daysOffset the number of days in the future a time based suppression should insert, comes from the user settings
     * @returns {DevSkimAutoFixEdit[]} an array of code actions for suppressions (usually "Suppress X Days" and "Suppress Indefinitely")
     * 
     * @memberOf DevSkimSuppression
     */
    private addAction(ruleID: string, documentContents: string, startCharacter: number, lineStart: number,
        langID: string, isReviewRule: boolean, daysOffset: number = -1): DevSkimAutoFixEdit
    {
        let action: DevSkimAutoFixEdit = Object.create(null);
        let regex: RegExp = (isReviewRule)
            ? DevSkimSuppression.reviewRegEx
            : DevSkimSuppression.suppressionRegEx;

        this.setActionFixName(isReviewRule, action, ruleID, daysOffset);

        //make the day in the future that a time based expression will expire
        const date = new Date();
        if (!isReviewRule && daysOffset > 0)
        {
            date.setDate(date.getDate() + daysOffset);
        }

        //find the end of the current line of the finding
        let XRegExp = require('xregexp');
        let range: Range;

        let match = XRegExp.exec(documentContents, DocumentUtilities.newlinePattern, startCharacter);
        if (match)
        {
            let columnStart = (lineStart == 0)
                ? match.index
                : match.index - documentContents.substr(0, match.index).lastIndexOf("\n") - 1;
            range = Range.create(lineStart, columnStart, lineStart, columnStart + match[0].length);
            documentContents = documentContents.substr(0, match.index);
        }
        else
        {
            //replace with end of file
            let columnStart = (lineStart == 0)
                ? documentContents.length
                : documentContents.length - documentContents.lastIndexOf("\n") - 1;
            range = Range.create(lineStart, columnStart, lineStart, columnStart);
        }

        // if there is an existing suppression that has expired (or there for a different issue)
        // then it needs to be replaced
        let existingSuppression : DevSkimSuppressionFinding;
        let suppressionStart : number = startCharacter;
        let suppressionLine : number = lineStart;

        existingSuppression= DevSkimSuppression.isFindingCommented(startCharacter,documentContents,ruleID,langID, isReviewRule, true);
        
        if (existingSuppression.showSuppressionFinding)
        {
            suppressionStart = DocumentUtilities.GetDocumentPosition(documentContents, existingSuppression.suppressionRange.start.line);
            suppressionLine = existingSuppression.suppressionRange.start.line;
        }
        
        match = XRegExp.exec(documentContents, regex, suppressionStart);
        if (match)
        {
            let columnStart: number = (suppressionLine == 0) ? match.index : match.index - documentContents.substr(0, match.index).lastIndexOf("\n") - 1;
            range = Range.create(suppressionLine, columnStart, suppressionLine, columnStart + match[0].length);
            if (match[1] !== undefined && match[1] != null && match[1].length > 0)
            {
                if (match[1].indexOf(ruleID) >= 0)
                {
                    ruleID = match[1];
                }
                else
                {
                    ruleID = ruleID + "," + match[1];
                }
            }
            if (isReviewRule || daysOffset > 0)
            {
                action.text = this.makeActionString(ruleID, isReviewRule, date);
            }
            else
            {
                action.text = this.makeActionString(ruleID, isReviewRule);
            }
        }

        // if there is not an existing suppression then we need to find the newline
        // and insert the suppression just before the newline
        else
        {
            let StartComment: string = "";
            let EndComment : string = "";

            //select the right comment type, based on the user settings and the
            //comment capability of the programming language
            if(this.dsSettings.suppressionCommentStyle == "block")
            {
                StartComment = SourceContext.GetBlockCommentStart(langID);
                EndComment = SourceContext.GetBlockCommentEnd(langID);
                if (!StartComment || StartComment.length < 1 || !EndComment || EndComment.length < 1)
                {
                    StartComment = SourceContext.GetLineComment(langID);
                }                   
            }
            else
            {
                StartComment = SourceContext.GetLineComment(langID);
                if (!StartComment || StartComment.length < 1)
                {
                    StartComment = SourceContext.GetBlockCommentStart(langID);
                    EndComment = SourceContext.GetBlockCommentEnd(langID);
                }                
            }
            
            

            if (isReviewRule || daysOffset > 0)
            {
                action.text = " " + StartComment + this.makeActionString(ruleID, isReviewRule, date) + " " + EndComment;
            }
            else
            {
                action.text = " " + StartComment + this.makeActionString(ruleID, isReviewRule) + " " + EndComment;
            }
        }
        action.range = range;
        return action;
    }

    /**
     * Create the string that goes into the IDE UI to allow a user to automatically create a suppression
     * @param isReviewRule True if this is a manual review rule - the text is slightly different if it is
     * @param action the associated action that is triggered when the user clicks on this name in the IDE UI
     * @param ruleID the rule id for the current finding
     * @param daysOffset how many days to suppress the finding, if this 
     */
    private setActionFixName(isReviewRule: boolean, action: DevSkimAutoFixEdit, ruleID: string, daysOffset: number = -1)
    {
        // These are the strings that appear on the light bulb menu to the user.
        // @todo: make localized.  Right now these are the only hard coded strings in the app.
        //  The rest come from the rules files and we have plans to make those localized as well
        if (isReviewRule)
        {
            action.fixName = `DevSkim: Mark ${ruleID} as Reviewed`;
        } 
        else if (daysOffset > 0)
        {
            action.fixName = `DevSkim: Suppress ${ruleID} for ${daysOffset.toString(10)} days`;
        } 
        else
        {
            action.fixName = `DevSkim: Suppress ${ruleID} permanently`;
        }
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
     * @param {DevskimRuleSeverity} ruleSeverity (option) the severity of the rule - necessary if the rule is a Manual Review rule, since slightly different
     *                                           logic is employed because of the different comment string.  If omitted, assume a normal suppression 
     * @returns {boolean} true if this finding should be ignored, false if it shouldn't
     * 
     * @memberOf DevSkimWorker
     */
    public static isFindingCommented(startPosition: number, documentContents: string, ruleID: string, langID : string,
        isReviewRule: boolean, evenExpired: boolean = false): DevSkimSuppressionFinding
    {
        let XRegExp = require('xregexp');
        let regex: RegExp = (isReviewRule) ? DevSkimSuppression.reviewRegEx : DevSkimSuppression.suppressionRegEx;
        let line : string;
        let returnFinding : DevSkimSuppressionFinding;

        //its a little ugly to have a local function, but this is a convenient way of recalling this code repeatedly
        //while not exposing it to any other function.  This code checks to see if a suppression for the current issue
        //is present in the line of code being analyzed. It also allows the use of the current Document without increasing
        //its memory footprint, given that this code has access to the parent function scope as well
        /**
         * Check if the current finding is suppressed on the line of code provided
         * @param line the line of code to inspect for a suppression
         * @param startPosition where in the document the line starts (for calculating line number)
         * 
         * @returns {DevSkimSuppressionFinding} a DevSkimSuppressionFinding - this object is used to highlight the DS#### in the suppression
         *                                      so that mousing over it provides details on what was suppressed
         */
        let suppressionCheck = (line: string, startPosition: number) : DevSkimSuppressionFinding =>
        {
            let finding: DevSkimSuppressionFinding = Object.create(null);
            finding.showSuppressionFinding = false;
            
            //look for the suppression comment
            let match = XRegExp.exec(line, regex);
            if (match)
            {
                let suppressionIndex : number = match[0].indexOf(ruleID);
                if (suppressionIndex > -1)
                {
                    let lineStart : number = DocumentUtilities.GetLineNumber(documentContents,startPosition)
                    suppressionIndex += match.index;
                    finding.suppressionRange = Range.create(lineStart, suppressionIndex, lineStart, suppressionIndex + ruleID.length);
                    finding.noRange = false;
                    if (!isReviewRule && match[2] !== undefined && match[2] != null && match[2].length > 0)
                    {
                        const untilDate: number = Date.UTC(match[3], match[4] - 1, match[5], 0, 0, 0, 0);
                        //we have a match of the rule, and haven't yet reached the "until" date, so ignore finding
                        //if the "until" date is less than the current time, the suppression has expired and we should not ignore
                        if (untilDate > Date.now() || evenExpired) 
                        {
                            finding.showSuppressionFinding = true;
                        }
                    }
                    else //we have a match with the rule (or all rules), and no "until" date, so we should ignore this finding
                    {
                        finding.showSuppressionFinding = true;
                    }
                }
                else if (match[0].indexOf("all") > -1)
                {
                    finding.showSuppressionFinding = true;
                    finding.noRange = true;
                }
            }
            return finding;
        }        
        
        
        let lineNumber : number = DocumentUtilities.GetLineNumber(documentContents,startPosition);
        startPosition = DocumentUtilities.GetDocumentPosition(documentContents, lineNumber);
        
        line = DocumentUtilities.GetDocumentRestOfLine(documentContents, startPosition);
        returnFinding = suppressionCheck(line, startPosition); 
        
        //we didn't find a suppression on the same line, but it might be a comment on the previous line
        if(!returnFinding.showSuppressionFinding)
        { 
            lineNumber--;           
            while(lineNumber > -1)            
            {                
                //get the start position of the current line we are looking for a comment in           
                startPosition = DocumentUtilities.GetDocumentPosition(documentContents, lineNumber);
                
                //extract the line, and trim off the trailing space
               // let match = XRegExp.exec(documentContents, DocumentUtilities.newlinePattern, startPosition);
                //let secondLastMatch = (lineNumber -1 > -1) ? XRegExp.exec(documentContents, DocumentUtilities.newlinePattern, DocumentUtilities.GetDocumentPosition(documentContents, lineNumber -1)) : false;
                //let lastMatch = (secondLastMatch) ? secondLastMatch.index : startPosition;
                //let subDoc : string = documentContents.substr(0, (match) ? match.index : startPosition);
                let subDoc : string = DocumentUtilities.GetDocumentLineFromPosition(documentContents, startPosition);

                //check if the last line is a full line comment
                if(SourceContext.IsLineCommented(langID, subDoc))
                {                    
                    returnFinding = suppressionCheck(subDoc, startPosition); 
                    if(returnFinding.showSuppressionFinding)
                    {
                        break;
                    }
                }
                //check if its part of a block comment
                else if(SourceContext.IsLineBlockCommented(langID, documentContents, lineNumber))
                {
                    let commentStart : number = SourceContext.GetStartOfLastBlockComment(langID,documentContents.substr(0,startPosition + subDoc.length));
                    let doc : string = DocumentUtilities.GetDocumentLineFromPosition(documentContents, commentStart).trim();

                    if(SourceContext.GetStartOfLastBlockComment(langID,doc) == 0)
                    {
                        returnFinding = suppressionCheck(subDoc, commentStart); 
                        if(returnFinding.showSuppressionFinding)
                        {
                            break;
                        }
                    }
                }                
                else
                {
                    break;
                }
                lineNumber--;  
            }
        }

        return returnFinding;
    }

    /**
     * Generate the string that gets inserted into a comment for a suppression
     *
     * @private
     * @param {string} ruleIDs the DevSkim Rule ID that is being suppressed or reviewed (e.g. DS102158). Can be a list of IDs, comma separated (eg. DS102158,DS162445) if suppressing
     *                         multiple issues on a single line
     * @param {boolean} isReviewRule different strings are used if this is a code review rule versus a normal rule; one is marked reviewed and the other suppressed
     * @param {Date} date (optional) if this is a manual review rule (i.e. rule someone has to look at) this should be today's date, signifying that the person has reviewed the finding today.
     *                    if it is a suppression (i.e. a normal finding) this is the date that they would like to be reminded of the finding.  For example, if someone suppresses a finding for
     *                    thirty days this should be today + 30 days.  If omitted for a suppression the finding will be suppressed permanently
     * @returns {string}
     *
     * @memberOf DevSkimSuppression
     */
    private makeActionString(ruleIDs: string, isReviewRule: boolean, date?: Date): string
    {
        let actionString: string = (isReviewRule) ? "DevSkim: reviewed " : "DevSkim: ignore ";

        actionString += ruleIDs;
        if (date !== undefined && date != null && (date.getTime() > Date.now() || isReviewRule))
        {
            //both month and day should be in two digit format, so prepend a "0".  Also, month is 0 indexed so needs to be incremented
            //to be in a format that reflects how months are actually represented by humans (and every other programming language)
            const day: string = (date.getDate() > 9) ? date.getDate().toString() : "0" + date.getDate().toString();
            const month: string = ((date.getMonth() + 1) > 9) ? (date.getMonth() + 1).toString(10) : "0" + (date.getMonth() + 1).toString(10);

            actionString = (isReviewRule) ? actionString + " on " : actionString + " until ";
            actionString = actionString + date.getFullYear() + "-" + month + "-" + day;
        }
        if (isReviewRule && this.dsSettings.manualReviewerName !== undefined
            && this.dsSettings.manualReviewerName != null
            && this.dsSettings.manualReviewerName.length > 0)
        {
            actionString = `${actionString} by ${this.dsSettings.manualReviewerName}`;
        }
        return actionString;
    }
}

export class DevSkimSuppressionFinding
{
    public showSuppressionFinding: boolean;
    public suppressionRange: Range;
    public noRange : boolean;
}
