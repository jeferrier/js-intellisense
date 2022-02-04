import { Node } from 'acorn';
import { CompletionSuggestionCache } from './CompletionSuggestionCache';
import { ComponentScope } from './ComponenScope';
import {
	IdentifierNode,
	ObjectPatternNode,
	ProgramNode,
	PropertyNode,
	VariableDeclarationNode,
	VariableDeclaratorNode
} from './NodeInterfaces';

interface WalkFunction {
	(state: WalkState, level: number): void
}
interface LogFunction {
	(message: string, ...thingsToPrint: Array<any>): void
}
interface StateCopyFunction {
	(oldState: WalkState, newProperties: Record<string, unknown>): WalkState
}
interface WalkState {
	completionCache: CompletionSuggestionCache,
	uri: string,
	recurser: WalkFunction,
	stateCopier: StateCopyFunction,
	logger?: LogFunction,
	node: Node,
	scope?: ComponentScope
}

export class ComponentAnalyzer {

	private completionSuggestions: CompletionSuggestionCache;
	private uri: string;

	constructor(completionSuggestions: CompletionSuggestionCache, uri: string) {
		this.completionSuggestions = completionSuggestions;
		this.uri = uri;
	}

	public walkAndConstructComponents(state: WalkState, level: number) : void {
		if (level < 0) {
			level = 1;
		}
		if (level === 0) {
			return;

		}
		if (!state.node.type) {
			throw new Error('Not a node');
		}
		if (!ComponentAnalyzer.nodeDefinitions[state.node.type]) {
			//this.logMessage('Unknown Node Type', state.node);
			return;
		}
		ComponentAnalyzer.nodeDefinitions[state.node.type](state, level);
	}

	// TODO: This function name might be a bit confusing
	public newState(node: Node) : WalkState {
		return {
			node,
			recurser: this.walkAndConstructComponents.bind(this),
			uri: this.uri,
			logger: this.logMessage.bind(this),
			stateCopier: this.copyState.bind(this),
			completionCache: this.completionSuggestions
		};
	}

	/**
	 * Take an old state, and an object of properties to overwrite.
	 * Return a new state with the old-properties copied forward, and new properties overwritten in.
	 *
	 * @param oldState The old state to overwrite, if any
	 * @param newProperties
	 * @returns
	 */
	public copyState(oldState: WalkState, newProperties: Record<string, unknown>) : WalkState {
		return Object.assign({}, oldState, newProperties);
	}

	private logMessage(message: string, ...thingsToPrint: Array<any>): void {
		console.log('Server: ' + message + ' in ' + this.uri +  ':');
		thingsToPrint.forEach(thing => {
			console.log(thing);
		});
	}

	private static nodeDefinitions: any = {

		'Program': (state: WalkState, level: number) => {
			const node = <ProgramNode> state.node;
			state.scope = new ComponentScope(state.uri, node.start, node.end);
			node.body.forEach((subNode) => {
				state.recurser(state.stateCopier(state, {node: subNode}), level - 1);
			});
		},

		'VariableDeclaration': (state: WalkState, level: number) => {
			const node = <VariableDeclarationNode> state.node;

			// TODO: Process more than just the first node
			const firstDeclaratorNode: VariableDeclaratorNode = node.declarations[0];

			// TODO: Define an enum for declaration types
			const declarationType: string = node.kind;
			const idNode: Node = firstDeclaratorNode.id;

			// Handles object definitions on left hand side in declaration statements
			// NOTE: We are assuming that:
			// 		1. Keys are the only thing that matter
			//		2. You never reference complicated mappings via dot notation
			//		These are BAD assumptions to make LUL
			if (idNode.type === 'ObjectPattern') {
				const OPNode: ObjectPatternNode = <ObjectPatternNode> idNode;
				OPNode.properties.forEach((property: PropertyNode) => {
					const identifierNode: IdentifierNode = property.key;
					const varName = identifierNode.name;
					// TODO: don't just return, do soxmething!
					if (!state.scope) {
						return;
					}
					state.completionCache.addVariableToScope(state.scope, declarationType, varName);
				});
			}
			// TODO: Determine the final type of the thing that was initialized
			//const initNode: AmbiguousNode | undefined =
			//	state.node.init
			//	&& state.node.init;
		}
	};

}
