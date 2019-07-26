/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 *
 * Helper functions when working with the text of a document.  Methods are primarily static
 * as they don't require maintaining a state, and get invoked quite a lot.  While this increases
 * memory usage up front, it is more performant as it doesn't require continuos object creation/destruction
 * 
 * @export
 * @class DocumentUtilities
 */

import { SourceContext } from "./sourceContext";
export class DocumentUtilities
{
       /**
     * The documentContents is just a stream of text, but when interacting with the editor its common to need
     * the line number.  This counts the newlines to the current document position
     *
     * @private
     * @param {string} documentContents the text to count newlines in
     * @param {number} currentPosition the point in the text that we should count newlines to
     * @returns {number}
     *
     */
    public static GetLineNumber(documentContents: string, currentPosition: number): number 
    {
        let newlinePattern: RegExp = /(\r\n|\n|\r)/gm;
        let subDocument: string = documentContents.substr(0, currentPosition);
        let linebreaks: RegExpMatchArray = subDocument.match(newlinePattern);
        return (linebreaks !== undefined && linebreaks !== null) ? linebreaks.length : 0;
    }

    /**
     * Given the line number, find the number of characters in the document to get to that line number
     * @param {string} documentContents the document we are parsing for the line
     * @param {number} lineNumber the VS Code line number (internally, not UI - internally lines are 0 indexed, in the UI they start at 1)
     */
    public static GetDocumentPosition(documentContents: string, lineNumber: number): number 
    {
        if (lineNumber < 1)
            return 0;
        //the line number is 0 indexed, but we are counting newlines, which isn't, so add 1
        lineNumber++;

        let newlinePattern: RegExp = /(\r\n|\n|\r)/gm;
        let line = 1;
        let matchPosition = 0;
        let XRegExp = require('xregexp');

        //go through all of the text looking for a match with the given pattern
        let match = XRegExp.exec(documentContents, newlinePattern, matchPosition);
        while (match) 
        {
            line++;
            matchPosition = match.index + match[0].length;

            if (line == lineNumber)
                return matchPosition;

            match = XRegExp.exec(documentContents, newlinePattern, matchPosition);
        }

        return documentContents.length;
    }

    /**
     * Check to see if the finding occurs within the scope expected
     * see scope param for details
     *
     * @public
     * @param {string} langID
     * @param {string} docContentsToFinding
     * @param {number} newlineIndex
     * @param {string} scopes values are code (finding should only occur in code), comment (finding should only occur code comments), or all (finding occurs anywhere)
     * @returns {boolean}
     * @memberof DevSkimWorker
     */
    public static MatchIsInScope(langID: string, docContentsToFinding: string, newlineIndex: number, scopes: string[]): boolean 
    {
        if (scopes.indexOf("all") > -1)
            return true;

        let findingInComment: boolean = SourceContext.IsFindingInComment(langID, docContentsToFinding, newlineIndex);

        for (let scope of scopes) 
        {
            if ((scope == "code" && !findingInComment) || (scope == "comment" && findingInComment))
                return true;
        }
        return false;
    }    
}