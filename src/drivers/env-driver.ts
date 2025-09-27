import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigJSDriver } from "../driver";
import type { SchemaDefinition, TSchema } from "../types";
import { parse, updateEnvContent } from "../utils/env";

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

export const envDriver = new ConfigJSDriver({
	identify: "env-driver",
	async: false,
	config: { path: ".env" },
	onLoad(schema, _opts) {
		const filePath = getFilePath(this.config);
		const fileContent = fs.existsSync(filePath)
			? fs.readFileSync(filePath, "utf-8")
			: "";
		const envFileValues = parse(fileContent);

		const processEnv = Object.fromEntries(
			Object.entries(process.env).filter(([, v]) => v !== undefined),
		) as Record<string, string>;

		const allEnvValues = { ...processEnv, ...envFileValues };

		const envData = traverseSchema(schema, allEnvValues);
		const defaultData = this.buildDefaultObject(schema);

		this.store = this.deepMerge(defaultData, envData);
		return this.store;
	},
	onSet(key, value, options) {
		const envKey = key.replace(/\./g, "_").toUpperCase();

		const filePath = getFilePath(this.config);
		const currentContent = fs.existsSync(filePath)
			? fs.readFileSync(filePath, "utf-8")
			: "";
		const newContent = updateEnvContent(
			currentContent,
			envKey,
			value,
			options?.description,
		);
		fs.writeFileSync(filePath, newContent);
	},
});
