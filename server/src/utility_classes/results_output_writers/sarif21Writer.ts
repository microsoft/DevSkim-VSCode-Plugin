/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * SARIF v2.1 output writer class
 * 
 */
import * as SARIF21Schema from "@schemastore/sarif-2.1.0-rtm.4";
import * as DevSkimObjects from "../../devskimObjects";
import {PathOperations} from "../pathOperations";
import {outputWriter} from "./outputWriter"

/**
 * Class to write output in SARIF v2.1 format
 */
export class SARIF21Writer implements outputWriter
{
    //settings object that this run of DevSkim analysis executed with
    protected runSettings : DevSkimObjects.IDevSkimSettings;
    private SarifFileObject : SARIF21Schema.StaticAnalysisResultsFormatSARIFVersion210Rtm4JSONSchema;
    private outputFile : string;
    private workingDirectory : string;


     /**
     * Set up the SARIF object, recording the settings this analysis was run under, and
     * the top level SARIF information (version, schema, etc.)
     * @param settings the settings that this instance of DevSkim Analysis was with
     * @param analyzedDirectory directory that was analyzed (NOT the directory to the output is written to - that will go in the same directory devskim was run from)
     * @param outputFilePath (optional) full file name for the output.  If not specified, info is written to console     
     */
    initialize(settings: DevSkimObjects.IDevSkimSettings, analyzedDirectory: string, outputFilePath ?: string)
    {
        this.runSettings = settings;
        this.SarifFileObject = Object.create(null);
        this.SarifFileObject.version = "2.1.0";
        this.SarifFileObject.$schema =  "https://raw.githubusercontent.com/oasis-tcs/sarifspec/master/Schemata/sarif-schema-2.1.0.json";
        this.SarifFileObject.runs = [];
        this.outputFile = outputFilePath;
        this.workingDirectory = analyzedDirectory;
 
    }   

    /**
     * Each folder with git repo info and files should go under its own run, as well as the parent directory
     * if it contains files, even if it does not have git info.  This populates information to be written out
     * from that run, adding them to the appropriate SARIF objects.  It also sets up the tool info for each run
     * @param analysisRun all of the information from the analysis of a directory and its contents/sub-directories 
     */
    public createRun(analysisRun : DevSkimObjects.Run) : void
    {
        let runNumber : number = this.SarifFileObject.runs.length;

        //common initializations independent of the run information
        this.SarifFileObject.runs[runNumber] = Object.create(null);
        this.SarifFileObject.runs[runNumber].tool = Object.create(null);
        this.SarifFileObject.runs[runNumber].tool.driver = Object(null);                   
        this.SarifFileObject.runs[runNumber].tool.driver.name = "DevSkim";
        this.SarifFileObject.runs[runNumber].tool.driver.fullName = "DevSkim Security Analyzer";
        this.SarifFileObject.runs[runNumber].tool.driver.shortDescription = {"text": "Lightweight Security Linter CLI"};
        this.SarifFileObject.runs[runNumber].tool.driver.fullDescription = {"text": "Lightweight security linter CLI capable of finding common security mistakes across a variety of languages without needing to compile."};
        this.SarifFileObject.runs[runNumber].tool.driver.version = "0.3";
        this.SarifFileObject.runs[runNumber].tool.driver.semanticVersion = "0.3.0";
        this.SarifFileObject.runs[runNumber].tool.driver.dottedQuadFileVersion = "0.3.0.0";
        this.SarifFileObject.runs[runNumber].tool.driver.organization = "Microsoft DevLabs";     
        
        //we aren't guaranteed to have git info, but if its there, add it to the SARIF
        if(analysisRun.directoryInfo.gitRepo.length > 0)
        {
            this.SarifFileObject.runs[runNumber].versionControlProvenance = [];
            this.SarifFileObject.runs[runNumber].versionControlProvenance[0] = Object.create(null);
            this.SarifFileObject.runs[runNumber].versionControlProvenance[0].repositoryUri = analysisRun.directoryInfo.gitRepo;
            this.SarifFileObject.runs[runNumber].versionControlProvenance[0].branch = analysisRun.directoryInfo.gitInfo.branch;
            this.SarifFileObject.runs[runNumber].versionControlProvenance[0].revisionId = analysisRun.directoryInfo.gitInfo.sha;
        }
               
        this.addFiles(analysisRun.files,runNumber);
        this.addResults(analysisRun.problems,analysisRun.directoryInfo.directoryPath,runNumber);
        this.addRules(analysisRun.rules,runNumber);

    }

    /**
     * Add all of the rules from this analysis run to the Sarif object that will be output (Goes into runs[runNumber].tool.driver.rules in the output)
     * @param rules array of all of the rules loaded.  The settings that the overall object was instantiated with in the constructor determine 
     * if the manual review and best practice rules are included
     * @param runNumber the run that these rules were used in
     */
    private addRules(rules : DevSkimObjects.Rule[], runNumber : number)
    {
        if(this.SarifFileObject.runs.length < runNumber)
        {
            throw "Run Object for this run has not yet been created";
        }

        this.SarifFileObject.runs[runNumber].tool.driver.rules = [];
        for(let rule of rules)
        {
            //check if the optional rules were enabled in this run before adding the rule to the
            //sarif collection
            if((rule.severity != "best-practice" || this.runSettings.enableBestPracticeRules) &&
                (rule.severity != "manual-review" || this.runSettings.enableManualReviewRules))
            {
                let newSarifRule : SARIF21Schema.ReportingDescriptor = Object.create(null);
                newSarifRule.id = rule.id;
                newSarifRule.name = rule.name;
                newSarifRule.fullDescription = {"text" : rule.description};
                newSarifRule.helpUri = this.runSettings.guidanceBaseURL + rule.ruleInfo;
                switch(rule.severity)
                {
                    case "critical":
                    case "important":
                    case "moderate":    newSarifRule.defaultConfiguration = {"level": "error"};
                        break;
                    default: newSarifRule.defaultConfiguration = {"level": "note"};
                }
                //sarif doesn't have a field for the security severity, so put it in a property bag
                newSarifRule.properties = {"MSRC-severity": rule.severity};
                this.SarifFileObject.runs[runNumber].tool.driver.rules.push(newSarifRule);
            }
        }
    }

    /**
     * Add all of the files analyzed to the sarif output.  This goes in runs[runNumber].artifacts
     * @param files array of all of the files and their meta data that were analyzed
     * @param runNumber the run that these files were recorded from
     */
    private addFiles(files : DevSkimObjects.FileInfo[], runNumber : number)
    {
        if(this.SarifFileObject.runs.length < runNumber)
        {
            throw "Run Object for this run has not yet been created";
        }

        this.SarifFileObject.runs[runNumber].artifacts = [];

        for(let file of files)
        {
            let sarifFile : SARIF21Schema.Artifact = Object.create(null);
            sarifFile.location = Object.create(null);
            sarifFile.location.uri = file.fileURI;
            sarifFile.location.uriBaseId = "%srcroot%";
            sarifFile.length = file.fileSize;
            sarifFile.sourceLanguage = file.sourceLanguage;
            sarifFile.hashes = {"sha-256" : file.sha256hash, "sha-512": file.sha512hash};
            this.SarifFileObject.runs[runNumber].artifacts.push(sarifFile);
        }
    }

    /**
     * Add the results of the analysis to the sarif object.  Will populate runs[runNumber].results in the output
     * @param problems array of every finding from the analysis run
     * @param directory the parent directory these findings were found under
     * @param runNumber the run that these findings came from
     */
    private addResults(problems : DevSkimObjects.DevSkimProblem[], directory : string, runNumber : number)
    {
        if(this.SarifFileObject.runs.length < runNumber)
        {
            throw "Run Object for this run has not yet been created";
        }
                
        this.SarifFileObject.runs[runNumber].results = [];
        let pathOp : PathOperations = new PathOperations();

        for(let problem of problems)
        {
            let sarifResult : SARIF21Schema.Result = Object.create(null);
            sarifResult.ruleId = problem.ruleId;
            sarifResult.message = {"text" : problem.message};
            
            switch(problem.severity)
            {
                case DevSkimObjects.DevskimRuleSeverity.Critical:
                case DevSkimObjects.DevskimRuleSeverity.Important:
                case DevSkimObjects.DevskimRuleSeverity.Moderate:    sarifResult.level = "error";
                    break;
                default: sarifResult.level = "note";
            }
            sarifResult.locations = [];
            sarifResult.locations[0] = Object.create(null);
            sarifResult.locations[0].physicalLocation = Object.create(null);

            let filePath = pathOp.fileToURI(problem.filePath );
            filePath = filePath.substr(pathOp.fileToURI(directory).length+1);

            sarifResult.locations[0].physicalLocation.artifactLocation = {"uri" : filePath, "uriBaseId" : "%srcroot%", "sourceLanguage" : pathOp.getLangFromPath(problem.filePath, true)};
            sarifResult.locations[0].physicalLocation.region = Object.create(null);

            //LSP uses 0 indexed lines/columns, SARIF expects 1 indexed, hence the + 1
            sarifResult.locations[0].physicalLocation.region.startLine = problem.range.start.line + 1;
            sarifResult.locations[0].physicalLocation.region.endLine = problem.range.end.line + 1;

            sarifResult.locations[0].physicalLocation.region.startColumn = problem.range.start.character + 1;
            sarifResult.locations[0].physicalLocation.region.endColumn = problem.range.end.character + 1;
            if(problem.snippet && problem.snippet.length > 0)
            {
                sarifResult.locations[0].physicalLocation.region.snippet = {"text" : problem.snippet};
            }
            this.SarifFileObject.runs[runNumber].results.push(sarifResult);
        }
    }

    /**
     * Output the current findings that have been added with createRun.  This will use the file path
     * specified during the initialize call, and will overwrite any existing file already there. Will write in SARIF 2.1 format
     */    
    public writeFindings()
    {
        let fs  = require("fs");
        
        fs.writeFile(this.outputFile, JSON.stringify(this.SarifFileObject , null, 4), (err)=> {});  
        console.log("Analyzed all files under \"%s\" and wrote the findings to %s", this.workingDirectory, this.outputFile);
    }    
}