import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigJSDriver } from "../driver";
import { flattenObject, getProperty, unflattenObject } from "../utils/object";

// Recursively strips comment properties (e.g., "port:comment") from a nested data
// object and returns them in a flat map, keyed by their full path.
function stripComments(data: Record<string, any>): Record<string, string> {
	const comments: Record<string, string> = {};

	function recurse(currentData: Record<string, any>, prefix = "") {
		const keys = Object.keys(currentData);
		for (const key of keys) {
			if (key.endsWith(":comment")) {
				const dataKey = key.replace(/:comment$/, "");
				const commentPath = prefix ? `${prefix}.${dataKey}` : dataKey;
				comments[commentPath] = currentData[key];
				delete currentData[key];
			}
		}
		for (const key of keys) {
			if (
				typeof currentData[key] === "object" &&
				currentData[key] !== null &&
				!key.endsWith(":comment")
			) {
				const nestedPrefix = prefix ? `${prefix}.${key}` : key;
				recurse(currentData[key], nestedPrefix);
			}
		}
	}
	recurse(data);
	return comments;
}

function getFilePath(config: { path?: string }): string {
	return path.resolve(process.cwd(), config.path || "config.json");
}

/**
 * A driver for loading configuration from JSON files.
 */
export const jsonDriver = new ConfigJSDriver({
	identify: "json-driver",
	async: false,
	config: { path: "config.json", keyroot: false },
	onLoad(schema, _opts) {
		this.comments = this.comments || {};
		const defaultData = this.buildDefaultObject(schema);
		const filePath = getFilePath(this.config);

		let loadedData: Record<string, any> = {};
		if (fs.existsSync(filePath)) {
			try {
				const fileContent = fs.readFileSync(filePath, "utf-8");
				if (fileContent) {
					loadedData = JSON.parse(fileContent);
				}
			} catch (_e) {
				/* Ignore */
			}
		}

		if (this.config.keyroot) {
			const flatData = loadedData as Record<string, any>;
			const comments: Record<string, string> = {};
			const data: Record<string, any> = {};
			for (const key in flatData) {
				if (key.endsWith(":comment")) {
					comments[key.replace(/:comment$/, "")] = flatData[key];
				} else {
					data[key] = flatData[key];
				}
			}
			this.comments = comments;
			loadedData = unflattenObject(data);
		} else {
			this.comments = stripComments(loadedData);
		}

		this.store = this.deepMerge(defaultData, loadedData);
		return this.store;
	},
	onSet(key, _value, options) {
		if (key) {
			this.comments = this.comments || {};
			if (options?.description) {
				this.comments[key] = options.description;
			}
		}

		let dataToSave: Record<string, any>;
		if (this.config.keyroot) {
			dataToSave = flattenObject(this.data);
			for (const path in this.comments) {
				dataToSave[`${path}:comment`] = this.comments[path];
			}
		} else {
			const dataWithComments = JSON.parse(JSON.stringify(this.data));
			for (const path in this.comments) {
				const keys = path.split(".");
				const propName = keys.pop() as string;
				const parentPath = keys.join(".");
				const parentObject = parentPath
					? getProperty(dataWithComments, parentPath)
					: dataWithComments;
				if (typeof parentObject === "object" && parentObject !== null) {
					parentObject[`${propName}:comment`] = this.comments[path];
				}
			}
			dataToSave = dataWithComments;
		}

		const filePath = getFilePath(this.config);
		fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
	},
	onDel(key) {
		if (this.comments?.[key]) {
			delete this.comments[key];
		}

		let dataToSave: Record<string, any>;
		if (this.config.keyroot) {
			dataToSave = flattenObject(this.data);
			for (const path in this.comments) {
				dataToSave[`${path}:comment`] = this.comments[path];
			}
		} else {
			const dataWithComments = JSON.parse(JSON.stringify(this.data));
			for (const path in this.comments) {
				const keys = path.split(".");
				const propName = keys.pop() as string;
				const parentPath = keys.join(".");
				const parentObject = parentPath
					? getProperty(dataWithComments, parentPath)
					: dataWithComments;
				if (typeof parentObject === "object" && parentObject !== null) {
					parentObject[`${propName}:comment`] = this.comments[path];
				}
			}
			dataToSave = dataWithComments;
		}

		const filePath = getFilePath(this.config);
		fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
	},
});
