/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/**
 * 
 */
export class PathOperations
{
    /**
     * 
     * @param filePath 
     * @param ignoreList 
     */
    public ignoreFile(filePath : string, ignoreList : string[]) : boolean
    {        
        if(filePath.length > 1)
        {
            //we don't want to run analysis on commit files which could, depending
            //on scenario, be either git://filepath or filepath.git, so we check
            //to make sure the path doesn't start with git (the git://filepath scenario)
            //or if .git is in the path
            if(filePath.indexOf("git") == 0 || filePath.indexOf(".git") > -1)
            {
                return true;
            }

            let XRegExp = require('xregexp');
            for(var ignorePattern of ignoreList)
            {
                let ignoreRegex : RegExp = XRegExp(XRegExp.escape(ignorePattern).replace("\\*", ".*").replace("\\?", "."), "i");
                
                if(XRegExp.exec(filePath,ignoreRegex))
                {
                    return true;
                }
            }
            
        }

        return false;
    }
}