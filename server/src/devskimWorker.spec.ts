import {DevSkimSettings} from "./devskimObjects";
import {DevSkimWorker} from "./devskimWorker";
import {IConnection} from "vscode-languageserver";
import {DevSkimSuppression} from "./suppressions";

describe('DevSkimWorker', () => {
    let dsw: DevSkimWorker;
    const mockLoadRules = jest.fn(() => {});
    const mockConstructor = jest.fn(() => {});
    const mockDevSkimSuppressions = jest.fn(() => {});

    beforeAll(() => {

    });

    it('is created', async () => {
        let ruleDir = String.raw`C:\Users\v-dakit\.vscode\extensions\ms-devskim.vscode-devskim-0.2.2\rules`;
        process.env.DEV_SKIM_RULES_DIRECTORY = ruleDir;
        let connection: IConnection;
        let dsSuppressions: DevSkimSuppression;

        let dsw = new DevSkimWorker(connection, dsSuppressions);
        expect(dsw).toBeInstanceOf(DevSkimWorker);
        expect(dsw.rulesDirectory).toBe(ruleDir)

    });
});
