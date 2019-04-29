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
        let connection: IConnection;
        jest.mock("./devskimWorker", () => ( {
              DevSkimWorker: jest.fn().mockImplementation(() => ({
                  constructor: mockConstructor,
                  loadRules: mockLoadRules
              })),
            }));

        let rulesDir = String.raw`C:\Users\v-dakit\.vscode\extensions\ms-devskim.vscode-devskim-0.2.2\rules`;
        dsw = new DevSkimWorker(connection, rulesDir, DevSkimWorker.defaultSettings());
        expect(dsw).toBeInstanceOf(DevSkimWorker);
    });

});
