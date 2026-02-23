import * as fs from "node:fs";
import * as path from "node:path";
import { KfgDriver } from "../kfg-driver";
import type { SchemaDefinition, TSchema } from "../types";
import { parse, removeEnvKey, updateEnvContent } from "../utils/env";

export class EnvDriver extends KfgDriver<{
    path?: string;
    forceexit?: boolean;
    forceExit?: boolean;
}, false> {
    private readonly gray = (s: string) => `\x1b[90m${s}\x1b[0m`;
    private readonly green = (s: string) => `\x1b[32m${s}\x1b[0m`;
    private readonly red = (s: string) => `\x1b[31m${s}\x1b[0m`;

    constructor(config: { path?: string; forceexit?: boolean; forceExit?: boolean } = {}) {
        const forceExit = config.forceExit ?? config.forceexit ?? true;
        super({ name: "env-driver", config, async: false, forceExit });
    }

    load(schema: SchemaDefinition): Record<string, any> {
        const filePath = this.getFilePath();
        const fileContent = fs.existsSync(filePath)
            ? fs.readFileSync(filePath, "utf-8")
            : "";
        const envFileValues = parse(fileContent);

        const processEnv = Object.fromEntries(
            Object.entries(process.env).filter(([, v]) => v !== undefined),
        ) as Record<string, string>;

        const allEnvValues = { ...envFileValues, ...processEnv };

        const envData = this.traverseSchema(schema, allEnvValues);
        const defaultData = this.buildDefault(schema);

        return this.merge(defaultData, envData);
    }

    save(_data: Record<string, any>, options?: { path?: string, description?: string }): void {
        if (options?.path) {
            // EnvDriver doesn't support full object save elegantly.
            // It relies on atomic updates via `update` usually.
            // But if called with path, we can try to update.
            // However, we need the VALUE for that path.
            // Since save() receives the full data, we'd need to extract it.
            // Kfg now passes `update` if available, so this might be fallback.
        }
    }

    update(key: string, value: any, description?: string): void {
        const envKey = key.replace(/\./g, "_").toUpperCase();
        const filePath = this.getFilePath();
        const currentContent = fs.existsSync(filePath)
            ? fs.readFileSync(filePath, "utf-8")
            : "";
            
        const newContent = updateEnvContent(
            currentContent,
            envKey,
            value,
            description,
        );
        fs.writeFileSync(filePath, newContent);
    }

    delete(key: string): void {
        const envKey = key.replace(/\./g, "_").toUpperCase();
        const filePath = this.getFilePath();
        if (!fs.existsSync(filePath)) {
            return;
        }
        const currentContent = fs.readFileSync(filePath, "utf-8");
        const newContent = removeEnvKey(currentContent, envKey);
        fs.writeFileSync(filePath, newContent);
    }

    formatError(errors: any[]): string {
        const missing: string[] = [];
        const invalid: string[] = [];
        const fileLabel = this.config.path || ".env";

        const reportedMissingPaths = new Set<string>();
        for (const err of errors) {
            const isMissing = err.type === 45 || err.message.toLowerCase().includes("required");
            if (isMissing) reportedMissingPaths.add(err.path);
        }

        for (const err of errors) {
            const jsonPath = err.path;
            const envKey =
                err.schema?.prop ||
                jsonPath.replace(/^\//, "").replace(/\//g, "_").toUpperCase();
            const isMissing = err.type === 45 || err.message.toLowerCase().includes("required");

            if (!isMissing && reportedMissingPaths.has(jsonPath) && err.value === undefined) {
                continue;
            }

            const expectedType = err.schema?.type || "unknown";
            const expected = err.schema?.default !== undefined
                ? JSON.stringify(err.schema.default)
                : `<${expectedType}>`;

            if (isMissing) {
                missing.push(this.green(`+ ${envKey}=${expected}`));
            } else {
                const received = typeof err.value === "string" ? `"${err.value}"` : String(err.value);
                invalid.push(
                    `in ${fileLabel} fix:\n${this.gray("received:")}\n${this.red(`- ${envKey}=${received}`)}\n${this.gray("expected:")}\n${this.green(`+ ${envKey}=${expected}`)}`,
                );
            }
        }

        const sections: string[] = ["[KFG] Invalid environment configuration."];
        if (missing.length > 0) {
            sections.push(`in ${fileLabel} add:`);
            sections.push(...missing);
        }
        if (invalid.length > 0) {
            sections.push("Invalid variable values:");
            sections.push(...invalid);
        }
        sections.push("Update your .env values and run load() again.");
        return sections.join("\n");
    }

    private getFilePath(): string {
        return path.resolve(process.cwd(), this.config.path || ".env");
    }

    private traverseSchema(
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
                    builtConfig[key] = this.coerceType(value, definition);
                }
            } else if (typeof definition === "object" && definition !== null) {
                const nestedConfig = this.traverseSchema(
                    definition as SchemaDefinition,
                    envValues,
                    currentPath,
                );
                builtConfig[key] = nestedConfig;
            }
        }
    
        return builtConfig;
    }

    private coerceType(value: any, schema: TSchema) {
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
}
