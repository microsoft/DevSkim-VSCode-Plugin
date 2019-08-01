/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * debug class to help with debugging/logging.  Controlled by settings
 *
 */


import { IConnection } from "vscode-languageserver";
import 
{
     IDevSkimSettings,
}    from "../devskimObjects";

/**
 * 
 */
export class DebugLogger
{
    private debugConsole;

    constructor(private settings: IDevSkimSettings, private connection?: IConnection)
    {
        this.debugConsole = (connection) ? connection.console : console;
    }
    
    public log(message : string)
    {
        if(true)
        {
            this.debugConsole.log(message);
        }
    }
}