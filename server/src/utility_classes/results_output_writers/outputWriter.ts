/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * Handles writing the file output in SARIF v2.1 RTM 4 format
 * 
 */
import * as DevSkimObjects from "../../devskimObjects";

/**
 * Abstract Implementation fo CLI output formats
 */
export interface IDevSkimResultsWriter
{
    /**
     * Set up the interface
     * @param settings the settings that this instance of DevSkim Analysis was with
     * @param analyzedDirectory directory that was analyzed (NOT the directory to the output is written to - that will go in the same directory devskim was run from)    
     */
    initialize(settings : DevSkimObjects.IDevSkimSettings, analyzedDirectory: string) : void;

    /**
     * Each folder with git repo info and files should go under its own run, as well as the parent directory
     * if it contains files, even if it does not have git info.  This populates information to be written out
     * from that run
     * @param analysisRun all of the information from the analysis of a directory and its contents/sub-directories 
     */
    createRun(analysisRun : DevSkimObjects.Run) : void;    
}

/**
 * Abstract Implementation fo CLI output formats
 */
export interface IDevSkimSettingsWriter
{
    /**
     * Set up the interface
     * @param settings the settings being written to output
     */
    initialize(settings : DevSkimObjects.IDevSkimSettings) : void;
}

/**
 * Interface shared by all of the various file writers - results, rules, settings
 */
export interface IDevSkimFileWriter
{
     /**
     * Get the default file name that output will be written to, absent a user specified file name
     * @return the default file name. to be used if no file name was provided from the command line
     */   
    getDefaultFileName() : string;

    /**
    * Sets where the output should be 
    */    
   setOutputLocale(outputLocale : string) : void;

    /**
     * Output the current findings/rules/settings.  If writing to a file, this will use the file path
     * specified during the initialize call, and will overwrite any existing file already there
     */    
    writeOutput() : void;
}

/** various formats that the output may be written as */
export enum OutputFormats
{
    Text,
    SARIF21,
    HTML,
    CSV,
    JSON
}


