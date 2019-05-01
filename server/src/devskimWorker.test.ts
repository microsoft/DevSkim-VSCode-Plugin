import {DevSkimSettings} from "./devskimObjects";
import {DevSkimWorker} from "./devskimWorker";
import {IConnection} from "vscode-languageserver";

describe('DevSkimWorker', () => {
    let dsw: DevSkimWorker;
    const mockLoadRules = jest.fn(() => {});
    const mockConstructor = jest.fn(() => {});

    beforeAll(() => {

    });

    it('is created', async () => {
        let ruleDir = String.raw`C:\Users\v-dakit\.vscode\extensions\ms-devskim.vscode-devskim-0.2.2\rules`;
        process.env.DEV_SKIM_RULES_DIRECTORY = ruleDir;
        let connection: IConnection;

        let dsw = new DevSkimWorker(connection);
        expect(dsw).toBeInstanceOf(DevSkimWorker);
        expect(dsw.rulesDirectory).toBe(ruleDir)

    });

});
