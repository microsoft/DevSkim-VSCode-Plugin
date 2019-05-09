import * as LSP from 'vscode-languageserver'
import DevSkimServer from './devskimServer'
const pkg = require('../package')

export function listen() {
    const connection: LSP.IConnection = LSP.createConnection(
        new LSP.StreamMessageReader(process.stdin),
        new LSP.StreamMessageWriter(process.stdout),
    );

    connection.onInitialize((params: LSP.InitializeParams): Promise<LSP.InitializeResult> => {
        connection.console.log(`Initialized server v. ${pkg.version}, ${params.workspaceFolders[0].uri}`);
        return DevSkimServer.initialize(connection, params)
            .then(server => {
                server.register(connection);
                return server;
            })
            .then(server => ({
                capabilities: server.capabilities(),
            }));
    });

    connection.listen()
}