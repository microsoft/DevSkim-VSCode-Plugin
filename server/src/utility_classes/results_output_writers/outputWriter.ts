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
export interface outputWriter
{

    /**
     * Set up the interface
     * @param settings the settings that this instance of DevSkim Analysis was with
     * @param analyzedDirectory directory that was analyzed (NOT the directory to the output is written to - that will go in the same directory devskim was run from)
     * @param outputFilePath (optional) full file name for the output.  If not specified, info is written to console     
     */
    initialize(settings : DevSkimObjects.IDevSkimSettings, analyzedDirectory: string, outputFilePath ?: string ) : void;

    /**
     * Each folder with git repo info and files should go under its own run, as well as the parent directory
     * if it contains files, even if it does not have git info.  This populates information to be written out
     * from that run
     * @param analysisRun all of the information from the analysis of a directory and its contents/sub-directories 
     */
    createRun(analysisRun : DevSkimObjects.Run) : void;


    /**
     * Output the current findings that have been added with createRun.  If writing to a file, this will use the file path
     * specified during the initialize call, and will overwrite any existing file already there
     */    
    writeFindings() : void;
}

/** various formats that the output may be written as */
export enum OutputFormats
{
    CLI,
    SARIF21
}


