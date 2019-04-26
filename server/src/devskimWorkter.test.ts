import {Settings} from "./devskimObjects";
import {DevSkimWorker} from "./devskimWorker";
import {IConnection} from "vscode-languageserver";

describe('DevSkimWorker', () => {
    let dsw: DevSkimWorker;
    const mockLoadRules = jest.fn(() => {});
    const mockConstructor = jest.fn(() => {});

    beforeAll(() => {

    });

    it('is created', async () => {
        let connection: IConnection;
        jest.mock("./devskimWorker", () => ( {
              DevSkimWorker: jest.fn().mockImplementation(() => ({
                  constructor: mockConstructor,
                  loadRules: mockLoadRules
              })),
            }));

        let rulesDir = String.raw`C:\Users\v-dakit\.vscode\extensions\ms-devskim.vscode-devskim-0.2.2\rules`;
        dsw = new DevSkimWorker(connection, rulesDir, getSettingsFromClient());
        expect(dsw).toBeInstanceOf(DevSkimWorker);
        const dsDir = dsw.getRulesDirectory();
        expect(dsDir).toEqual(rulesDir);
        expect(dsw.ruleCount()).toEqual(10);
    });

});

function getSettingsFromClient() {
    let settings = {
        devskim: {}
    };
    settings.devskim = fakedevSkimSettings();
    return <Settings>settings;
}

function fakedevSkimSettings() {
    return {
        enableManualReviewRules: true,
        manualReviewerName: "",
        enableBestPracticeRules: true,
        suppressionDurationInDays: 30,
        guidanceBaseURL: "https://github.com/Microsoft/DevSkim/blob/master/guidance/",
        ignoreFilesList: [
                "out/*",
                "bin/*",
                "node_modules/*",
                ".vscode/*",
                "yarn.lock",
                "logs/*",
                "*.log",
                "*.git"
        ],
        ignoreRulesList: [],
        validateRulesFiles: true,
        removeFindingsOnClose: false,
    }
}