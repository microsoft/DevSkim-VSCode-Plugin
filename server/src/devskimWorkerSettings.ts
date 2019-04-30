import {IDevSkimSettings} from "./devskimObjects";
import * as path from "path";

export class DevSkimWorkerSettings {

    public static getSettings(settings?: IDevSkimSettings) {
        return settings ? settings : DevSkimWorkerSettings.defaultSettings();
    }

    public static getRulesDirectory() {
        let configRulesDir = DevSkimWorkerSettings.getDevSkimRulesDirectory();
        return configRulesDir || path.join(__dirname, "..", "rules");
    }

    private static getDevSkimRulesDirectory(): string | null {
        const {DEV_SKIM_RULES_DIRECTORY} = process.env;
        return typeof DEV_SKIM_RULES_DIRECTORY !== 'undefined' ? DEV_SKIM_RULES_DIRECTORY : null;
    }

    public static defaultSettings(): IDevSkimSettings {
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
                "rulesValidationLog.json"
            ],
            ignoreRulesList: [],
            manualReviewerName: "",
            removeFindingsOnClose: true,
            suppressionDurationInDays: 30,
            validateRulesFiles: true,
        };
    }
}
