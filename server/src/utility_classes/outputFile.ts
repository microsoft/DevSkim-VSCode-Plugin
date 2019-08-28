/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * Handles writing the file output in SARIF v2.1 RTM 4 format
 * 
 */

import * as SARIF21R4 from "@schemastore/sarif-2.1.0-rtm.4";
import * as DevSkimObjects from "../devskimObjects";
import {PathOperations} from "./pathOperations";

export abstract class outputFile
{
    protected settings : DevSkimObjects.IDevSkimSettings;

    constructor(settings : DevSkimObjects.IDevSkimSettings) {this.settings = settings};

    /**
     * Add all of the rules from this analysis run to the Sarif object that will be output (Goes into runs[0].tool.driver.rules in the output)
     * @param rules array of all of the rules loaded.  The settings that the overall object was instantiated with in the constructor determine 
     * if the manual review and best practice rules are included
     */
    public abstract AddRules(rules : DevSkimObjects.Rule[]) :void;

    /**
     * Add all of the files analyzed to the sarif output.  This goes in runs[0].artifacts
     * @param files array of all of the files and their meta data that were analyzed
     */
    public abstract AddFiles(files : DevSkimObjects.FileInfo[]) :void;

    /**
     * Add the results of the analysis to the sarif object.  Will populate runs[0].results in the output
     * @param problems array of every finding from the analysis run
     */    
    public abstract AddResults(problems : DevSkimObjects.DevSkimProblem[], directory : string) : void;

    /**
     * Output the current sarif object.  AddResults, AddFiles, and AddRules should be called first to get the full output, though this can
     * be called before if only partial sarif output is desired
     * @param outputFile file name for the output
     * @param directory directory that was analyzed (NOT the directory to the output is written to - that will go in the same directory devskim was run from)
     */    
    public abstract WriteToFile(outputFile : string, directory : string) : void;
}

export class Sarif21R4 extends outputFile
{
    private SarifFileObject : SARIF21R4.StaticAnalysisResultsFormatSARIFVersion210Rtm4JSONSchema;
    
    /**
     * Initialize a Sarif v2.1 object with the basic tool info
     * @param settings DevSkimSettings that this analysis was run with (mostly to see if optional rules were enabled)
     */
    constructor(settings : DevSkimObjects.IDevSkimSettings)
    {
        super(settings);
        this.SarifFileObject = Object.create(null);
        this.SarifFileObject.version = "2.1.0";
        this.SarifFileObject.$schema =  "https://raw.githubusercontent.com/oasis-tcs/sarifspec/master/Schemata/sarif-schema-2.1.0.json";
        this.SarifFileObject.runs = [];
        this.SarifFileObject.runs[0] = Object.create(null);
        this.SarifFileObject.runs[0].tool = Object.create(null);
        this.SarifFileObject.runs[0].tool.driver = Object(null);
        this.SarifFileObject.runs[0].tool.driver.name = "DevSkim";
        this.SarifFileObject.runs[0].tool.driver.fullName = "DevSkim Security Analyzer";
        this.SarifFileObject.runs[0].tool.driver.shortDescription = {"text": "Lightweight Security Linter CLI"};
        this.SarifFileObject.runs[0].tool.driver.fullDescription = {"text": "Lightweight security linter CLI capable of finding common security mistakes across a variety of languages without needing to compile."};
        this.SarifFileObject.runs[0].tool.driver.version = "0.3";
        this.SarifFileObject.runs[0].tool.driver.semanticVersion = "0.3.0";
        this.SarifFileObject.runs[0].tool.driver.dottedQuadFileVersion = "0.3.0.0";
        this.SarifFileObject.runs[0].tool.driver.organization = "Microsoft DevLabs";    
        
    }

    /**
     * Add all of the rules from this analysis run to the Sarif object that will be output (Goes into runs[0].tool.driver.rules in the output)
     * @param rules array of all of the rules loaded.  The settings that the overall object was instantiated with in the constructor determine 
     * if the manual review and best practice rules are included
     */
    public AddRules(rules : DevSkimObjects.Rule[])
    {
        this.SarifFileObject.runs[0].tool.driver.rules = [];
        
        // Ensure that all rules are specified in a stable order.
        const _rules: DevSkimObjects.Rule[] = rules.sort((a, b) => a.id.localeCompare(b.id));

        for(let rule of _rules)
        {
            //check if the optional rules were enabled in this run before adding the rule to the
            //sarif collection
            if((rule.severity != "best-practice" || this.settings.enableBestPracticeRules) &&
                (rule.severity != "manual-review" || this.settings.enableManualReviewRules))
            {
                let newSarifRule : SARIF21R4.ReportingDescriptor = Object.create(null);
                newSarifRule.id = rule.id;
                newSarifRule.name = rule.name;
                newSarifRule.fullDescription = {"text" : rule.description};
                newSarifRule.helpUri = this.settings.guidanceBaseURL + rule.ruleInfo;
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
                this.SarifFileObject.runs[0].tool.driver.rules.push(newSarifRule);
            }
        }
    }

    /**
     * Add all of the files analyzed to the sarif output.  This goes in runs[0].artifacts
     * @param files array of all of the files and their meta data that were analyzed
     */
    public AddFiles(files : DevSkimObjects.FileInfo[])
    {
        this.SarifFileObject.runs[0].artifacts = [];

        for(let file of files)
        {
            let sarifFile : SARIF21R4.Artifact = Object.create(null);
            sarifFile.location = Object.create(null);
            sarifFile.location.uri = file.fileURI;
            sarifFile.location.uriBaseId = "%srcroot%";
            sarifFile.length = file.fileSize;
            sarifFile.sourceLanguage = file.sourceLanguage;
            sarifFile.hashes = {"sha-256" : file.sha256hash, "sha-512": file.sha512hash};
            this.SarifFileObject.runs[0].artifacts.push(sarifFile);
        }
    }

    /**
     * Add the results of the analysis to the sarif object.  Will populate runs[0].results in the output
     * @param problems array of every finding from the analysis run
     */
    public AddResults(problems : DevSkimObjects.DevSkimProblem[], directory : string)
    {
        this.SarifFileObject.runs[0].results = [];
        let pathOp : PathOperations = new PathOperations();

        for(let problem of problems)
        {
            let sarifResult : SARIF21R4.Result = Object.create(null);
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
                sarifResult.locations[0].physicalLocation.region.snippet = {"text" : problem.snippet}
            }
            this.SarifFileObject.runs[0].results.push(sarifResult);
        }
    }

    /**
     * Output the current sarif object.  AddResults, AddFiles, and AddRules should be called first to get the full output, though this can
     * be called before if only partial sarif output is desired
     * @param outputFile file name for the output
     * @param directory directory that was analyzed (NOT the directory to the output is written to - that will go in the same directory devskim was run from)
     */
    public WriteToFile(outputFile : string, directory : string)
    {
        let fs  = require("fs");
        
        fs.writeFile(outputFile, JSON.stringify(this.SarifFileObject , null, 4), (err)=> {});  
        console.log("Analyzed all files under \"%s\" and wrote the findings to %s", directory, outputFile);
    }    
}