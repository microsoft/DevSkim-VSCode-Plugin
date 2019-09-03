/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * html writer output writer class
 * 
 */

import * as DevSkimObjects from "../../../devskimObjects";
import {IDevSkimResultsWriter, IDevSkimFileWriter} from "../outputWriter";

/**
 * Class to write output out in an HTML file, intended for human readability
 * The correct order to use this is initialize, (optional) setOutputLocale, createRun for each run, writeOutput 
 */
export class HTMLResultWriter implements IDevSkimResultsWriter,IDevSkimFileWriter
{
    //settings object that this run of DevSkim analysis executed with
    protected runSettings : DevSkimObjects.IDevSkimSettings;
    private outputLocation : string = "";
    private workingDirectory : string;

     /**
     * Get the default file name that output will be written to, absent a user specified file name
     * @return the default file name. to be used if no file name was provided from the command line
     */    
    getDefaultFileName(): string
    {
        return "devskim_results.html";
    }

    /**
     * Sets where the output is sent.  If an empty string, output is echoed to the console, otherwise the output is 
     * used as a file name.  If not a full path, it will write to the current working directory
     * @param outputLocale location to write output to
     */
    setOutputLocale(outputLocale : string) : void
    {
        //add a file extension if they left it off
        if(outputLocale.length > 0 && outputLocale.indexOf(".") == -1)
        {
            outputLocale = outputLocale + ".html";
        }
        this.outputLocation = outputLocale;
    }

     /**
     * Set up the HTML object, recording the settings this analysis was run under, and
     * the top level tool information (version, schema, etc.)
     * @param settings the settings that this instance of DevSkim Analysis was with
     * @param analyzedDirectory directory that was analyzed (NOT the directory to the output is written to - that will go in the same directory devskim was run from)
     */
    initialize(settings: DevSkimObjects.IDevSkimSettings, analyzedDirectory: string): void
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
        throw new Error('Method not implemented.');
    }

    /**
     * Output the current findings that have been added with createRun.  This will use the file path
     * specified during the setOutputLocale call, and will overwrite any existing file already there. Will write as a human usable
     * HTML file
     * 
     * If the outputLocation string is an empty string, it will instead be written to the console
     */ 
    writeOutput(): void
    {
        throw new Error('Method not implemented.');
    }
    
}