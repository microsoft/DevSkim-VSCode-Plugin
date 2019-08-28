/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * command line class for the CLI version of DevSkim - invoked from cli.ts.  
 * 
 */


import { IDevSkimSettings, DevSkimProblem, Rule, FileInfo, DirectoryInfo, Run } from "./devskimObjects";

import { DevSkimWorker } from "./devskimWorker";
import { PathOperations } from "./utility_classes/pathOperations";
import { DevSkimWorkerSettings } from "./devskimWorkerSettings";
import { DevSkimSuppression } from "./utility_classes/suppressions";
import { DebugLogger } from "./utility_classes/logger";
import { outputWriter } from "./utility_classes/results_output_writers/outputWriter";
import { gitHelper } from './utility_classes/git';
import { ConsoleWriter } from './utility_classes/results_output_writers/consoleWriter';
import { SARIF21Writer } from './utility_classes/results_output_writers/sarif21Writer';

/**
 * An enum to track the various potential commands from the CLI
 */
export enum CLIcommands
{
    /**
     * Run an analysis of the files under a folder
     */
    Analyze = "analyze",

    /**
     * List the rules, optionally producing validation
     */
    inventoryRules = "rules"
}

/**
 * The main worker class for the Command Line functionality
 */
export class DevSkimCLI
{
    private workingDirectory : string;
    private settings : IDevSkimSettings;
    private outputFilePath: string;
    private resultFileObject : outputWriter;

    /**
     * Set up the CLI class - does not run the command, just sets everything up 
     * @param command the command run from the CLI
     * @param options the options used with that command
     */
    constructor(private command : CLIcommands, private options)
    {
        this.workingDirectory = (this.options == undefined || this.options.directory == undefined  || this.options.directory.length == 0 ) ? 
            process.cwd() :  this.options.directory;

        
        this.buildSettings();

        this.outputFilePath = (options == undefined || options.output_file == undefined ) ? 
            "" :  options.output_file;    
        
        if(this.outputFilePath.length > 0)
        {
            this.resultFileObject = new SARIF21Writer();
        }
        else
        {
            this.resultFileObject = new ConsoleWriter();            
        }
        
        this.resultFileObject.initialize(this.settings, this.workingDirectory, this.outputFilePath );
    }

    /**
     * Run the command that was passed from the CLI
     */
    public async run()
    {
        switch(this.command)
        {
            case CLIcommands.Analyze: 
                let git : gitHelper = new gitHelper();
                await git.getRecursiveGitInfo(this.workingDirectory, 
                    directories => 
                    {
                        this.analyze(directories)
                    });
                break;
            case CLIcommands.inventoryRules: await this.inventoryRules();
                break;
        }
    }

    
    /**
     * Create a DevSkimSettings object from the specified command line options (or defaults if no relevant option is present)
     */
    private buildSettings() 
    {
        //right now most of the options come from the defaults, with only a couple of variations passed
        //from the command line
        this.settings = DevSkimWorkerSettings.defaultSettings();
    
        if(this.options.best_practice != undefined && this.options.best_practice == true)
        {
            this.settings.enableBestPracticeRules = true;
        }
    
        if(this.options.manual_review != undefined && this.options.manual_review == true)
        {
            this.settings.enableManualReviewRules = true;
        }    
    }
    
    
    
    /**
     * function invoked from command line. Right now a simplistic stub that simply lists the rules
     * @todo create HTML output with much better formatting/info, and optional validation
     */
    private async inventoryRules() : Promise<void>
    {
        const dsSuppression = new DevSkimSuppression(this.settings);
        const logger : DebugLogger = new DebugLogger(this.settings);
    
        var analysisEngine : DevSkimWorker = new DevSkimWorker(logger, dsSuppression, this.settings);
        await analysisEngine.init();
        let rules : Rule[] = analysisEngine.retrieveLoadedRules();
        for(let rule of rules)
        {
            console.log(rule.id+" , "+rule.name);
        }          
    }
    
    /**
     * Analyze the contents of provided directory paths, and output
     * @param directories collection of Directories that will be analyzed
     */
    private async analyze(directories : DirectoryInfo[] ) : Promise<void>
    {    
        let FilesToLog : FileInfo[] = [];   
    
        let dir = require('node-dir'); 
        dir.files(directories[0].directoryPath, async (err, files) => {        
            if (err)
            {
                console.log(err);
                 throw err;
            }
    
            if(files == undefined || files.length < 1)
            {
                console.log("No files found in directory %s", directories[0].directoryPath);
                return;
            }
            
            let fs = require("fs");            
            
            const dsSuppression = new DevSkimSuppression(this.settings);
            const logger : DebugLogger = new DebugLogger(this.settings);
    
            var analysisEngine : DevSkimWorker = new DevSkimWorker(logger, dsSuppression, this.settings);
            await analysisEngine.init();
    
            let pathOp : PathOperations = new PathOperations();
            var problems : DevSkimProblem[] = [];
            
            for(let directory of directories)
            {               
                for(let curFile of files)
                {						
                    if(curFile.indexOf(".git") == -1 && !PathOperations.ignoreFile(curFile,this.settings.ignoreFilesList))
                    {
                        let longestDir : string = "";
                        for(let searchDirectory of directories)
                        {
                            searchDirectory.directoryPath = pathOp.normalizeDirectoryPaths(searchDirectory.directoryPath)
                            if(curFile.indexOf(searchDirectory.directoryPath) != -1)
                            {
                                if (searchDirectory.directoryPath.length > longestDir.length)
                                {
                                    longestDir = searchDirectory.directoryPath;
                                }
                            }
                        }
                        if(pathOp.normalizeDirectoryPaths(longestDir) == pathOp.normalizeDirectoryPaths(directory.directoryPath))
                        {
                            //give some indication of progress as files are analyzed
                            console.log("Analyzing \""+curFile.substr(directories[0].directoryPath.length+1) + "\"");                    
    
                            let documentContents : string = fs.readFileSync(curFile, "utf8");
                            let langID : string = pathOp.getLangFromPath(curFile);
    
                            problems = problems.concat(analysisEngine.analyzeText(documentContents,langID, curFile, false));
    
                            //if writing to a file, add the metadata for the file that is analyzed
                            if(this.outputFilePath.length > 0)
                            {                      
                                FilesToLog.push(this.createFileData(curFile,documentContents,directory.directoryPath));                
                            }  
                        }          
                    }
                                            
                }
                if(problems.length > 0 || FilesToLog.length > 0)
                {
                    this.resultFileObject.createRun(new Run(directory, 
                                                            analysisEngine.retrieveLoadedRules(), 
                                                            FilesToLog, 
                                                            problems));                                
                    problems  = [];
                    FilesToLog = [];
                }
                
            }
            //just add a space at the end to make the final text more readable
            console.log("\n-----------------------\n");
            
            this.resultFileObject.writeFindings();

            
        });	
    }
    
    /**
     * Creates an object of metadata around the file, to identify it on disk both by path and by hash
     * @param curFile the path of the current file being analyzed
     * @param documentContents the contents of the document, for hashing
     * @param analysisDirectory the parent directory that analysis started at, used to create relative pathing
     */
    private createFileData(curFile : string, documentContents : string, analysisDirectory : string ) : FileInfo
    {
        const crypto = require('crypto');
        let pathOp : PathOperations = new PathOperations();
        let fs = require("fs"); 
    
        let fileMetadata : FileInfo = Object.create(null);
        //the URI needs to be relative to the directory being analyzed, so get the current file URI
        //and then chop off the bits for the parent directory
        fileMetadata.fileURI = pathOp.fileToURI(curFile);
        fileMetadata.fileURI = fileMetadata.fileURI.substr(pathOp.fileToURI(analysisDirectory).length+1);
        
        fileMetadata.sourceLanguage = pathOp.getLangFromPath(curFile, true);
        fileMetadata.sha256hash = crypto.createHash('sha256').update(documentContents).digest('hex');
        fileMetadata.sha512hash = crypto.createHash('sha512').update(documentContents).digest('hex');
        fileMetadata.fileSize = fs.statSync(curFile).size;
    
        return fileMetadata;
    }
}


