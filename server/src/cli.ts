#!/usr/bin/env node

/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * entry point for CLI - Handles setting up and parsing command line,
 * orchestrating commands from the command line, etc.
 * 
 */

import {DevSkimCLI, CLIcommands} from "./devskimCLI";

var program = require("commander");  

//set up the command line options for the "analyze" command
program.command(CLIcommands.Analyze)
    .description('analyze the files in the specified directory for security mistakes')
    .option("-b, --best_practice", "include best practice findings in the output")
    .option("-m, --manual_review", "include manual review findings in the output")
    .option("-d, --directory [directory]", "The parent directory to containing the files to analyze.  If not provided, the current working directory is used")
    .option("-o, --output_file [outputFile]", "The file to write output into. If this option is set but no file specified, output is written to devskim_results.json")
    .action(function(options) {
        let cli: DevSkimCLI = new DevSkimCLI(CLIcommands.Analyze, options);
        cli.run();
    });

//set up the command line options for the "analyze" command
program.command(CLIcommands.inventoryRules)
    .description('output the inventory of currently installed analysis rules')
    .option("-t, --terse", "lists just the rule ID and name, but no summary")
    .option("-v, -validate", "validates each rule for errors in the construction of the rules")
    .option("-o, --output_file [outputFile]", "The file to write output into. If this option is set but no file specified, output is written to devskim_rules.html")
    .action(function(options) {
        let cli: DevSkimCLI = new DevSkimCLI(CLIcommands.inventoryRules, options);
        cli.run();
    });

program.parse(process.argv);