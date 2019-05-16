import DevSkimServer from './devskimServer'
import {
    createConnection, InitializeParams, InitializeResult, ProposedFeatures, TextDocuments,
} from "vscode-languageserver";

const pkg = require('../package');

export function listen() {
    console.log(`index: listen()`);
    const connection = createConnection(ProposedFeatures.all);
    const documents: TextDocuments = new TextDocuments();

    connection.onInitialize((params: InitializeParams): Promise<InitializeResult> => {
        connection.console.log(`Initialized server v. ${pkg.version}`);
        return DevSkimServer.initialize(documents, connection, params)
            .then(async server => {
                await server.loadRules();
                await server.register(connection);
                return server;
            })
            .then((server) => ({
                capabilities: server.capabilities(),
            }));
    });


    documents.listen(connection);
    connection.console.log(`index: now listening on documents ...`);

    connection.listen();
    connection.console.log(`index: now listening on connection ...`);
}

listen();
