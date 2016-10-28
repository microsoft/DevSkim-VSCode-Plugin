/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * 
 * This file contains functionality to convert Python style regular expressions into ones consumable
 * by xregexp. 
 * 
 *  ------------------------------------------------------------------------------------------ */
'use strict';

/**
 * Convert regex with python style capture group (/1 /2) into one consumable by xregexp ($1 $2)
 * 
 * @export
 * @param {string} sourceRegEx the regex string to modify
 * @returns {string} a modification of the supplied regex, with all of the /1 /2 etc. capture groups
 *                   replaced with $1 $2 etc.
 */
export function convertCaptureGroup(sourceRegEx : string) : string
{
    let XRegExp = require('xregexp');
    var matchPattern = XRegExp("\\\\(\\d)");
    var match;
    while(match = XRegExp.exec(sourceRegEx,matchPattern))
    {
        sourceRegEx = XRegExp.replace(sourceRegEx,matchPattern,"$$$1");
    }
    return sourceRegEx;
}