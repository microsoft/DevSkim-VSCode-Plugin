import * as LSP from "vscode-languageserver";
import { DevSkimWorker } from "./devskimWorker";

export default class DevSkimServer {
    public static initialize(connection: LSP.Connection, params: LSP.InitializeParams): DevSkimServer {
        return new DevSkimServer(connection, new DevSkimWorker());
    }
    
    private constructor(private connection: LSP.Connection, private analyzer: DevSkimWorker) {
    }
    
}