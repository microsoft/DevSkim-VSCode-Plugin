const path = require('path');
import {DevSkimWorker} from "../src/devskimWorker";
import {Connection} from "vscode-languageserver";
import {DevSkimSuppression} from "../src/suppressions";

describe('DevSkimWorker', () => {
    const connection: any = { console: { log: (s) => (console.log(s)) } } as Connection;

    it('is created', async () => {
        const ruleDir = path.join(__dirname, "server/data/rules");
        process.env.DEV_SKIM_RULES_DIRECTORY = ruleDir;
        let dsSuppressions: DevSkimSuppression;

        let dsw = new DevSkimWorker(connection, dsSuppressions);
        expect(dsw).toBeInstanceOf(DevSkimWorker);
        expect(dsw.rulesDirectory).toBe(ruleDir)

    });
});
