const path = require("path");
import {DevSkimWorker} from "./devskimWorker";

describe('DevSkimWorker', () => {
    let dsw: DevSkimWorker;

    beforeAll(() => {
        dsw = new DevSkimWorker();
    });

    it('is created', async () => {
        expect(dsw).toBeInstanceOf(DevSkimWorker);
        expect(dsw.getRulesDirectory()).toEqual(path.join(__dirname, '..', 'rules'));

        await dsw.init();
        expect(dsw.ruleCount()).toEqual(10);
    });
});