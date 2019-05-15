import {DevSkimSettings} from "../src/devskimObjects";
import {DevSkimWorker} from "../src/devskimWorker";
import {IConnection} from "vscode-languageserver";
import {DevSkimSuppression} from "../src/suppressions";

describe('DevSkimWorker', () => {
    let dsw: DevSkimWorker;
    const mockLoadRules = jest.fn(() => {});
    const mockConstructor = jest.fn(() => {});
    const mockDevSkimSuppressions = jest.fn(() => {});

    beforeAll(() => {

    });

    it('is created', async () => {
        // let ruleDir = String.raw`C:\Users\v-dakit\.vscode\extensions\ms-devskim.vscode-devskim-0.2.2\rules`;
        const ruleDir = String.raw`C:/Users/v-dakit/DevSkimRules`;
        process.env.DEV_SKIM_RULES_DIRECTORY = ruleDir;
        let connection: IConnection;
        let dsSuppressions: DevSkimSuppression;

        let dsw = new DevSkimWorker(connection, dsSuppressions);
        expect(dsw).toBeInstanceOf(DevSkimWorker);
        expect(dsw.rulesDirectory).toBe(ruleDir)

    });
});
