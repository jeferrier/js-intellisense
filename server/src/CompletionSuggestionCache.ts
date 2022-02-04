import { ComponentScope } from './ComponenScope';

// TODO: remove this from here bruh
export interface Variable {
	kind: string,
	name: string,
	variableID: number
}

export class CompletionSuggestionCache {

	private static currentID = 1;
	// Scope list is a Map of all existing scopes
	// TODO: Scopes probably shouldn't all be mixed together like this. Since the completions rely
	// 		on the textdocument and uri, it probably makes sense to scope the completions suggestions
	//		to the textdocument as well
	private scopeList: Map<number, ComponentScope> = new Map();
	// The scope map only contains ids
	private scopeParentToScopeChildMaP: Map<number, Set<number>> = new Map();
	// The scope to variable map only contains ids
	private scopeToContainedVariableMap: Map<number, Set<number>> = new Map();
	// Variable list is a Map of all existing variables
	// TODO: Variables probably shouldn't all be mixed together like this. Since the completions rely
	// 		on the textdocument and uri, it probably makes sense to variable the completions suggestions
	//		to the textdocument as well
	private variablesList: Map<number, Variable> = new Map();

	public addScope(scope: ComponentScope) : void {
		if (this.scopeList.has(scope.scopeID)) {
			return;
		}
		this.scopeList.set(scope.scopeID, scope);
	}

	public getScopeWithID(scopeID: number) : ComponentScope | undefined {
		if (this.scopeList.has(scopeID)) {
			return this.scopeList.get(scopeID);
		}
		return undefined;
	}

	public getScopesAtOffset(uri: string, offset: number): Array<ComponentScope> {
		const returnableScopes: Array<ComponentScope> = [];
		this.scopeList.forEach((scope: ComponentScope) => {
			if (scope.uri != uri) {
				return;
			}
			if (scope.end < offset) {
				return;
			}
			if (scope.start > offset) {
				return;
			}
			returnableScopes.push(scope);
		});
		return returnableScopes;
	}

	public addChildScope(parent: ComponentScope, child: ComponentScope) : void {
		if (!this.scopeList.has(parent.scopeID)) {
			this.addScope(parent);
		}
		if (!this.scopeList.has(child.scopeID)) {
			this.addScope(child);
		}
		if (!this.scopeParentToScopeChildMaP.has(parent.scopeID)) {
			this.scopeParentToScopeChildMaP.set(parent.scopeID, new Set());
		}
		const childScopesSet = this.scopeParentToScopeChildMaP.get(parent.scopeID);
		childScopesSet?.add(child.scopeID);
	}

	public addVariableToScope(scope: ComponentScope, variableKind: string, variableName: string) : void {
		if (!this.scopeList.has(scope.scopeID)) {
			this.scopeList.set(scope.scopeID, scope);
		}
		const newVar = this.createVariable(variableKind, variableName);
		if (!this.scopeToContainedVariableMap.has(scope.scopeID)) {
			this.scopeToContainedVariableMap.set(scope.scopeID, new Set());
		}
		// TODO: Just type this already
		const scopeVariablesSet = this.scopeToContainedVariableMap.get(scope.scopeID);
		scopeVariablesSet?.add(newVar.variableID);
		this.variablesList.set(newVar.variableID, newVar);
	}

	public getVariablesFromScope(scope: ComponentScope) : Array<Variable> {
		if (!this.scopeList.has(scope.scopeID)) {
			return [];
		}
		if (!this.scopeToContainedVariableMap.has(scope.scopeID)) {
			return [];
		}
		// TODO: Just type this already
		const scopeVariablesSet = this.scopeToContainedVariableMap.get(scope.scopeID);
		const returnableVariables: Array<Variable> = [];
		scopeVariablesSet?.forEach((variableID: number) => {
			const returnableVariable = this.variablesList.get(variableID);
			if (!returnableVariable) {
				return;
			}
			returnableVariables.push(returnableVariable);
		});
		return returnableVariables;
	}

	private static generateID() {
		return CompletionSuggestionCache.currentID++;
	}

	private createVariable(kind: string, name: string) : Variable {
		return {
			kind,
			name,
			variableID: CompletionSuggestionCache.generateID()
		};
	}
}
