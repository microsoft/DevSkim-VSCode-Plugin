/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * 
 * This file contains a wrapper for the settings interface, providing additional utility functions
 * 
 * ------------------------------------------------------------------------------------------ */
import { IDevSkimSettings } from "./devskimObjects";
import * as path from "path";
import { IConnection } from 'vscode-languageserver';

/**
 * Wrapper class for IDevSkimSettings interface, providing additional functionality on top of the
 * raw data structure in the interface
 */
export class DevSkimWorkerSettings
{

    private settings: IDevSkimSettings;

    /**
     * Update the settings used by this object
     * @param settings the new settings
     */ 
    public setSettings(settings: IDevSkimSettings)
    {
        let defaults : IDevSkimSettings = DevSkimWorkerSettings.defaultSettings();

        settings.enableBestPracticeRules = (settings.enableBestPracticeRules != undefined && settings.enableBestPracticeRules != null) ?
                                            settings.enableBestPracticeRules : defaults.enableBestPracticeRules;

        settings.enableManualReviewRules = (settings.enableManualReviewRules != undefined && settings.enableManualReviewRules != null) ?
                                            settings.enableManualReviewRules : defaults.enableManualReviewRules;      
        
        settings.guidanceBaseURL = (settings.guidanceBaseURL != undefined && settings.guidanceBaseURL != null && settings.guidanceBaseURL.length > 0) ?
                                            settings.guidanceBaseURL : defaults.guidanceBaseURL; ;      

        this.settings = settings;
    }

    /**
     * Get the current settings for this object
     * @returns {DevSkimProblem[]} the current settings
     */
    public getSettings(): IDevSkimSettings
    {
        if (this.settings)
        {
            return this.settings;
        }
        if (!this.settings)
        {
            this.settings = DevSkimWorkerSettings.defaultSettings();
        }
        return this.settings;
    }

    /**
     * Determine where the rules live, given the executing context of DevSkim (CLI, IDE, etc.)
     * @param connection 
     */
    public static getRulesDirectory(connection: IConnection): string
    {
        const configRulesDir = DevSkimWorkerSettings.getRulesDirectoryFromEnvironment();
        const rulesDir = configRulesDir || path.join(__dirname, "../data/rules");
        connection.console.log(`DevSkimWorkerSettings: getRulesDirectory - ${rulesDir}`);
        return rulesDir;
    }

    /**
     * generate a default settings object for scenarios where the settings may not be available
     * e.g. for the CLI, or on first startup before the IDE configuration has synced
     */
    public static defaultSettings(): IDevSkimSettings
    {
        return {
            enableBestPracticeRules: false,
            enableManualReviewRules: true,
            guidanceBaseURL: "https://github.com/Microsoft/DevSkim/blob/master/guidance/",
            ignoreFilesList: [
                "out/*",
                "bin/*",
                "node_modules/*",
                ".vscode/*",
                "yarn.lock",
                "logs/*",
                "*.log",
                "*.git",
                "rulesValidationLog.json",
            ],
            ignoreRulesList: [],
            manualReviewerName: "",
            removeFindingsOnClose: true,
            suppressionDurationInDays: 30,
            validateRulesFiles: false,
        };
    }

    public static getRulesDirectoryFromEnvironment(): string | null
    {
        const { DEV_SKIM_RULES_DIRECTORY } = process.env;

        let value = null;

        // When DEV_SKIM_RULES_DIRECTORY is not defined and assigned
        if ((typeof DEV_SKIM_RULES_DIRECTORY === 'string') && DEV_SKIM_RULES_DIRECTORY !== 'undefined')
        {
            value = DEV_SKIM_RULES_DIRECTORY;
        }

        // When DEV_SKIM_RULES_DIRECTORY is defined but not assigned
        if (typeof DEV_SKIM_RULES_DIRECTORY === 'string' && DEV_SKIM_RULES_DIRECTORY === "undefined")
        {
            value = null;
        }

        // When DEV_SKIM_RULES_DIRECTORY is undefined
        if (typeof DEV_SKIM_RULES_DIRECTORY === 'undefined')
        {
            value = null;
        }
        return value;
    }
}
