import { Node } from 'acorn';

export interface IdentifierNode extends Node {
	name: string
}

export interface ObjectPatternNode extends Node {
	properties: Array<PropertyNode>
}

export interface ProgramNode extends Node {
	sourceType: string,
	body: Array<Node>
}

export interface PropertyNode extends Node {
	// TODO: What does it mean when a property IS computed???
	computed: boolean,
	method: boolean,
	shorthand: boolean,
	key: IdentifierNode,
	value: Node
}

export interface VariableDeclarationNode extends Node {
	declarations: Array<VariableDeclaratorNode>
	kind: string
}

export interface VariableDeclaratorNode extends Node {
	id: Node,
	init: Node,
}
