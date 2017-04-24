/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';

import { workspace, window, commands, Disposable, ExtensionContext } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind, TextEdit, Protocol2Code, TextDocumentIdentifier, RequestType } from 'vscode-languageclient';

//the following interface and namespace define a format to invoke a function on the server via
//LanguageClient.sendRequest
interface ValidateDocsParams {	textDocuments: TextDocumentIdentifier[];}
namespace ValidateDocsRequest {
	export const type: RequestType<ValidateDocsParams, void, void> = { get method() { return 'textDocument/devskim/validatedocuments'; } };}


export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };

	let extensionPath = context.extensionPath;
	
	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}
	
	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents.  I haven't found a "Always do this" option, hence the exhaustive
		//listing here.  If someone else knows how to say "do this for *" that would be the preference
		documentSelector: ["php","c","cpp","csharp","ruby","perl","perl6","javascriptreact","javascript",
			"go","rust","groovy","typescript","typescriptreact","jade","lua","swift","clojure","sql",
			"vb","shellscript","yaml","fsharp","objective-c","r","java","powershell","coffeescript", "plaintext","python" ],
		synchronize: {
			// Synchronize the setting section 'devskim' to the server
			configurationSection: 'devskim',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	}

	
	/**
	 * Triggered when the user clicks a specific DevSkim code action (set in the server component in connection.OnCodeAction)
	 * this function makes the actual code transformation corresponding to the action
	 * 
	 * @param {string} uri - the path to the document the edits should apply to
	 * @param {number} documentVersion - the version of the file to apply the edits.  if the version doesn't match
	 * 									 the current version the edit may no longer be applicable (this shouldn't happen)
	 * @param {TextEdit[]} edits - the actual changes to make (range, text to replace, etc.)
	 */
	function applyTextEdits(uri: string, documentVersion: number, edits: TextEdit[]) 
	{
		let textEditor = window.activeTextEditor;
		//make sure the code action triggered is against the current document (abundance of caution - the user shouldn't
		//be able to trigger an action for a different document).  Also make sure versions match.  This also shouldn't happen
		//as any changes to the document should refresh the code action, but since things are asyncronous this might be possible
		if (textEditor && textEditor.document.uri.toString() === uri) {
			if (textEditor.document.version !== documentVersion) {
				window.showInformationMessage(`Devskim fixes are outdated and can't be applied to the document.`);
			}
			//apply the edits
			textEditor.edit(mutator => {
				for(let edit of edits) {
					mutator.replace(Protocol2Code.asRange(edit.range), edit.newText);
				}
			}).then((success) => {
				if (!success) {
					window.showErrorMessage('Failed to apply Devskim fixes to the document. Please consider opening an issue with steps to reproduce.');
				}
			});
		}
	}


	
	let client : LanguageClient = new LanguageClient('Devskim', serverOptions, clientOptions);
	// Create the language client and start the client.
	let disposable = client.start();
	
	// Push the disposable to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable,
		commands.registerCommand('devskim.applySingleFix', applyTextEdits));

	//when the extension is first loading a lot of stuff is happening asyncronously in VS code
	//as a result, often the first analysis doesn't happen until after the user types.  This will
	//start the analysis a couple seconds after VS Code loads, so if the user doesn't do anything 
	//an analysis still happens
	setTimeout(function() {
		var textDocuments: TextDocumentIdentifier[] = [];
		for(var x: number = 0; x < workspace.textDocuments.length; x++)
		{
			textDocuments[x] = Object.create(null);
			textDocuments[x].uri = workspace.textDocuments[x].uri.toString();
		}
		client.sendRequest(ValidateDocsRequest.type, {textDocuments});			
	}, 3000);
}
