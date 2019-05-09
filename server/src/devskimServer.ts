import * as LSP from 'vscode-languageserver';
import {TextDocumentIdentifier} from 'vscode-languageserver-types';
import {DevSkimWorker} from "./devskimWorker";
import {AutoFix, DevSkimProblem, DevSkimSettings, Fixes, IDevSkimSettings} from "./devskimObjects";
import {DevSkimSuppression} from "./suppressions";
import {
    CodeActionParams,
    DidChangeConfigurationParams,
    InitializeParams,
    NotificationHandler,
    RequestType,
} from "vscode-languageserver";
import {DevSkimWorkerSettings} from "./devskimWorkerSettings";
import {ReloadRulesRequest} from "./server.old";
import {DidChangeWatchedFilesParams} from "vscode-languageserver";
import {Command, TextEdit} from 'vscode-languageserver-protocol';

import {noop} from "@babel/types";

export default class DevSkimServer {

    private workspaceRoot: string;
    private documents: LSP.TextDocuments = new LSP.TextDocuments();
    private diagnostics: LSP.Diagnostic[] = [];
    private documentSettings: Map<string, Thenable<DevSkimSettings>> = new Map();
    private globalSettings: IDevSkimSettings;
    private codeActions: Command[] = [];
    private hasConfigurationCapability = false;
    private hasWorkspaceFolderCapability = false;
    private hasDiagnosticRelatedInformationCapability = false;


    private constructor(private connection: LSP.Connection, private analyzer: DevSkimWorker) {
        this.globalSettings  = analyzer.dswSettings.getSettings();
    }

    public static initialize(connection: LSP.Connection, params: LSP.InitializedParams): Promise<DevSkimServer> {
        connection.console.log(`DevSkimServer.initialize() : ${JSON.stringify(params)}`);
        return new Promise<DevSkimWorker>((resolve, reject) => {
            const dsWorkerSettings = new DevSkimWorkerSettings();
            const dsSettings = dsWorkerSettings.getSettings();
            const dsSuppression = new DevSkimSuppression(dsSettings);
            const worker = new DevSkimWorker(connection, dsSuppression, dsSettings);
            if (worker) {
                resolve(worker);
            } else {
                reject("Could not create DevSkimWorker");
            }
        }).then( (dsWorker ) => {
                return new DevSkimServer(connection, dsWorker);
            });
    }

    public register(connection: LSP.Connection): void {
        this.documents.listen(this.connection);
        this.documents.onDidChangeContent(change => {
            const uri = change.document.uri;
            const problems = this.analyzer.analyzeText(change.document.getText(),
                change.document.languageId, change.document.uri);
            for (let problem of problems) {
                let diagnostic: LSP.Diagnostic = problem.makeDiagnostic(this.analyzer.dswSettings);
                this.diagnostics.push(diagnostic);

                for (let fix of problem.fixes) {
                    this.analyzer.recordCodeAction(change.document.uri, change.document.version,
                        diagnostic.range, diagnostic.code, fix, problem.ruleId);
                }
            }
        });
        connection.onInitialize(this.onInitialize.bind(this));
        connection.onCodeAction(this.onCodeAction.bind(this));
        connection.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this));
        connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles.bind(this));
        connection.onRequest(ReloadRulesRequest.type, this.onRequestReloadRulesRequest.bind(this));
        connection.onRequest(ValidateDocsRequest.type, this.onRequestValidateDocsRequest.bind(this));

        this.documents.onDidOpen(this.onDidOpen.bind(this));
        this.documents.onDidClose(this.onDidClose.bind(this));
        this.documents.onDidChangeContent(this.onDidChangeContent.bind(this));

    }

    // Document handlers
    private onDidOpen(change) {
       this.validateTextDocument(change.document);
    }

    private onDidClose(change) {
        if (this.globalSettings.removeFindingsOnClose) {
            let diagnostics: LSP.Diagnostic[] = [];
            this.connection.sendDiagnostics({uri: change.document.uri, diagnostics});
        }
    }

    private onDidChangeContent(change) {
        this.validateTextDocument(change.document);
    }

    // Connection Handlers
    private onInitialize(params: InitializeParams): void {
        let capabilities = params.capabilities;
        this.hasConfigurationCapability = !!( capabilities.workspace && !!capabilities.workspace.configuration);
        this.hasWorkspaceFolderCapability = !!( capabilities.workspace && !!capabilities.workspace.workspaceFolders);

        this.hasDiagnosticRelatedInformationCapability = !!(
            capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation
        );
        this.workspaceRoot = params.rootPath;
    }

    public capabilities(): LSP.ServerCapabilities {
        return {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: this.documents.syncKind,
            codeActionProvider: true,
        };
    }

    private onRequestValidateDocsRequest(params: ValidateDocsParams): void {
        for (let docs of params.textDocuments) {
            let textDocument = this.documents.get(docs.uri);

            this.validateTextDocument(textDocument);
        }
    }

    private onRequestReloadRulesRequest() {
        this.analyzer.refreshAnalysisRules();
    }

    private onCodeAction(params: CodeActionParams): void {
        this.codeActions = [];
        let uri = params.textDocument.uri;
        let edits = this.analyzer.codeActions[uri];

        if (!edits) {
            return ;
        }

        let fixes = new Fixes(edits);
        if (fixes.isEmpty()) {
            return;
        }

        let documentVersion: number = -1;

        function createTextEdit(editInfo: AutoFix): TextEdit {
            return TextEdit.replace(editInfo.edit.range, editInfo.edit.text || '');
        }

        for (let editInfo of fixes.getScoped(params.context.diagnostics)){
            documentVersion = editInfo.documentVersion;
            this.codeActions.push(Command.create(editInfo.label, 'devskim.applySingleFix', uri, documentVersion,
                [ createTextEdit(editInfo)]));
        }
    }

    private onDidChangeConfiguration(change: DidChangeConfigurationParams): void {
        //this was part of the template but I basically ignore it.  The settings should
        //be updated to allow rulesets to be turned on and off, and this is where we would
        //get notified that the user did so
        if (this.hasConfigurationCapability) {
            this.documentSettings.clear();
        } else {
            this.globalSettings = change.settings || this.globalSettings;
        }

        // Revalidate any open text documents
        this.documents.all().forEach(this.validateTextDocument);
    }

    private onDidChangeWatchedFiles(change: DidChangeWatchedFilesParams): void {
       noop;
    }

    private getDocumentSettings(resource: string): Thenable<DevSkimSettings> {
        if (!this.hasConfigurationCapability) {
            return Promise.resolve(this.globalSettings);
        }
        let result: any = this.documentSettings.get(resource);
        if (!result) {
            result = this.connection.workspace.getConfiguration({
                scopeUri: resource,
                section: 'devskim',
            });
            this.documentSettings.set(resource, result);
        }
        return result;
    }

    /**
     * Trigger an analysis of the provided document and record the code actions and diagnostics generated by the analysis
     *
     * @param {TextDocument} textDocument document to analyze
     */
    private async validateTextDocument(textDocument: LSP.TextDocument): Promise<void> {

        if (textDocument && textDocument.uri) {
            let diagnostics: LSP.Diagnostic[] = [];
            let settings = await this.getDocumentSettings(textDocument.uri);
            if (!settings) {
                settings = this.globalSettings;
            }
            if (settings) {
                delete this.analyzer.codeActions[textDocument.uri];

                const problems: DevSkimProblem[] =
                    this.analyzer.analyzeText(textDocument.getText(), textDocument.languageId, textDocument.uri);

                for (let problem of problems) {
                    let diagnostic: LSP.Diagnostic = problem.makeDiagnostic(this.analyzer.dswSettings);
                    diagnostics.push(diagnostic);

                    for (let fix of problem.fixes) {
                        this.analyzer.recordCodeAction(textDocument.uri, textDocument.version,
                            diagnostic.range, diagnostic.code, fix, problem.ruleId);
                    }
                }
            }
            // Send the computed diagnostics to VSCode.
            this.connection.sendDiagnostics({uri: textDocument.uri, diagnostics});
        }
    }
}

interface ValidateDocsParams {
    textDocuments: TextDocumentIdentifier[];
}

export class ValidateDocsRequest {
    public static type: RequestType<ValidateDocsParams,void,void,void> = new RequestType<ValidateDocsParams, void, void, void>(
        'textDocument/devskim/validatedocuments')
}
