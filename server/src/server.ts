/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ 
 * 
 * This file handles most of the VS Code language server functionality - synchronizing data and
 * settings with the client, building diagnostics and code actions, etc.  The actual work of analysis
 * is handled in devskimWorker.ts
 * 
 *  ------------------------------------------------------------------------------------------ */
'use strict';
import {
    IPCMessageReader, IPCMessageWriter, createConnection, IConnection,
    TextDocuments, TextDocument, Diagnostic,
    InitializeResult, RequestType, Command, TextEdit, TextDocumentIdentifier
} from 'vscode-languageserver';

import {Settings, DevSkimProblem, Fixes, AutoFix} from "./devskimObjects";
import {DevSkimWorker} from "./devskimWorker";

import * as config from './config';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

//Set up a new instance of a DevSkimWorker analysis engine.  This is the object that does all the real
//work of analyzing a file.  
const analysisEngine: DevSkimWorker = new DevSkimWorker(connection);

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities. 
let workspaceRoot: string;

connection.onInitialize((params): InitializeResult => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind,
            codeActionProvider: true
        }
    };
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

documents.onDidOpen((change) => {
    validateTextDocument(change.document);
});

//if the user has specified in settings, all findings will be cleared when they close a document
documents.onDidClose((change) => {
    if (DevSkimWorker.settings.devskim.removeFindingsOnClose) {
        let diagnostics: Diagnostic[] = [];
        connection.sendDiagnostics({uri: change.document.uri, diagnostics});
    }
});

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
    //this was part of the template but I basically ignore it.  The settings should
    //be updated to allow rulesets to be turned on and off, and this is where we would
    //get notified that the user did so
    connection.console.log(`onDidChangeConfiguration: change.settings: ${JSON.stringify(change.settings)}`);
    DevSkimWorker.settings = <Settings>change.settings;
    // Revalidate any open text documents
    documents.all().forEach(validateTextDocument);
});

//this is the mechanism that populates VS Code with the various code actions associated
//with DevSkim findings.  VS Code invokes this to get an array of commands.  This happens
//independent of populating the text document with diagnostics, yet the code actions are
//linked to the diagnostics (i.e. we want to invoke a fix on a finding, and the finding is represented
//with a diagnostic).  This requires some contorsions in order to make the association
connection.onCodeAction((params) => {
    let result: Command[] = [];
    let uri = params.textDocument.uri;
    let edits = analysisEngine.codeActions[uri];
    if (!edits) {
        return result;
    }

    let fixes = new Fixes(edits);
    if (fixes.isEmpty()) {
        return result;
    }

    // let textDocument = documents.get(uri);
    let documentVersion: number;
    let ruleId: string;

    function createTextEdit(editInfo: AutoFix): TextEdit {
        return TextEdit.replace(editInfo.edit.range, editInfo.edit.text || '');
    }

    for (let editInfo of fixes.getScoped(params.context.diagnostics)) {
        documentVersion = editInfo.documentVersion;
        ruleId = editInfo.ruleId;
        result.push(Command.create(editInfo.label, 'devskim.applySingleFix', uri, documentVersion, [
            createTextEdit(editInfo)
        ]));
    }

    return result;
});

/**
 * Trigger an analysis of the provided document and record the code actions and diagnostics generated by the analysis
 *
 * @param {TextDocument} textDocument document to analyze
 */
function validateTextDocument(textDocument: TextDocument): void {
    let diagnostics: Diagnostic[] = [];
    delete analysisEngine.codeActions[textDocument.uri];

    const problems: DevSkimProblem[] =
        analysisEngine.analyzeText(textDocument.getText(), textDocument.languageId, textDocument.uri);

    for (let problem of problems) {
        let diagnostic: Diagnostic = problem.makeDiagnostic();
        diagnostics.push(diagnostic);

        for (let fix of problem.fixes) {
            analysisEngine.recordCodeAction(textDocument.uri, textDocument.version,
                diagnostic.range, diagnostic.code, fix, problem.ruleId);
        }
    }
    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({uri: textDocument.uri, diagnostics});
}

//currently DevSkim doesn't watch any files, but this is stubbed out as concievably it should watch the
//rules directory for changes
connection.onDidChangeWatchedFiles((/* change */) => {
    // Monitored files have change in VSCode
    // connection.console.log('We received an file change event');
});


//the following interface, namespace and onRequest define a way for the client to invoke validation of a source file via
//a message sent to the server.  The same interfaces need to be defined (or included) in the client
//so it knows the format to use
interface ValidateDocsParams {
    textDocuments: TextDocumentIdentifier[];
}

namespace ValidateDocsRequest {
    export const type = new RequestType<ValidateDocsParams, void, void, void>(
        'textDocument/devskim/validatedocuments')
}

connection.onRequest(ValidateDocsRequest.type, (params) => {
    for (let docs of params.textDocuments) {
        let textDocument = documents.get(docs.uri);

        validateTextDocument(textDocument);
    }
});

interface ReloadRulesParams {}

namespace ReloadRulesRequest {
    export const type = new RequestType<ReloadRulesParams, void, void, void>('devskim/validaterules')
}

connection.onRequest(ReloadRulesRequest.type, () => {
    analysisEngine.refreshAnalysisRules();
});

// Listen on the connection
connection.listen();