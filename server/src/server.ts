import * as net from 'net';
import DevSkimServer from './devskimServer'
import {
    Connection,
    createConnection, InitializeParams, InitializeResult, ProposedFeatures, TextDocuments,
} from "vscode-languageserver";
import {StreamMessageReader, StreamMessageWriter} from "vscode-jsonrpc";
import ReadableStream = NodeJS.ReadableStream;
import WritableStream = NodeJS.WritableStream;
const pkg = require('../package');

export let connectionCtr = 0;

export class DevSkimMain {
    static instance: DevSkimMain = undefined;
    static connection: Connection = undefined;

    constructor() {
        if (DevSkimMain.instance != undefined) {
            return DevSkimMain.instance;
        }
        DevSkimMain.instance = this;
    }

    public listen(): void {
        if (DevSkimMain.connection === undefined) {
            connectionCtr++;
            let pipeName = '';
            let bToPipe = false;

            console.log(`index: listen(${connectionCtr})`);
            let idxOfPipe = process.argv.indexOf('--pipe');
            console.log(`index: listen(idxOfPipe - ${idxOfPipe}, process.argv.length - ${process.argv.length})`);
            if ( idxOfPipe != -1 && process.argv.length > (idxOfPipe+1) ) {
                pipeName = process.argv[idxOfPipe + 1];
                bToPipe = true;
            }

            DevSkimMain.connection = bToPipe
                ? this.createConnectionToPipes(pipeName)
                : createConnection(ProposedFeatures.all);

            const documents: TextDocuments = new TextDocuments();

            DevSkimMain.connection.onInitialize((params: InitializeParams): Promise<InitializeResult> => {
                DevSkimMain.connection.console.log(`Initialized server v. ${pkg.version}`);
                return DevSkimServer.initialize(documents, DevSkimMain.connection, params)
                    .then(async server => {
                        await server.loadRules();
                        await server.register(DevSkimMain.connection);
                        return server;
                    })
                    .then((server) => ({
                        capabilities: server.capabilities(),
                    }));
            });

            documents.listen(DevSkimMain.connection);
            DevSkimMain.connection.console.log(`index: now listening on documents ...`);

            DevSkimMain.connection.listen();
            DevSkimMain.connection.console.log(`index: now listening on connection ...`);
        }
    }

    private createPipes(pipeName: string) {
        const pipePath = '\\\\.\\pipe\\devskim.';
        const iPipeName = `${pipePath}${pipeName}.input`;
        const oPipeName = `${pipePath}${pipeName}.output`;

        console.log(`pipeName: ${pipeName}`);

        const iPipe = net.createConnection(`${pipePath}${iPipeName}`, () => {
            console.log(`Connected to input pipe`);
        });
        const oPipe = net.createConnection(`${pipePath}${oPipeName}`, () => {
            console.log(`Connected to output pipe`);
        });
        return [iPipe, oPipe];
    }

    private createConnectionToPipes(pipeName) {

        const pipes = this.createPipes(pipeName);
        return createConnection(
            new StreamMessageReader(pipes[0] as ReadableStream),
            new StreamMessageWriter(pipes[1] as WritableStream),
        );
    }
}

new DevSkimMain().listen();
