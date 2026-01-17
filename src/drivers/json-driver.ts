import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
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

// --- Helpers ---

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

function resolvePath(pattern: string, id: string) {
	return pattern.replace("{id}", id);
}

function getPatternRegex(pattern: string) {
	// Escape special chars, but leave {id} for replacement
	// We want to replace {id} with a capturing group
	// The pattern likely has normal path separators.

	// Quick and dirty regex construction:
	// 1. Escape everything.
	// 2. Unescape \{id\}.
	// 3. Replace {id} with (.*?)

	// Note: path.resolve might have changed separators on Windows.
	// So we should normalize separators or be careful.

	const escaped = pattern.replace(/[.*+?^${}()|[\\]/g, "\\$&");
	const regexStr = escaped.replace(/\\{id\\}/g, "(.+)");
	return new RegExp(`^${regexStr}$`);
}

function _extractId(filePath: string, pattern: string): string | null {
	const absPath = path.resolve(filePath);
	const absPattern = path.resolve(process.cwd(), pattern);

	const regex = getPatternRegex(absPattern);
	const match = absPath.match(regex);
	return match ? match[1] : null;
}

// --- Sync Logic ---

function saveSync(kfg: any, config: any, data?: any) {
	if (kfg.multimode) {
		// In multimode, we don't save everything at once usually,
		// unless we want to rewrite all files.
		// `save` is usually called with specific data if triggered by `create` or `update` internally.
		// But if called publicly `.save()`, it might mean "save all".
		const allData = data || kfg.$store.get("data");
		const pattern = getFilePath(config);

		for (const id in allData) {
			const item = allData[id];
			const filePath = resolvePath(pattern, id);
			const dir = path.dirname(filePath);
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
		}
		return;
	}

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
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
}

// --- Async Logic ---

async function saveAsync(kfg: any, config: any, data?: any) {
	if (kfg.multimode) {
		const allData = data || kfg.$store.get("data");
		const pattern = getFilePath(config);

		const promises = Object.keys(allData).map(async (id) => {
			const item = allData[id];
			const filePath = resolvePath(pattern, id);
			const dir = path.dirname(filePath);
			await fsPromises.mkdir(dir, { recursive: true });
			await fsPromises.writeFile(filePath, JSON.stringify(item, null, 2));
		});
		await Promise.all(promises);
		return;
	}

	const currentData = data || kfg.$store.get("data");
	const comments = kfg.$store.get("comments", {});

	let dataToSave: Record<string, any>;
	if (config.keyroot) {
		dataToSave = flattenObject(currentData);
		for (const path in comments) {
			dataToSave[`${path}:comment`] = comments[path];
		}
	} else {
		// deep clone
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
	const dir = path.dirname(filePath);
	await fsPromises.mkdir(dir, { recursive: true });
	await fsPromises.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
}

/**
 * A driver for loading configuration from JSON files (Sync).
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
		const pattern = getFilePath(cfg);

		if (kfg.multimode || pattern.includes("{id}")) {
			// Multimode loading
			const loadedData: Record<string, any> = {};
			const dir = path.dirname(pattern);

			if (fs.existsSync(dir)) {
				const files = fs.readdirSync(dir);
				// We need to match files against the pattern
				// This is a bit tricky if pattern has directory parts inside {id} logic (not supported here)
				// We assume {id} is in the filename.
				const regex = getPatternRegex(pattern);

				for (const file of files) {
					const fullPath = path.join(dir, file);
					const match = fullPath.match(regex);
					if (match) {
						const id = match[1];
						try {
							const content = fs.readFileSync(fullPath, "utf-8");
							loadedData[id] = JSON.parse(content);
						} catch {
							/* ignore */
						}
					}
				}
			}
			kfg.$store.set("data", loadedData);
			return loadedData;
		}

		const defaultData = buildDefaultObject(kfg.schema);
		const filePath = pattern;

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
		const data = kfg.$store.get<Record<string, string>>("data", {});
		if (!path) return data;
		return getProperty(data, path);
	},

	onHas(kfg, { paths }) {
		const data = kfg.$store.get<Record<string, string>>("data", {});
		return paths.every((path: string) => getProperty(data, path) !== undefined);
	},

	onUpdate(kfg, opts) {
		const data = kfg.$store.get<Record<string, string>>("data", {});
		if (opts.path) {
			setProperty(data, opts.path, opts.value);
		}
		kfg.$store.set("data", data);

		if (kfg.multimode) {
			// Determine which file to update
			const pattern = getFilePath(kfg.$config);
			const parts = opts.path.split(".");
			const id = parts[0];
			if (id && data[id]) {
				const filePath = resolvePath(pattern, id);
				const dir = path.dirname(filePath);
				if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
				fs.writeFileSync(filePath, JSON.stringify(data[id], null, 2));
			}
			return;
		}

		if (opts?.path && opts?.description) {
			const comments: Record<string, string> = kfg.$store.get("comments", {});
			comments[opts.path] = opts.description;
			kfg.$store.set("comments", comments);
		}
		saveSync(kfg, kfg.$config, data);
	},

	onDelete(kfg, opts) {
		const data = kfg.$store.get<Record<string, string>>("data", {});
		if (opts.path) {
			deleteProperty(data, opts.path);
		}
		kfg.$store.set("data", data);

		if (kfg.multimode) {
			const parts = opts.path.split(".");
			// If deleting the whole item
			if (parts.length === 1) {
				const id = parts[0];
				const pattern = getFilePath(kfg.$config);
				const filePath = resolvePath(pattern, id);
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			} else {
				// Deleting property, update file
				const id = parts[0];
				const pattern = getFilePath(kfg.$config);
				const filePath = resolvePath(pattern, id);
				if (data[id]) {
					fs.writeFileSync(filePath, JSON.stringify(data[id], null, 2));
				}
			}
			return;
		}

		if (opts?.path) {
			const comments: Record<string, string> = kfg.$store.get("comments", {});
			if (comments[opts.path]) {
				delete comments[opts.path];
				kfg.$store.set("comments", comments);
			}
		}
		saveSync(kfg, kfg.$config, data);
	},

	onCreate(kfg, { data }) {
		// Assume data has the ID if multimode
		if (kfg.multimode) {
			// How to determine ID?
			// We expect data to be the object including the ID property if it's embedded.
			// But if ID is not in data, we can't save it.
			// User example: data.id = ...
			// We need to know WHICH property is the ID?
			// Or we assume the schema has an ID?
			// Or we just check 'id' property?

			// For now assume 'id' property exists or we need to pass it?
			// But create(data) passes data.
			const id = data.id;
			if (!id)
				throw new Error("Cannot create item without 'id' property in data.");

			const storeData = kfg.$store.get<Record<string, string>>("data", {});
			storeData[id] = data;
			kfg.$store.set("data", storeData);

			const pattern = getFilePath(kfg.$config);
			const filePath = resolvePath(pattern, String(id));
			const dir = path.dirname(filePath);
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

			return data;
		}
		// Single mode create? Just set data?
		kfg.$store.set("data", data);
		saveSync(kfg, kfg.$config, data);
		return data;
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
		saveSync(kfg, kfg.$config, data);
	},

	onSize(kfg) {
		const data = kfg.$store.get("data");
		if (!data) return 0;
		if (kfg.multimode) return Object.keys(data).length;
		return 1;
	},
});

/**
 * A driver for loading configuration from JSON files (Async).
 */
export const AsyncJsonDriver = new KfgDriver<
	{ path?: string; keyroot?: boolean },
	true
>({
	identify: "async-json-driver",
	async: true,
	config: {},
	async onMount(kfg) {
		const cfg = kfg.$config;
		const pattern = getFilePath(cfg);

		if (kfg.multimode || pattern.includes("{id}")) {
			const loadedData: Record<string, any> = {};
			const dir = path.dirname(pattern);

			try {
				await fsPromises.access(dir);
				const files = await fsPromises.readdir(dir);
				const regex = getPatternRegex(pattern);

				await Promise.all(
					files.map(async (file) => {
						const fullPath = path.join(dir, file);
						const match = fullPath.match(regex);
						if (match) {
							const id = match[1];
							try {
								const content = await fsPromises.readFile(fullPath, "utf-8");
								loadedData[id] = JSON.parse(content);
							} catch {
								/* ignore */
							}
						}
					}),
				);
			} catch {
				/* ignore */
			}

			kfg.$store.set("data", loadedData);
			return loadedData;
		}

		const defaultData = buildDefaultObject(kfg.schema);
		const filePath = pattern;

		let loadedData: Record<string, any> = {};
		try {
			await fsPromises.access(filePath);
			const fileContent = await fsPromises.readFile(filePath, "utf-8");
			if (fileContent) {
				loadedData = JSON.parse(fileContent);
			}
		} catch (_e) {
			/* Ignore */
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
		const data = kfg.$store.get<Record<string, string>>("data", {});
		if (!path) return Promise.resolve(data);
		return Promise.resolve(getProperty(data, path));
	},

	onHas(kfg, { paths }) {
		const data = kfg.$store.get<Record<string, string>>("data", {});
		return Promise.resolve(
			paths.every((path: string) => getProperty(data, path) !== undefined),
		);
	},

	async onUpdate(kfg, opts) {
		const data = kfg.$store.get<Record<string, string>>("data", {});
		if (opts.path) {
			setProperty(data, opts.path, opts.value);
		}
		kfg.$store.set("data", data);

		if (kfg.multimode) {
			const pattern = getFilePath(kfg.$config);
			const parts = opts.path.split(".");
			const id = parts[0];
			if (id && data[id]) {
				const filePath = resolvePath(pattern, id);
				const dir = path.dirname(filePath);
				await fsPromises.mkdir(dir, { recursive: true });
				await fsPromises.writeFile(filePath, JSON.stringify(data[id], null, 2));
			}
			return;
		}

		if (opts?.path && opts?.description) {
			const comments: Record<string, string> = kfg.$store.get("comments", {});
			comments[opts.path] = opts.description;
			kfg.$store.set("comments", comments);
		}
		await saveAsync(kfg, kfg.$config, data);
	},

	async onDelete(kfg, opts) {
		const data = kfg.$store.get<Record<string, string>>("data", {});
		if (opts.path) {
			deleteProperty(data, opts.path);
		}
		kfg.$store.set("data", data);

		if (kfg.multimode) {
			const parts = opts.path.split(".");
			if (parts.length === 1) {
				const id = parts[0];
				const pattern = getFilePath(kfg.$config);
				const filePath = resolvePath(pattern, id);
				try {
					await fsPromises.unlink(filePath);
				} catch {}
			} else {
				const id = parts[0];
				const pattern = getFilePath(kfg.$config);
				const filePath = resolvePath(pattern, id);
				if (data[id]) {
					await fsPromises.writeFile(
						filePath,
						JSON.stringify(data[id], null, 2),
					);
				}
			}
			return;
		}

		if (opts?.path) {
			const comments: Record<string, string> = kfg.$store.get("comments", {});
			if (comments[opts.path]) {
				delete comments[opts.path];
				kfg.$store.set("comments", comments);
			}
		}
		await saveAsync(kfg, kfg.$config, data);
	},

	async onCreate(kfg, { data }) {
		if (kfg.multimode) {
			const id = data.id;
			if (!id)
				throw new Error("Cannot create item without 'id' property in data.");

			const storeData = kfg.$store.get<Record<string, string>>("data", {});
			storeData[id] = data;
			kfg.$store.set("data", storeData);

			const pattern = getFilePath(kfg.$config);
			const filePath = resolvePath(pattern, String(id));
			const dir = path.dirname(filePath);
			await fsPromises.mkdir(dir, { recursive: true });
			await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2));

			return data;
		}
		kfg.$store.set("data", data);
		await saveAsync(kfg, kfg.$config, data);
		return data;
	},

	onToJSON(kfg) {
		return Promise.resolve(kfg.$store.get("data"));
	},

	onInject(kfg, { data }) {
		kfg.$store.merge("data", data);
		return Promise.resolve();
	},

	onMerge(kfg, { data }) {
		kfg.$store.merge("data", data);
		return Promise.resolve();
	},

	save(kfg, data) {
		return saveAsync(kfg, kfg.$config, data);
	},

	onSize(kfg) {
		const data = kfg.$store.get("data");
		if (!data) return 0;
		if (kfg.multimode) return Object.keys(data).length;
		return 1;
	},
});
