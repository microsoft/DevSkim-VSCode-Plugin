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
import { DevSkimAutoFixEdit, DevskimRuleSeverity, IDevSkimSettings } from "./devskimObjects";
import { Range } from 'vscode-languageserver';
import { SourceComments } from "./comments";

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
    *                                           logic is employed because of the different comment string.  If ommitted, assume a normal suppression 
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
     * @param {string} ruleID the rule to be suppressed
     * @param {string} documentContents the current document
     * @param {number} startCharacter the start point of the finding
     * @param {number} lineStart the line the finding starts on
     * @param {string} langID the language for the file according to VSCode (so that we can get the correct comment syntax)
     * @param isReviewRule @todo
     * @param daysOffset @todo
     * @returns {DevSkimAutoFixEdit[]} an array of code actions for suppressions (usually "Suppress X Days" and "Suppress Indefinitely")
     * 
     * @memberOf DevSkimSuppression
     */
    private addAction(ruleID: string, documentContents: string, startCharacter: number, lineStart: number,
        langID: string, isReviewRule: boolean, daysOffset?: number): DevSkimAutoFixEdit
    {
        let action: DevSkimAutoFixEdit = Object.create(null);
        let isDateSet = (daysOffset && daysOffset > 0);
        let regex: RegExp = (isReviewRule)
            ? DevSkimSuppression.reviewRegEx
            : DevSkimSuppression.suppressionRegEx;

        this.setActionFixName(isReviewRule, action, ruleID, isDateSet, daysOffset);

        const date = new Date();
        if (!isReviewRule && isDateSet)
        {
            date.setDate(date.getDate() + daysOffset);
        }

        let XRegExp = require('xregexp');
        let range: Range;
        let newlinePattern = /(\r\n|\n|\r)/gm;

        let match = XRegExp.exec(documentContents, newlinePattern, startCharacter);
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
        match = XRegExp.exec(documentContents, regex, startCharacter);
        if (match)
        {
            let columnStart: number = (lineStart == 0) ? match.index : match.index - documentContents.substr(0, match.index).lastIndexOf("\n") - 1;
            range = Range.create(lineStart, columnStart, lineStart, columnStart + match[0].length);
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
            if (isReviewRule || isDateSet)
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
            let StartComment: string = SourceComments.GetLineComment(langID);
            let EndComment = "";
            if (!StartComment || StartComment.length < 1)
            {
                StartComment = SourceComments.GetBlockCommentStart(langID);
                EndComment = SourceComments.GetBlockCommentEnd(langID);
            }

            if (isReviewRule || isDateSet)
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

    private setActionFixName(isReviewRule: boolean, action: DevSkimAutoFixEdit, ruleID: string, isDateSet, daysOffset: number)
    {
        // These are the strings that appear on the lightbulb menu to the user.
        // @todo: make localized.  Right now these are the only hard coded strings in the app.
        //  The rest come from the rules files and we have plans to make those localized as well
        if (isReviewRule)
        {
            action.fixName = `DevSkim: Mark ${ruleID} as Reviewed`;
        } 
        else if (isDateSet)
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
     *                                           logic is employed because of the different comment string.  If ommitted, assume a normal suppression 
     * @returns {boolean} true if this finding should be ignored, false if it shouldn't
     * 
     * @memberOf DevSkimWorker
     */
    public static isFindingCommented(startPosition: number, documentContents: string, ruleID: string,
        ruleSeverity?: DevskimRuleSeverity): DevSkimSuppressionFinding
    {
        let XRegExp = require('xregexp');
        let newlinePattern = /(\r\n|\n|\r)/gm;
        let isReviewRule = (ruleSeverity !== undefined && ruleSeverity != null && ruleSeverity == DevskimRuleSeverity.ManualReview);
        let regex: RegExp = (isReviewRule) ? DevSkimSuppression.reviewRegEx : DevSkimSuppression.suppressionRegEx;
        let line;
        let finding: DevSkimSuppressionFinding = Object.create(null);
        finding.showFinding = false;

        let match = XRegExp.exec(documentContents, newlinePattern, startPosition);
        if (match)
        {
            line = documentContents.substr(startPosition, match.index - startPosition);
        }
        else
        {
            line = documentContents.substr(startPosition);
        }

        //look for the suppression comment
        match = XRegExp.exec(line, regex);
        if (match)
        {
            finding.ruleColumn = match[0].indexOf(ruleID);
            if (finding.ruleColumn > -1)
            {
                finding.ruleColumn += match.index;
                if (!isReviewRule && match[2] !== undefined && match[2] != null && match[2].length > 0)
                {
                    const untilDate: number = Date.UTC(match[3], match[4] - 1, match[5], 0, 0, 0, 0);
                    //we have a match of the rule, and haven't yet reached the "until" date, so ignore finding
                    //if the "until" date is less than the current time, the suppression has expired and we should not ignore
                    if (untilDate > Date.now()) 
                    {
                        finding.showFinding = true;
                    }
                }
                else //we have a match with the rule (or all rules), and no "until" date, so we should ignore this finding
                {
                    finding.showFinding = true;
                }
            }
            else if (match[0].indexOf("all") > -1)
            {
                finding.showFinding = true;
            }
        }

        return finding;
    }

    /**
     * Generate the string that gets inserted into a comment for a suppression
     *
     * @private
     * @param {string} ruleIDs the DevSkim Rule ID that is being suppressed or reviewed (e.g. DS102158). Can be a list of IDs, comma seperated (eg. DS102158,DS162445) if suppressing
     *                         multiple issues on a single line
     * @param {boolean} isReviewRule different strings are used if this is a code review rule versus a normal rule; one is marked reviewed and the other suppressed
     * @param {Date} date (optional) if this is a manual review rule (i.e. rule someone has to look at) this should be today's date, signifying that the person has reviewed the finding today.
     *                    if it is a suppression (i.e. a normal finding) this is the date that they would like to be reminded of the finding.  For example, if somone suppresses a finding for
     *                    thirty days this should be today + 30 days.  If ommitted for a suppression the finding will be suppressed permanently
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
    public showFinding: boolean;
    public ruleColumn: number;
}
