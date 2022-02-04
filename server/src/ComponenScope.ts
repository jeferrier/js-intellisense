export class ComponentScope {
	public uri: string;
	public scopeID: number;
	public scopeType: number;
	public start: number;
	public end: number;

	private static currentID = 1;

	static GLOBAL = 1;

	/**
	 * Generates a new ComponentScope. If scopeType is omitted, a ComponentScope.GLOBAL scope is returned
	 *
	 * @param uri The name of the file this scope is local to
	 * @param scopeType The specific type of the scope to be created, optional
	 */
	constructor(uri: string, start: number, end: number, scopeType?: number) {
		this.scopeID = ComponentScope.generateID();

		this.uri = uri;

		if (!scopeType) {
			scopeType = ComponentScope.GLOBAL;
		}
		this.scopeType = scopeType;

		if (start < 0) {
			start = 0;
		}
		this.start = start;
		if (end < 0) {
			end = 0;
		}
		this.end = end;

		if (this.end == this.start) {
			throw new Error('start and end position must not be identical');
		}
	}

	private static generateID(): number {
		return ComponentScope.currentID++;
	}
}
