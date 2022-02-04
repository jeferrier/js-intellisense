/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	Position
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import {Parser, defaultOptions} from 'acorn';
import { ComponentAnalyzer } from './ComponentAnalyzer';
import { CompletionSuggestionCache, Variable } from './CompletionSuggestionCache';
import { ComponentScope } from './ComponenScope';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Create a simple store of relevant data elements
const completionSuggestions = new CompletionSuggestionCache();

// Create a cache for documents we've encountered so far
const seenDocuments: Map<string, TextDocument> = new Map();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(loadDocumentComponents);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	// TODO: Should we also clear this out of the seen documents?
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	loadDocumentComponents(change.document);
});

async function loadDocumentComponents(document: TextDocument): Promise<void> {
	const diagnostics: Diagnostic[] = [];

	if (!seenDocuments.has(document.uri)) {
		seenDocuments.set(document.uri, document);
	}

	let entryNode = undefined;
	try {
		entryNode = Parser.parse(document.getText(), defaultOptions);
	} catch (e) {
		if (e instanceof Error) {
			// TODO: Turns out acorn is just going to emit
			// 		'Unexpected token'
			// every time we have a syntax error of any kind
			// Would be useful to gather some more meaningful input to deliver
			// NOTE: We could use the loose-parser to decode the error
			const lineAndColumnRegex = /([^()]*) \(([0-9]+):([0-9]+)\)/;
			const m = lineAndColumnRegex.exec(e.message);
			const line = parseInt(m && m['2'] || '0') - 1;
			const char = parseInt(m && m['3'] || '0');
			const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Error,
				range: {
					start: {line, character: char},
					end: {line, character: char + 1}
				},
				message: m && m['1'] || 'Syntax Error',
				source: 'js-intellisense'
			};
			diagnostics.push(diagnostic);
			console.log('Server: sending diagnostic: ' + e.message);
			connection.sendDiagnostics({ uri: document.uri, diagnostics });
			return;
		}
		return;
	}
	const analyzer = new ComponentAnalyzer(completionSuggestions, document.uri);
	analyzer.walkAndConstructComponents(analyzer.newState(entryNode), 1000);

	// We need one final diagnostics set, to clear out any previously existing diagnostics
	// that were resolved after last document load
	connection.sendDiagnostics({ uri: document.uri, diagnostics });
	// We only want one component analyzer to exist per document
	// Should we recycle the same one?
	// We have to parse either way...
	// If we were to get completion suggestions, that suggestion would have to be associated with a
	// 		component analyzer- currently only scoped to this function call.
	// In short, we need a way to permanently associate (at least the) active component analyzer
	//		with the current document long term.


	// The validator creates diagnostics for all uppercase words length 2 and more
	//const text = document.getText();
	//const pattern = /\b[A-Z]{2000000,}\b/g;
	//let m: RegExpExecArray | null;

	//const settings = await getDocumentSettings(document.uri);
	//let problems = 0;
	//while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
	//	problems++;
	//	if (hasDiagnosticRelatedInformationCapability) {
	//		diagnostic.relatedInformation = [
	//			{
	//				location: {
	//					uri: document.uri,
	//					range: Object.assign({}, diagnostic.range)
	//				},
	//				message: 'Spelling matters'
	//			},
	//			{
	//				location: {
	//					uri: document.uri,
	//					range: Object.assign({}, diagnostic.range)
	//				},
	//				message: 'Particularly for names'
	//			}
	//		];
	//	}
	//	diagnostics.push(diagnostic);
	//}

	//// Send the computed diagnostics to VSCode.
	//connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// Just provides details for completions to appear in the list
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	const completionSourceDocument = seenDocuments.get(_textDocumentPosition.textDocument.uri);
	// TODO: fix this!!
	if (!completionSourceDocument) {
		console.log('Stopping early');
		return [];
	}
	const completionStartOffset = completionSourceDocument.offsetAt(_textDocumentPosition.position);
	const matchingScopes = completionSuggestions.getScopesAtOffset(
		_textDocumentPosition.textDocument.uri,
		completionStartOffset
	);

	let usedDatas = 1;
	let suggestibles: Array<CompletionItem> = [];
	matchingScopes.forEach((scope: ComponentScope) => {
		const varsInThisScope = completionSuggestions.getVariablesFromScope(scope);
		// PLEASE FIX THIS ;__;
		suggestibles = [
			...suggestibles,
			...varsInThisScope.map((variableInScope: Variable) : CompletionItem => {
				return {
					label: variableInScope.name,
					kind: CompletionItemKind.Folder,
					data: usedDatas++
				};
			})
		];
	});
	return suggestibles;
});

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
