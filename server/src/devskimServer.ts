/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 *
 * Bulk of LSP logic
 * 
 * @export
 * @class DevSkimServer
 */
import { noop } from "@babel/types";
import
{
    CodeActionParams, Connection, Diagnostic, DidChangeConfigurationParams, InitializedParams, Hover,
    InitializeParams, RequestType, ServerCapabilities, TextDocument, TextDocuments, TextDocumentPositionParams,
    DidChangeWatchedFilesParams,
} from "vscode-languageserver";

import { Command, TextEdit } from 'vscode-languageserver-protocol';
import { TextDocumentIdentifier } from 'vscode-languageserver-types';

import { AutoFix, DevSkimProblem, DevSkimSettings, Fixes, IDevSkimSettings } from "./devskimObjects";
import { DevSkimWorker } from "./devskimWorker";
import { DevSkimWorkerSettings } from "./devskimWorkerSettings";
import { DevSkimSuppression } from "./utility_classes/suppressions";

/**
 * 
 */
export default class DevSkimServer
{

    public static instance: DevSkimServer;

    /**
     * 
     * @param documents 
     * @param connection 
     * @param worker 
     */
    private constructor(private documents: TextDocuments, private connection: Connection, private worker: DevSkimWorker)
    {
        this.globalSettings = worker.dswSettings.getSettings();
    }

    /**
     * 
     * @param documents 
     * @param connection 
     * @param params 
     */
    public static async initialize(documents: TextDocuments, connection: Connection, params: InitializedParams): Promise<DevSkimServer>
    {
        const dsWorkerSettings = new DevSkimWorkerSettings();
        const dsSettings = dsWorkerSettings.getSettings();
        const dsSuppression = new DevSkimSuppression(dsSettings);

        const worker = new DevSkimWorker(connection, dsSuppression, dsSettings);
        DevSkimServer.instance = new DevSkimServer(documents, connection, worker);
        return DevSkimServer.instance;
    }

    /**
     * 
     */
    public async loadRules(): Promise<void>
    {
        return this.worker.init();
    }

    /**
     * 
     * @param connection 
     */
    public register(connection: Connection): void
    {
        this.documents.listen(this.connection);
        
        //I don't know why this code was added when a handler is separately registered below - it doesn't make much sense to me
        //and was causing analysis to run TWICE every time the document changed.  Commenting out for now, in case I missed the logic
        //for it
   /*     this.documents.onDidChangeContent(change =>
        {

            const problems = this.worker.analyzeText(change.document.getText(),
                change.document.languageId, change.document.uri);

            for (let problem of problems)
            {
                let diagnostic: Diagnostic = problem.makeDiagnostic(this.worker.dswSettings);
                this.diagnostics.push(diagnostic);

                for (let fix of problem.fixes)
                {
                    this.worker.recordCodeAction(change.document.uri, change.document.version,
                        diagnostic.range, diagnostic.code, fix, problem.ruleId);
                }
            }
        });*/

        // connection handlers
        connection.onInitialize(this.onInitialize.bind(this));
        connection.onCodeAction(this.onCodeAction.bind(this));
        connection.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this));
        connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles.bind(this));
        connection.onHover(this.onHover.bind(this));
        connection.onRequest(ReloadRulesRequest.type, this.onRequestReloadRulesRequest.bind(this));
        connection.onRequest(ValidateDocsRequest.type, this.onRequestValidateDocsRequest.bind(this));

        // document handlers
        this.documents.onDidOpen(this.onDidOpen.bind(this));
        this.documents.onDidClose(this.onDidClose.bind(this));
        this.documents.onDidChangeContent(this.onDidChangeContent.bind(this));
    }

    /**
     * 
     */
    public capabilities(): ServerCapabilities
    {
        // @todo: review this to find the best implementation
        return {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: this.documents.syncKind,
            codeActionProvider: true,
        };
    }

    // Document handlers
    private onDidOpen(change)
    {
        this.connection.console.log(`DevSkimServer: onDidOpen(${change.document.uri})`);
        // this.validateTextDocument(change.document);
    }

    /**
     * 
     * @param change 
     */
    private onDidClose(change)
    {
        if (this.globalSettings.removeFindingsOnClose)
        {
            let diagnostics: Diagnostic[] = [];
            this.connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
        }
    }

    /**
     * 
     * @param change 
     */
    private onDidChangeContent(change): Promise<void>
    {
        this.connection.console.log(`DevSkimServer: onDidChangeContent(${change.document.uri})`);
        return this.validateTextDocument(change.document);
    }

    // Connection Handlers
    private onInitialize(params: InitializeParams): void
    {
        let capabilities = params.capabilities;
        this.hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
        this.hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

        this.hasDiagnosticRelatedInformationCapability = !!(
            capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation
        );
        this.workspaceRoot = params.rootPath;
    }

    /**
     * 
     * @param params 
     */
    private onRequestValidateDocsRequest(params: ValidateDocsParams): void
    {
        for (let docs of params.textDocuments)
        {
            let textDocument = this.documents.get(docs.uri);

            this.connection.console.log(`DevSkimServer: onRequestValidateDocsRequest(${textDocument.uri})`);
            this.validateTextDocument(textDocument);
        }
    }

    /**
     * 
     */
    private onRequestReloadRulesRequest()
    {
        this.worker.refreshAnalysisRules();
    }

    /**
     * 
     * @param params 
     */
    private onCodeAction(params: CodeActionParams): Command[]
    {
        this.codeActions = [];
        let uri = params.textDocument.uri;
        let edits = this.worker.codeActions[uri];

        if (!edits)
        {
            return;
        }

        let fixes = new Fixes(edits);
        if (fixes.isEmpty())
        {
            return;
        }

        let documentVersion = -1;

        function createTextEdit(editInfo: AutoFix): TextEdit
        {
            return TextEdit.replace(editInfo.edit.range, editInfo.edit.text || '');
        }

        for (let editInfo of fixes.getScoped(params.context.diagnostics))
        {
            documentVersion = editInfo.documentVersion;
            this.codeActions.push(Command.create(editInfo.label, 'devskim.applySingleFix', uri, documentVersion,
                [createTextEdit(editInfo)]));
        }
        return this.codeActions;
    }

    /**
     * 
     * @param change 
     */
    private onDidChangeConfiguration(change: DidChangeConfigurationParams): void
    {
        //this was part of the template but I basically ignore it.  The settings should
        //be updated to allow rulesets to be turned on and off, and this is where we would
        //get notified that the user did so
        if (this.hasConfigurationCapability)
        {
            this.documentSettings.clear();
        } 
        else
        {
            if(change.settings != undefined)
            {
                this.globalSettings = (change.settings.devskim) ? change.settings.devskim : change.settings;
            }          
        }

        // Revalidate any open text documents
        this.documents.all().forEach((td: TextDocument) =>
        {
            this.connection.console.log(`DevSkimServer: onDidChangeConfiguration(${td.uri})`);
            return this.validateTextDocument(td);
        });
    }

    /**
     * 
     */
    private onDidChangeWatchedFiles(change: DidChangeWatchedFilesParams): void
    {
        noop;
    }

    /**
     * 
     * @param pos 
     */
    private onHover(pos: TextDocumentPositionParams): Promise<Hover>
    {
        this.connection.console.log(`onHover: ${pos.position.line}:${pos.position.character}`);
        return null;
    }

    private getDocumentSettings(resource: string): Thenable<DevSkimSettings>
    {
        if (!this.hasConfigurationCapability)
        {
            return Promise.resolve(this.globalSettings);
        }
        let result: any = this.documentSettings.get(resource);
        if (!result)
        {
            result = this.connection.workspace.getConfiguration({
                scopeUri: resource,
                section: 'devskim',
            });
            this.documentSettings.set(resource, result);
        }

        //if this is grabbed from the configuration than result isn't actually the settings object 
        //its an object with the settings object assigned to the "devskim" property
        result = (result.devskim != undefined) ? result.devskim : result;
        return result;
    }

    /**
     * Trigger an analysis of the provided document and record the code actions and diagnostics generated by the analysis
     *
     * @param {TextDocument} textDocument document to analyze
     */
    private async validateTextDocument(textDocument: TextDocument): Promise<void>
    {
        if (textDocument && textDocument.uri)
        {
            this.connection.console.log(`DevSkimServer: validateTextDocument(${textDocument.uri})`);
            let diagnostics: Diagnostic[] = [];
            let settings = await this.getDocumentSettings(textDocument.uri);
            if (!settings)
            {
                settings = this.globalSettings;
            }
            if (settings)
            {
                delete this.worker.codeActions[textDocument.uri];
                this.worker.UpdateSettings(settings);

                const problems: DevSkimProblem[] =
                    await this.worker.analyzeText(textDocument.getText(), textDocument.languageId, textDocument.uri);

                for (let problem of problems)
                {
                    let diagnostic: Diagnostic = problem.makeDiagnostic(this.worker.dswSettings);
                    diagnostics.push(diagnostic);

                    for (let fix of problem.fixes)
                    {
                        this.worker.recordCodeAction(textDocument.uri, textDocument.version,
                            diagnostic.range, diagnostic.code, fix, problem.ruleId);
                    }
                }
            }
            // Send the computed diagnostics to VSCode.
            this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
        }
    }

    private codeActions: Command[] = [];
    private diagnostics: Diagnostic[] = [];
    private documentSettings: Map<string, Thenable<DevSkimSettings>> = new Map();
    private globalSettings: IDevSkimSettings;
    private hasConfigurationCapability = false;
    private hasWorkspaceFolderCapability = false;
    private hasDiagnosticRelatedInformationCapability = false;
    private workspaceRoot: string;
}

export class ReloadRulesRequest
{
    public static type = new RequestType<{}, void, void, void>('devskim/validaterules')
}

interface ValidateDocsParams
{
    textDocuments: TextDocumentIdentifier[];
}

export class ValidateDocsRequest
{
    public static type: RequestType<ValidateDocsParams, void, void, void> = new RequestType<ValidateDocsParams, void, void, void>(
        'textDocument/devskim/validatedocuments')
}


