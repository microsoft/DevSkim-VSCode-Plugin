import {Connection} from 'vscode-languageserver';
jest.mock('vscode-languageserver');
import {RulesLoader} from './RulesLoader';
import {noop} from "@babel/types";

describe('RulesLoader', () => {

    const mockConnection: any = {
       console: {
           log: (s) => (console.log(s)),
       },
    } as Connection;

    it('will read 81 rules', async () => {
        let ruleDir = String.raw`C:/Users/v-dakit/DevSkimRules`;
        process.env.DEV_SKIM_RULES_DIRECTORY = ruleDir;

        const loader = new RulesLoader(mockConnection, true, ruleDir);
        const rules = await loader.loadRules();
        expect(rules.length).toEqual(81);
    });
});