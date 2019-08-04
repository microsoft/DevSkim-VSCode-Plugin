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

import {IDevSkimSettings, DevSkimProblem, Rule} from "./devskimObjects";

import {DevSkimWorker} from "./devskimWorker";
import {PathOperations} from "./utility_classes/pathOperations";
import {DevSkimWorkerSettings} from "./devskimWorkerSettings"
import {DevSkimSuppression} from "./utility_classes/suppressions"
import {DebugLogger} from "./utility_classes/logger"
//import * as SARIF21 from "@schemastore/sarif-2.1.0-rtm.4";

// To DO - keep or remove   -    import * as path from 'path';
//import { settings } from "cluster";

var program = require("commander");

//set up the command line options for the "analyze" command
program.command('analyze')
    .description('analyze the files in the specified directory for security mistakes')
    .option("-b, --best_practice", "include best practice findings in the output")
    .option("-m, --manual_review", "include manual review findings in the output")
    .option("-d, --directory [directory]", "The parent directory to containing the files to analyze.  If not provided, the current working directory is used")
    .option("-o, --output_file [outputFile]", "The file to write output into. If this option is set but no file specified, output is written to devskim_results.json")
    .action(function(options) {
        analyze(options);
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
 * 
 * @param options 
 */
async function analyze(options) : Promise<void>
{
    let directory: string = (options == undefined || options.directory == undefined ) ? 
        process.cwd() :  options.directory;

    let outputFile: string= (options == undefined || options.output_file == undefined ) ? 
        "" :  options.output_file;
    
    let FilesToLog : Object = {};
    
    var settings : IDevSkimSettings  = buildSettings(options);

    let dir = require('node-dir'); 
    dir.files(directory, async function(err, files) {
            if (err)
            {
                console.log(err);
                throw err;
            }

            if(files == undefined || files.length < 1)
            {
                console.log("No files found in directory %s", directory);
                return;
            }
            
            let fs = require("fs"); 
            
            const dsSuppression = new DevSkimSuppression(settings);
            const logger : DebugLogger = new DebugLogger(settings);

            var analysisEngine : DevSkimWorker = new DevSkimWorker(logger, dsSuppression, settings);
            await analysisEngine.init();

            let pathOp : PathOperations = new PathOperations();
            var problems : DevSkimProblem[] = [];
            
            for(let curFile of files)
            {						
                if(curFile.indexOf(".git") == -1 && !PathOperations.ignoreFile(curFile,settings.ignoreFilesList))
                {
                    let documentContents : string = fs.readFileSync(curFile, "utf8");
                    let langID : string = pathOp.getLangFromPath(curFile);
                    problems = problems.concat(analysisEngine.analyzeText(documentContents,langID, curFile));
                    
                    /*let fileMetadata : SarifFile = Object.create(null);
                    fileMetadata.length = documentContents.length;
                    fileMetadata.mimetype = pathOp.getMimeFromPath(curFile);
                    FilesToLog[pathOp.fileToURI(curFile)] = fileMetadata;*/
                }						
            }

            if(outputFile.length < 1)
            {
                WriteOutputCLI(problems,directory);
            }
            else
            {
                //WriteOutputFile(problems,analysisEngine.getAnalysisRules(),FilesToLog,outputFile,directory, settings);
            }
            
        });	
}



program.parse(process.argv);