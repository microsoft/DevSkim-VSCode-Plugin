/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * console writer output writer class
 * 
 */

import * as DevSkimObjects from "../../devskimObjects";
import {outputWriter} from "./outputWriter"

/**
 * Implementation of outputWriter formatted to write to console
 */
export class ConsoleWriter implements outputWriter
{
    //settings object that this run of DevSkim analysis executed with
    protected runSettings : DevSkimObjects.IDevSkimSettings;
    private runsCollection : DevSkimObjects.Run[] = [];
    private workingDirectory : string;

     /**
     * Set up initial values
     * @param settings the settings that this instance of DevSkim Analysis was with
     * @param analyzedDirectory directory that was analyzed (NOT the directory to the output is written to - that will go in the same directory devskim was run from)
     * @param outputFilePath ignored - present only for interface conformity    
     */
    initialize(settings: DevSkimObjects.IDevSkimSettings, analyzedDirectory: string, outputFilePath ?: string): void
    {
        this.runSettings = settings;
        this.workingDirectory = analyzedDirectory;
    }    
    
    /**
     * Each folder with git repo info and files should go under its own run, as well as the parent directory
     * if it contains files, even if it does not have git info.  This populates information to be written out
     * from that run
     * @param analysisRun all of the information from the analysis of a directory and its contents/sub-directories 
     */
    createRun(analysisRun: DevSkimObjects.Run): void
    {
        this.runsCollection.push(analysisRun);
    }
    
    /**
     * Output the current findings that have been added with createRun to the console
     */  
    writeFindings(): void
    {
        for(let run of this.runsCollection)
        {
            this.WriteOutputCLI(run.problems, run.directoryInfo);
        }
    }

    /**
     * Call after DevSkimWorker.Analyze is run.  This exhausts the findings to the command line
     * @param problems the problems detected in the files analyzed
     * @param directory the directory that was analyzed 
     */
    private WriteOutputCLI(problems: DevSkimObjects.DevSkimProblem[], directory : DevSkimObjects.DirectoryInfo)
    {
        console.log("Analysis run on " + this.workingDirectory);
        console.log("\n----------------------\n");
        let issueText : string = (problems.length == 1)? 
            "Analyzing all files under %s.  Found %d issue" : 
            "Analyzing all files under %s.  Found %d issues";
        console.log(issueText, directory.directoryPath, problems.length);
        //we aren't guaranteed to have git info, but if its there, add it to the SARIF
        if(directory.gitRepo.length > 0)
        {
            console.log("Git Repo:   " + directory.gitRepo);
            console.log("Git Branch: " + directory.gitInfo.branch);
            console.log("Git Commit: " + directory.gitInfo.sha);
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
                    " : " + problem.source;
    
                errorInfo[problem.filePath].push(errorString);
            }
            for (let filename in errorInfo) 
            {
                issueText  = (errorInfo[filename].length == 1)? 
                "\n file: %s \n Found %d issue:" : 
                "\n file: %s \n Found %d issues:";            
                console.log(issueText,filename, errorInfo[filename].length);
    
                for(let errorString of errorInfo[filename])
                {
                    console.log(errorString);
                }
            }
        }
            
    
    }

}