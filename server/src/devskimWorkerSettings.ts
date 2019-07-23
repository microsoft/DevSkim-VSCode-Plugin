import { IDevSkimSettings } from "./devskimObjects";
import * as path from "path";
import { IConnection } from 'vscode-languageserver';


export class DevSkimWorkerSettings
{

    private settings: IDevSkimSettings;

    public getSettings(settings?: IDevSkimSettings): IDevSkimSettings
    {
        if (settings)
        {
            this.settings = settings;
            return this.settings;
        }
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

    public static getRulesDirectory(connection: IConnection): string
    {
        const configRulesDir = DevSkimWorkerSettings.getRulesDirectoryFromEnvironment();
        const rulesDir = configRulesDir || path.join(__dirname, "../data/rules");
        connection.console.log(`DevSkimWorkerSettings: getRulesDirectory - ${rulesDir}`);
        return rulesDir;
    }

    public static defaultSettings(): IDevSkimSettings
    {
        return {
            enableBestPracticeRules: true,
            enableDefenseInDepthSeverityRules: false,
            enableInformationalSeverityRules: false,
            enableLowSeverityRules: false,
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
            validateRulesFiles: true,
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
