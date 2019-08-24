#!/usr/bin/env node

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * command line code for the CLI version of DevSkim.  Handles setting up and parsing command line,
 * orchestrating commands from the command line, and writing output to the specified location
 * 
 */

// To DO - keep or remove   -      import {IDevSkimSettings, DevSkimSettings, DevSkimProblem, Fixes, AutoFix, FixIt, DevSkimAutoFixEdit, Rule} from "./devskimObjects";

import {IDevSkimSettings, DevSkimProblem, Rule, FileInfo, DirectoryInfo} from "./devskimObjects";

import {DevSkimWorker} from "./devskimWorker";
import {PathOperations} from "./utility_classes/pathOperations";
import {DevSkimWorkerSettings} from "./devskimWorkerSettings";
import {DevSkimSuppression} from "./utility_classes/suppressions";
import {DebugLogger} from "./utility_classes/logger";
import {Sarif21R4} from "./utility_classes/outputFile";
import {GitInfo} from 'git-local-info';

var program = require("commander");

//set up the command line options for the "analyze" command
program.command('analyze')
    .description('analyze the files in the specified directory for security mistakes')
    .option("-b, --best_practice", "include best practice findings in the output")
    .option("-m, --manual_review", "include manual review findings in the output")
    .option("-d, --directory [directory]", "The parent directory to containing the files to analyze.  If not provided, the current working directory is used")
    .option("-o, --output_file [outputFile]", "The file to write output into. If this option is set but no file specified, output is written to devskim_results.json")
    .action(function(options) {
        runGit(options);
    });

//set up the command line options for the "analyze" command
program.command('rules')
    .description('output the inventory of currently installed analysis rules')
    .option("-t, --terse", "lists just the rule ID and name, but no summary")
    .option("-v, -validate", "validates each rule for errors in the construction of the rules")
    .option("-o, --output_file [outputFile]", "The file to write output into. If this option is set but no file specified, output is written to devskim_rules.html")
    .action(function(options) {
        inventoryRules(options);
    });    
 

async function runGit(options)
{
    let directory: string = (options == undefined || options.directory == undefined ) ? 
        process.cwd() :  options.directory;
    let pathOp = new PathOperations();
    
    //this shouldn't ever happen, in case process.cwd fails, we should check anyway
    if(directory.length == 0)
    {
        console.log("Error: no directory to analyze");
        return;
    }
    directory = pathOp.normalizeDirectoryPaths(directory);


    let outputFile: string= (options == undefined || options.output_file == undefined ) ? 
        "" :  options.output_file;        
    
    var settings : IDevSkimSettings  = buildSettings(options);
    

    var getRepoInfo = require('git-repo-info');

    let directories : DirectoryInfo[] = [];
    let baseDir : DirectoryInfo = Object.create(null);
    baseDir.directoryPath = directory;
    baseDir.gitInfo = getRepoInfo(directory);
    baseDir.gitRepo = getRepo(directory);
    directories.push(baseDir);

    let dir = require('node-dir'); 
    dir.subdirs(directory, async (err,subdir) => {
        if (err)
        {
            console.log(err);
            throw err;
        }
         
        for(let dir of subdir)
        {
            dir = pathOp.normalizeDirectoryPaths(dir);
            
            if(dir.substr(dir.length-4) == ".git" && dir.substr(0,dir.length-5) != directory)
            {          
                let curDir : DirectoryInfo = Object.create(null);
                curDir.directoryPath = dir.substr(0,dir.length-4);
                curDir.gitInfo = getRepoInfo(dir);
                curDir.gitRepo = getRepo(dir);
                directories.push(curDir);
            }
        }
        analyze(outputFile,settings,directories);
    });    
}

function getRepo(directory: string) 
{
    if(directory.length == 0)
    {
        return "";
    }
    const path = require('path');

    if(directory.substr(directory.length-4) != ".git" )
    {        
        directory = path.join(directory,".git");
    }

    directory = path.join(directory,"config");
    const fs = require('fs');
    if(fs.existsSync(directory))
    {
        let config : string = fs.readFileSync(directory, "utf8");
        let urlRegex: RegExp = /url\s*=\s*(.*)\s*/;
        let XRegExp = require('xregexp');
        let match = XRegExp.exec(config,urlRegex);
        if(match)
        {
            return match[1];
        }        
    }
    
    return "";
}

/**
 * Create a DevSkimSettings object from the specified command line options (or defaults if no relevant option is present)
 * @param option the options passed from the command line analysis command
 */
function buildSettings(option) : IDevSkimSettings
{
    let settings : IDevSkimSettings = DevSkimWorkerSettings.defaultSettings();

    if(option.best_practice != undefined && option.best_practice == true)
    {
        settings.enableBestPracticeRules = true;
    }

    if(option.manual_review != undefined && option.manual_review == true)
    {
        settings.enableManualReviewRules = true;
    }
    return settings;

}

/**
 * Call after DevSkimWorker.Analyze is run.  This exhausts the findings to the command line
 * @param problems the problems detected in the files analyzed
 * @param directory the directory that was analyzed 
 */
function WriteOutputCLI(problems: DevSkimProblem[], directory : string)
{
    let issueText : string = (problems.length == 1)? 
        "Analyzing all files under %s.  Found %d issue" : 
        "Analyzing all files under %s.  Found %d issues";
    console.log(issueText, directory, problems.length);
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
                (problem.range.start.character +1).toString() + " - " + problem.ruleId + " " + DevSkimProblem.getSeverityName(problem.severity) +
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

/**
 * function invoked from command line. Right now a simplistic stub that simply lists the rules, but TO-DO, create much better output
 * @param options the command line options this functionality was invoked with
 */
async function inventoryRules(options) : Promise<void>
{
    var settings : IDevSkimSettings  = buildSettings(options);
    const dsSuppression = new DevSkimSuppression(settings);
    const logger : DebugLogger = new DebugLogger(settings);

    var analysisEngine : DevSkimWorker = new DevSkimWorker(logger, dsSuppression, settings);
    await analysisEngine.init();
    let rules : Rule[] = analysisEngine.retrieveLoadedRules();
    for(let rule of rules)
    {
        console.log(rule.id+" , "+rule.name);
    }          
}

/**
 * function invoked from the command line. analyzes the contents of a directory
 * @param options the command line options this functionality was invoked with
 */
async function analyze(outputFile : string, settings: IDevSkimSettings, directories : DirectoryInfo[] ) : Promise<void>
{

    let FilesToLog : FileInfo[] = [];   

    let dir = require('node-dir'); 
    dir.files(directories[0].directoryPath, async function(err, files) {        
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
        
        const dsSuppression = new DevSkimSuppression(settings);
        const logger : DebugLogger = new DebugLogger(settings);

        var analysisEngine : DevSkimWorker = new DevSkimWorker(logger, dsSuppression, settings);
        await analysisEngine.init();

        let pathOp : PathOperations = new PathOperations();
        let sarif : Sarif21R4 = new Sarif21R4(settings); 
        var problems : DevSkimProblem[] = [];
        let run : number = 0;
        
        for(let directory of directories)
        {               
            for(let curFile of files)
            {						
                if(curFile.indexOf(".git") == -1 && !PathOperations.ignoreFile(curFile,settings.ignoreFilesList))
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
                        if(outputFile.length > 0)
                        {                      
                            FilesToLog.push(createFileData(curFile,documentContents,directory.directoryPath));                
                        }  
                    }          
                }
                                        
            }
            if(outputFile.length > 0 && (problems.length > 0 || FilesToLog.length > 0))
            {
                sarif.CreateRun(run, directory);                                
                sarif.AddFiles(FilesToLog, run);
                sarif.AddRules(analysisEngine.retrieveLoadedRules(), run);
                sarif.AddResults(problems, directory.directoryPath, run);
                problems  = [];
                FilesToLog = [];
                run++;
            }
            
        }
        //just add a space at the end to make the final text more readable
        console.log("\n-----------------------\n");
        
        //if we are writing to the file, build it and output
        if(outputFile.length > 0)
        {
            sarif.WriteToFile(outputFile,directories[0].directoryPath);
        }
        else
        {
            WriteOutputCLI(problems, directories[0].directoryPath);
        }
        
    });	
}

/**
 * 
 * @param curFile 
 * @param documentContents 
 * @param directory 
 */
function createFileData(curFile : string, documentContents : string, directory : string ) : FileInfo
{
    const crypto = require('crypto');
    let pathOp : PathOperations = new PathOperations();
    let fs = require("fs"); 

    let fileMetadata : FileInfo = Object.create(null);
    //the URI needs to be relative to the directory being analyzed, so get the current file URI
    //and then chop off the bits for the parent directory
    fileMetadata.fileURI = pathOp.fileToURI(curFile);
    fileMetadata.fileURI = fileMetadata.fileURI.substr(pathOp.fileToURI(directory).length+1);
    
    fileMetadata.sourceLanguage = pathOp.getLangFromPath(curFile, true);
    fileMetadata.sha256hash = crypto.createHash('sha256').update(documentContents).digest('hex');
    fileMetadata.sha512hash = crypto.createHash('sha512').update(documentContents).digest('hex');
    fileMetadata.fileSize = fs.statSync(curFile).size;

    return fileMetadata;
}



program.parse(process.argv);