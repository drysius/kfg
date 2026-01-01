import * as fs from "node:fs";
import * as path from "node:path";
import { KfgDriver } from "../kfg-driver";
import {
	deepMerge,
	deleteProperty,
	flattenObject,
	getProperty,
	setProperty,
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

function save(kfg: any, config: any, data?: any) {
	const currentData = data || kfg.$store.get("data");
	const comments = kfg.$store.get("comments", {});

	let dataToSave: Record<string, any>;
	if (config.keyroot) {
		dataToSave = flattenObject(currentData);
		for (const path in comments) {
			dataToSave[`${path}:comment`] = comments[path];
		}
	} else {
		const dataWithComments = JSON.parse(JSON.stringify(currentData));
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

/**
 * A driver for loading configuration from JSON files.
 */
export const JsonDriver = new KfgDriver<
	{ path?: string; keyroot?: boolean },
	false
>({
	identify: "json-driver",
	async: false,
	config: {},
	onMount(kfg) {
		const cfg = kfg.$config;
		const defaultData = buildDefaultObject(kfg.schema);
		const filePath = getFilePath(cfg);

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

		let comments: Record<string, string> = {};
		if (cfg.keyroot) {
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

		kfg.$store.set("comments", comments);
		const finalData = deepMerge(defaultData, loadedData);
		kfg.$store.set("data", finalData);
		return finalData;
	},

	onGet(kfg, { path }) {
		const data = kfg.$store.get("data", {});
		if (!path) return data;
		return getProperty(data, path);
	},

	onHas(kfg, { paths }) {
		const data = kfg.$store.get("data", {});
		return paths.every((path: string) => getProperty(data, path) !== undefined);
	},

	onUpdate(kfg, opts) {
		const data = kfg.$store.get("data", {});
		if (opts.path) {
			setProperty(data, opts.path, opts.value);
		}
		kfg.$store.set("data", data);

		if (opts?.path && opts?.description) {
			const comments: Record<string, string> = kfg.$store.get("comments", {});
			comments[opts.path] = opts.description;
			kfg.$store.set("comments", comments);
		}
		save(kfg, kfg.$config, data);
	},

	onDelete(kfg, opts) {
		const data = kfg.$store.get("data", {});
		if (opts.path) {
			deleteProperty(data, opts.path);
		}
		kfg.$store.set("data", data);

		if (opts?.path) {
			const comments: Record<string, string> = kfg.$store.get("comments", {});
			if (comments[opts.path]) {
				delete comments[opts.path];
				kfg.$store.set("comments", comments);
			}
		}
		save(kfg, kfg.$config, data);
	},

	onToJSON(kfg) {
		return kfg.$store.get("data");
	},

	onInject(kfg, { data }) {
		kfg.$store.merge("data", data);
	},

	onMerge(kfg, { data }) {
		kfg.$store.merge("data", data);
	},

	save(kfg, data) {
		save(kfg, kfg.$config, data);
	},
});
