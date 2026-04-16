import * as fs from "node:fs";
import * as path from "node:path";
import { KfgDriver } from "../kfg-driver";
import type { SchemaDefinition, TSchema } from "../types";
import { parse, removeEnvKey, updateEnvContent } from "../utils/env";
import { colors } from "../utils/colors";
import { flattenObject } from "../utils/object";

export type EnvSource = "file" | "process" | "default" | "injected";

export class EnvDriver extends KfgDriver<{
    path?: string;
    forceexit?: boolean;
    forceExit?: boolean;
    debug?: boolean;
}, false> {
    private tracing: Record<string, { source: EnvSource; key: string }> = {};

    constructor(config: { path?: string; forceexit?: boolean; forceExit?: boolean; debug?: boolean } = {}) {
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

        // Reset tracing on each load
        this.tracing = {};

        const envData = this.traverseSchema(schema, envFileValues, processEnv);
        const defaultData = this.buildDefault(schema);

        const merged = this.merge(defaultData, envData);

        if (this.config.debug) {
            this.printTrace();
        }

        return merged;
    }

    save(data: Record<string, any>, options?: { path?: string, description?: string }): void {
        const filePath = this.getFilePath();
        const flatData = flattenObject(data);
        
        // If atomic update requested via options.path (called by Kfg.set when update not implemented)
        if (options?.path) {
            const value = flatData[options.path];
            this.update(options.path, value, options.description);
            return;
        }

        // Full save: read current, update all keys, write back
        let currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
        
        for (const [dotPath, value] of Object.entries(flatData)) {
            const envKey = this.pathToEnvKey(dotPath);
            currentContent = updateEnvContent(currentContent, envKey, value);
        }
        
        fs.writeFileSync(filePath, currentContent);
    }

    update(key: string, value: any, description?: string): void {
        const envKey = this.pathToEnvKey(key);
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
        this.tracing[key] = { source: "injected", key: envKey };
    }

    delete(key: string): void {
        const envKey = this.pathToEnvKey(key);
        const filePath = this.getFilePath();
        if (!fs.existsSync(filePath)) {
            return;
        }
        const currentContent = fs.readFileSync(filePath, "utf-8");
        const newContent = removeEnvKey(currentContent, envKey);
        fs.writeFileSync(filePath, newContent);
        delete this.tracing[key];
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
                missing.push(colors.green(`+ ${envKey}=${expected}`));
            } else {
                const received = typeof err.value === "string" ? `"${err.value}"` : String(err.value);
                invalid.push(
                    `in ${fileLabel} fix:\n${colors.gray("received:")}\n${colors.red(`- ${envKey}=${received}`)}\n${colors.gray("expected:")}\n${colors.green(`+ ${envKey}=${expected}`)}`,
                );
            }
        }

        const sections: string[] = [colors.bold("[KFG] Invalid environment configuration.")];
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

    private pathToEnvKey(path: string): string {
        return path.replace(/\./g, "_").toUpperCase();
    }

    private traverseSchema(
        schema: SchemaDefinition,
        envFileValues: Record<string, string>,
        processEnv: Record<string, string>,
        prefix: string[] = [],
    ) {
        const builtConfig: Record<string, any> = {};
    
        for (const key in schema) {
            const currentPath = [...prefix, key];
            const definition = schema[key] as TSchema | SchemaDefinition;
    
            const isTypeBoxSchema = (def: any): def is TSchema =>
                !!def[Symbol.for("TypeBox.Kind")];
    
            if (isTypeBoxSchema(definition)) {
                // TypeBox Object with properties → recurse like a plain nested object
                // so APP_NAME=... and APP_PORT=... are read instead of a single APP=...
                if ((definition as any).type === "object" && (definition as any).properties) {
                    const nestedConfig = this.traverseSchema(
                        (definition as any).properties as SchemaDefinition,
                        envFileValues,
                        processEnv,
                        currentPath,
                    );
                    if (Object.keys(nestedConfig).length > 0) {
                        builtConfig[key] = nestedConfig;
                    }
                } else {
                    const prop = definition.prop as string | undefined;
                    const envKey = prop || currentPath.join("_").toUpperCase();
                    const dotPath = currentPath.join(".");

                    let value: any = processEnv[envKey];
                    let source: EnvSource = "process";

                    if (value === undefined) {
                        value = envFileValues[envKey];
                        source = "file";
                    }

                    if (value === undefined) {
                        value = definition.default;
                        source = "default";
                    }

                    if (value !== undefined) {
                        this.tracing[dotPath] = { source, key: envKey };
                        builtConfig[key] = this.coerceType(value, definition);
                    }
                }
            } else if (typeof definition === "object" && definition !== null) {
                const nestedConfig = this.traverseSchema(
                    definition as SchemaDefinition,
                    envFileValues,
                    processEnv,
                    currentPath,
                );
                if (Object.keys(nestedConfig).length > 0) {
                    builtConfig[key] = nestedConfig;
                }
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

        if (type === "object" && typeof value === "string") {
            const trimmedValue = value.trim();
            if (trimmedValue.startsWith("{") && trimmedValue.endsWith("}")) {
                try {
                    return JSON.parse(trimmedValue);
                } catch {
                    /* fallthrough */
                }
            }
        }

        return value;
    }

    private printTrace() {
        console.log(colors.bold("\n[KFG] Environment Trace:"));
        for (const [path, info] of Object.entries(this.tracing)) {
            const sourceColor = 
                info.source === "process" ? colors.cyan :
                info.source === "file" ? colors.green :
                info.source === "injected" ? colors.yellow :
                colors.gray;
            
            console.log(
                `${colors.gray(path.padEnd(25))} -> ${colors.bold(info.key.padEnd(20))} [${sourceColor(info.source)}]`
            );
        }
        console.log("");
    }
}
