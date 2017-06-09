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