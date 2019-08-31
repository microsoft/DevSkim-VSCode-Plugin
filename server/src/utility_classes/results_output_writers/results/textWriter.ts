/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * console writer output writer class
 * 
 */

import * as DevSkimObjects from "../../../devskimObjects";
import {IResultsWriter, IFileWriter} from "../outputWriter";

/**
 * Implementation of outputWriter formatted to write to console
 * The correct order to use this is initialize, (optional) setOutputLocale, createRun for each run, writeOutput 
 */
export class TextResultWriter implements IResultsWriter, IFileWriter
{
    //settings object that this run of DevSkim analysis executed with
    protected runSettings : DevSkimObjects.IDevSkimSettings;
    private runsCollection : DevSkimObjects.Run[] = [];
    private workingDirectory : string;
    private outputLocation : string;

     /**
     * Set up initial values
     * @param settings the settings that this instance of DevSkim Analysis was with
     * @param analyzedDirectory directory that was analyzed (NOT the directory to the output is written to - that will go in the same directory devskim was run from)
     */
    public initialize(settings: DevSkimObjects.IDevSkimSettings, analyzedDirectory: string): void
    {
        this.runSettings = settings;
        this.workingDirectory = analyzedDirectory;
    }
    
     /**
     * Get the default file name that output will be written to, absent a user specified file name
     * @return the default file name. to be used if no file name was provided from the command line
     */    
    public getDefaultFileName() : string
    {
        return "devskim_results.txt";
    }

    /**
     * Sets where the output is sent.  If an empty string, output is echoed to the console, otherwise the output is 
     * used as a file name.  If not a full path, it will write to the current working directory
     * @param outputLocale location to write output to
     */
    setOutputLocale(outputLocale : string) : void
    {
        //add a file extension if they left it off
        if(outputLocale.length > 0 && outputLocale.indexOf(".") == -1)
        {
            outputLocale = outputLocale + ".txt";
        }
        this.outputLocation = outputLocale;
    }
    
    /**
     * Each folder with git repo info and files should go under its own run, as well as the parent directory
     * if it contains files, even if it does not have git info.  This populates information to be written out
     * from that run
     * @param analysisRun all of the information from the analysis of a directory and its contents/sub-directories 
     */
    public createRun(analysisRun: DevSkimObjects.Run): void
    {
        this.runsCollection.push(analysisRun);
    }
    
    /**
     * Output the current findings that have been added with createRun to the console
     */  
    public writeOutput(): void
    {
        let output : string = "";
        for(let run of this.runsCollection)
        {
            output += this.CreateOutputString(run.problems, run.directoryInfo);
        }

        if(this.outputLocation.length == 0)
        {
            console.log(output);
        }
        else
        {
            let fs  = require("fs");
        
            fs.writeFile(this.outputLocation, output, (err)=> {});  
            console.log("Analyzed all files under \"%s\" and wrote the findings to %s", this.workingDirectory, this.outputLocation);
        }
        
    }

    /**
     * Call after DevSkimWorker.Analyze is run.  This exhausts the findings to the command line
     * @param problems the problems detected in the files analyzed
     * @param directory the directory that was analyzed 
     */
    private CreateOutputString(problems: DevSkimObjects.DevSkimProblem[], directory : DevSkimObjects.DirectoryInfo) : string
    {
        let output : string = "Analysis run on " + this.workingDirectory + "\n";
        output += "\n----------------------\n\n";
        output += (problems.length == 1)? 
            "Analyzing all files under "+directory.directoryPath+".  Found "+problems.length+" issue\n" : 
            "Analyzing all files under "+directory.directoryPath+".  Found "+problems.length+" issues\n";
        //we aren't guaranteed to have git info, but if its there, add it to the SARIF
        if(directory.gitRepo.length > 0)
        {
            output += "Git Repo:   " + directory.gitRepo + "\n";
            output += "Git Branch: " + directory.gitInfo.branch + "\n";
            output += "Git Commit: " + directory.gitInfo.sha + "\n";
        }

        let errorInfo = {};
    
        if(problems.length > 0)
        {
            for(let problem of problems)
            {
                if(errorInfo[problem.filePath] == undefined)
                {
                    errorInfo[problem.filePath] = [];
                }
                let errorString : string = "  line:" + (problem.range.start.line +1).toString() + " column:" + 
                    (problem.range.start.character +1).toString() + " - " + problem.ruleId + " " + DevSkimObjects.DevSkimProblem.getSeverityName(problem.severity) +
                    " : " + problem.source + "\n";
    
                errorInfo[problem.filePath].push(errorString);
            }
            for (let filename in errorInfo) 
            {
                output +=  (errorInfo[filename].length == 1)? 
                "\n file: "+filename+" \n Found "+errorInfo[filename].length+" issue:\n" : 
                "\n file: "+filename+" \n Found "+errorInfo[filename].length+" issues:\n";  
    
                for(let errorString of errorInfo[filename])
                {
                    output +=  errorString;
                }
            }
        }            
        return output;
    }

}