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

export class DevSkimSuppression
{

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
     * 
     * 
     * @private
     * @param {string} ruleIDs
     * @param {string} langID
     * @param {Date} untilDate
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

    public addSuppressionAction(ruleID : string, documentContents : string, startCharacter : number, lineStart : number, langID : string) : DevSkimAutoFixEdit[]
    {
        let suppressionActions : DevSkimAutoFixEdit[] = [];
        let temporarySuppression : DevSkimAutoFixEdit = Object.create(null);
        let permanentSuppression : DevSkimAutoFixEdit = Object.create(null);
        
        let suppressionDays : number = DevSkimWorker.settings.devskim.suppressionDurationInDays;

        temporarySuppression.fixName = "DevSkim: Suppress issue for "+suppressionDays.toString(10)+" days";
        permanentSuppression.fixName = "DevSkim: Suppress issue permenantly";

        var suppressionDate = new Date();
        suppressionDate.setDate(suppressionDate.getDate() + suppressionDays);

        let XRegExp = require('xregexp');
        let range : Range;

        let existingSuppressionPattern : RegExp = /DevSkim: ignore ([^\s]+)(?:\suntil ((\d{4})-(\d{2})-(\d{2})))?/i;
        var match;

        //if there is an existing suppression
        if(match = XRegExp.exec(documentContents,existingSuppressionPattern,startCharacter))
        {
            let columnStart : number = (lineStart == 0) ? match.index : match.index -  documentContents.substr(0,match.index).lastIndexOf("\n") -1;
            range = Range.create(lineStart,columnStart ,lineStart, columnStart + match[0].length);
            if(match[1] !== undefined && match[1] != null && match[1].length > 0)
            {
                if(match[1].indexOf(ruleID) > 0)
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
        //if there is not an existing suppression
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
            temporarySuppression.text = this.GetCommentStart(langID) + this.makeSuppressionString(ruleID,suppressionDate) + this.GetCommentEnd(langID);
            permanentSuppression.text = this.GetCommentStart(langID) + this.makeSuppressionString(ruleID,null) + this.GetCommentEnd(langID);           
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

}