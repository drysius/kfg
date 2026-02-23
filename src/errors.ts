type ValidationIssue = {
	path?: string;
	message?: string;
	schema?: { type?: string } & Record<string, unknown>;
	value?: unknown;
};

function normalizePath(path?: string): string {
	if (!path || path === "/") return "(root)";
	return path.replace(/^\//, "").replace(/\//g, ".");
}

function typeOfValue(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

export function notLoadedMessage(operation: string): string {
	return `[KFG] Configuration not loaded. Call load() before ${operation}.`;
}

export function defaultValidationMessage(issues: ValidationIssue[]): string {
	const lines = issues.map((issue) => {
		const path = normalizePath(issue.path);
		const expected = issue.schema?.type ? ` expected ${issue.schema.type}` : "";
		const received =
			issue.value !== undefined
				? `, received ${typeOfValue(issue.value)}`
				: "";
		const detail = issue.message ? ` (${issue.message})` : "";
		return `- ${path}:${expected}${received}${detail}`;
	});

	return [
		"[KFG] Invalid configuration.",
		"Please fix the entries below and load again:",
		...lines,
	].join("\n");
}
