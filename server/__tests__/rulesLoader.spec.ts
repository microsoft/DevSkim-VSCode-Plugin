const path = require('path');
import {Connection} from 'vscode-languageserver';
jest.mock('vscode-languageserver');
import {RulesLoader} from '../src/rulesLoader';
import {noop} from "@babel/types";

describe('RulesLoader', () => {

    const mockConnection: any = {
       console: {
           log: (s) => (console.log(s)),
       },
    } as Connection;

    it('will read 81 rules', async () => {
        const ruleDir = path.join(__dirname, "server/data/rules");
        const loader = new RulesLoader(mockConnection, true, ruleDir);
        const rules = await loader.loadRules();
        expect(rules.length).toEqual(81);
    });
});