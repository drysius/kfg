import * as fs from "node:fs";
import * as path from "node:path";
import { KfgDriver } from "../kfg-driver";
import type { SchemaDefinition, TSchema } from "../types";
import { parse, removeEnvKey, updateEnvContent } from "../utils/env";
import {
	deepMerge,
	deleteProperty,
	getProperty,
	setProperty,
} from "../utils/object";
import { buildDefaultObject } from "../utils/schema";

function getFilePath(config: { path?: string }): string {
	return path.resolve(process.cwd(), config.path || ".env");
}

function coerceType(value: any, schema: TSchema) {
	if (value === undefined) return undefined;

	const type = (schema as any).type;
	if (type === "number") return Number(value);
	if (type === "boolean") return String(value).toLowerCase() === "true";

	if (type === "array" && typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue.startsWith("[") && trimmedValue.endsWith("]")) {
			try {
				return JSON.parse(trimmedValue);
			} catch {
				/* fallthrough */
			}
		}
	}

	return value;
}

function traverseSchema(
	schema: SchemaDefinition,
	envValues: Record<string, string>,
	prefix: string[] = [],
) {
	const builtConfig: Record<string, any> = {};

	for (const key in schema) {
		const currentPath = [...prefix, key];
		const definition = schema[key] as TSchema | SchemaDefinition;

		const isTypeBoxSchema = (def: any): def is TSchema =>
			!!def[Symbol.for("TypeBox.Kind")];

		if (isTypeBoxSchema(definition)) {
			const prop = definition.prop as string | undefined;
			const envKey = prop || currentPath.join("_").toUpperCase();

			let value: any = envValues[envKey];

			if (value === undefined) {
				value = definition.default;
			}

			if (value !== undefined) {
				builtConfig[key] = coerceType(value, definition);
			}
		} else if (typeof definition === "object" && definition !== null) {
			const nestedConfig = traverseSchema(
				definition as SchemaDefinition,
				envValues,
				currentPath,
			);
			builtConfig[key] = nestedConfig;
		}
	}

	return builtConfig;
}

/**
 * A driver for loading configuration from environment variables and .env files.
 */
export const EnvDriver = new KfgDriver<{ path?: string }, false>({
	identify: "env-driver",
	async: false,
	config: {},
	onMount(kfg, _opts) {
		const cfg = kfg.$config;
		const filePath = getFilePath(cfg);
		const fileContent = fs.existsSync(filePath)
			? fs.readFileSync(filePath, "utf-8")
			: "";
		const envFileValues = parse(fileContent);

		const processEnv = Object.fromEntries(
			Object.entries(process.env).filter(([, v]) => v !== undefined),
		) as Record<string, string>;

		const allEnvValues = { ...processEnv, ...envFileValues };

		const envData = traverseSchema(kfg.schema, allEnvValues);
		const defaultData = buildDefaultObject(kfg.schema);

		const finalData = deepMerge(defaultData, envData);
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

		if (!opts?.path) return;
		const envKey = opts.path.replace(/\./g, "_").toUpperCase();

		const filePath = getFilePath(kfg.$config);
		const currentContent = fs.existsSync(filePath)
			? fs.readFileSync(filePath, "utf-8")
			: "";
		const newContent = updateEnvContent(
			currentContent,
			envKey,
			opts.value,
			opts.description,
		);
		fs.writeFileSync(filePath, newContent);
	},

	onDelete(kfg, opts) {
		const data = kfg.$store.get("data", {});
		if (opts.path) {
			deleteProperty(data, opts.path);
		}
		kfg.$store.set("data", data);

		if (!opts?.path) return;
		const envKey = opts.path.replace(/\./g, "_").toUpperCase();
		const filePath = getFilePath(kfg.$config);
		if (!fs.existsSync(filePath)) {
			return;
		}
		const currentContent = fs.readFileSync(filePath, "utf-8");
		const newContent = removeEnvKey(currentContent, envKey);
		fs.writeFileSync(filePath, newContent);
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
});
