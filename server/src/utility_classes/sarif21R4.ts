/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * Handles writing the file output in SARIF v2.1 RTM 4 format
 * 
 */

import * as SARIF21R4 from "@schemastore/sarif-2.1.0-rtm.4";
import * as DevSkimObjects from "../devskimObjects";

export class Sarif21R4
{
    private SarifFileObject : SARIF21R4.StaticAnalysisResultsFormatSARIFVersion210Rtm4JSONSchema;
    
    /**
     * 
     * @param settings 
     */
    constructor(private settings : DevSkimObjects.IDevSkimSettings)
    {
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
     * 
     * @param rules 
     */
    public AddRules(rules : DevSkimObjects.Rule[])
    {
        this.SarifFileObject.runs[0].tool.driver.rules = [];
        for(let rule of rules)
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
                    default: newSarifRule.defaultConfiguration = {"level": "note"};
                }
                //sarif doesn't have a field for the security severity, so put it in a property bag
                newSarifRule.properties = {"severity": rule.severity};
                this.SarifFileObject.runs[0].tool.driver.rules.push(newSarifRule);
            }
        }
    }

    public AddFiles(files : DevSkimObjects.FileInfo[])
    {
        this.SarifFileObject.runs[0].artifacts = [];

        for(let file of files)
        {
            let sarifFile : SARIF21R4.Artifact = Object.create(null);
            sarifFile.location = Object.create(null);
            sarifFile.location.uri = file.fileURI;
            sarifFile.length = file.fileSize;
            sarifFile.sourceLanguage = file.sourceLanguage;
            this.SarifFileObject.runs[0].artifacts.push(sarifFile);
        }
    }

    public AddResults(problems : DevSkimObjects.DevSkimProblem[])
    {
        this.SarifFileObject.runs[0].results = [];
        for(let problem of problems)
        {
            let sarifResult : SARIF21R4.Result = Object.create(null);
            sarifResult.ruleId = problem.ruleId;
            switch(problem.severity)
            {
                case DevSkimObjects.DevskimRuleSeverity.Critical:
                case DevSkimObjects.DevskimRuleSeverity.Important:
                case DevSkimObjects.DevskimRuleSeverity.Moderate:    sarifResult.level = "error";
                default: sarifResult.level = "note";
            }
        }
    }


    public WriteToFile(outputFile : string, directory : string)
    {
        let fs  = require("fs");
        
        fs.writeFile(outputFile, JSON.stringify(this.SarifFileObject , null, 4), (err)=> {});  
        console.log("Analyzed all files under %s and wrote the findings to %s", directory, outputFile);
    }    
}