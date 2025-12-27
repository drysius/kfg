import * as fs from "node:fs";
import * as path from "node:path";
import { kfgDriver } from "../kfg-driver";
import {
	deepMerge,
	flattenObject,
	getProperty,
	unflattenObject,
} from "../utils/object";
import { buildDefaultObject } from "../utils/schema";

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
export const jsonDriver = kfgDriver<{ path: string; keyroot: boolean }>(
	(config) => {
		let comments: Record<string, string> = {};

		function save(data: any) {
			let dataToSave: Record<string, any>;
			if (config.keyroot) {
				dataToSave = flattenObject(data);
				for (const path in comments) {
					dataToSave[`${path}:comment`] = comments[path];
				}
			} else {
				const dataWithComments = JSON.parse(JSON.stringify(data));
				for (const path in comments) {
					const keys = path.split(".");
					const propName = keys.pop() as string;
					const parentPath = keys.join(".");
					const parentObject = parentPath
						? getProperty(dataWithComments, parentPath)
						: dataWithComments;
					if (typeof parentObject === "object" && parentObject !== null) {
						parentObject[`${propName}:comment`] = comments[path];
					}
				}
				dataToSave = dataWithComments;
			}

			const filePath = getFilePath(config);
			fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
		}

		return {
			name: "json-driver",
			async: false,

			load(schema, opts) {
				Object.assign(config, opts);

				const defaultData = buildDefaultObject(schema);
				const filePath = getFilePath(config);

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

				if (config.keyroot) {
					const flatData = loadedData as Record<string, any>;
					const cmts: Record<string, string> = {};
					const data: Record<string, any> = {};
					for (const key in flatData) {
						if (key.endsWith(":comment")) {
							cmts[key.replace(/:comment$/, "")] = flatData[key];
						} else {
							data[key] = flatData[key];
						}
					}
					comments = cmts;
					loadedData = unflattenObject(data);
				} else {
					comments = stripComments(loadedData);
				}

				return deepMerge(defaultData, loadedData);
			},

			set(key, _value, options) {
				if (!options) options = {};
				if (key) {
					if (options?.description) {
						comments[key] = options.description;
					}
				}
				save(options.data);
			},

			del(key, options) {
				if (!options) options = {};
				if (comments?.[key]) {
					delete comments[key];
				}
				save(options.data);
			},
		};
	},
);
