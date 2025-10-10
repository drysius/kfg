/**
 * Parses a .env file content string into a key-value object.
 * This version uses a simpler regex and post-processing for clarity.
 * Note: Does not support multi-line values.
 * @param content The string content of the .env file.
 * @returns A record of key-value pairs.
 */
export function parse(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	const lines = content.split(/\r?\n/);

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine || trimmedLine.startsWith("#")) {
			continue;
		}

		const match = trimmedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
		if (!match) continue; // Ignore invalid lines as per common implementations

		const [, key, rawValue] = match;
		let value = rawValue.trim();

		// Strip end-of-line comments, unless in quotes
		if (!value.startsWith('"') && !value.startsWith("'")) {
			const commentIndex = value.indexOf("#");
			if (commentIndex > -1) {
				value = value.substring(0, commentIndex).trim();
			}
		}

		// Unquote values
		if (value.startsWith("'") && value.endsWith("'")) {
			value = value.substring(1, value.length - 1);
		} else if (value.startsWith('"') && value.endsWith('"')) {
			value = value.substring(1, value.length - 1);
		}

		result[key] = value;
	}
	return result;
}

/**
 * Updates a .env file content string with a new key-value pair.
 * Preserves comments and formatting.
 * @param content The original file content.
 * @param key The key to update.
 * @param value The new value.
 * @param description Optional description to add as a comment.
 * @returns The updated file content.
 */
export function updateEnvContent(
	content: string,
	key: string,
	value: unknown,
	description?: string,
): string {
	const lines = content.split(/\r?\n/);
	let keyFound = false;
	const newLines = [...lines];

	let formattedValue: string;
	if (Array.isArray(value)) {
		formattedValue = JSON.stringify(value);
	} else {
		const stringValue = String(value);
		formattedValue = /[\s"'#]/.test(stringValue)
			? `"${stringValue.replace(/"/g, '"').replace(/\n/g, "\\n")}"`
			: stringValue;
	}

	let lineIndex = -1;
	for (let i = 0; i < lines.length; i++) {
		if (new RegExp(`^s*${key}s*=s*`).test(lines[i])) {
			keyFound = true;
			lineIndex = i;
			break;
		}
	}

	if (keyFound) {
		// Key exists, update it.
		newLines[lineIndex] = `${key}=${formattedValue}`;
		// Check for description and add if it's not there.
		if (description) {
			const comment = `# ${description}`;
			if (
				lineIndex === 0 ||
				!newLines[lineIndex - 1].trim().startsWith(comment)
			) {
				if (lineIndex > 0 && !newLines[lineIndex - 1].trim().startsWith("#")) {
					newLines.splice(lineIndex, 0, comment);
				}
			}
		}
	} else {
		// Key doesn't exist, add it to the end.
		if (newLines[newLines.length - 1] !== "") {
			newLines.push(""); // Add a blank line for separation
		}
		if (description) {
			newLines.push(`# ${description}`);
		}
		newLines.push(`${key}=${formattedValue}`);
	}

	return newLines.join("\n");
}

/**
 * Removes a key from a .env file content string.
 * @param content The original file content.
 * @param key The key to remove.
 * @returns The updated file content.
 */
export function removeEnvKey(content: string, key: string): string {
	const lines = content.split(/\r?\n/);
	const keyRegex = new RegExp(`^\\s*${key}\\s*=\\s*`);
	const newLines: string[] = [];

	for (const line of lines) {
		if (keyRegex.test(line)) {
			// key found, don't add it.
			// if last line in newLines is a comment, remove it.
			if (
				newLines.length > 0 &&
				newLines[newLines.length - 1].trim().startsWith("#")
			) {
				newLines.pop();
			}
		} else {
			newLines.push(line);
		}
	}
	return newLines.join("\n");
}