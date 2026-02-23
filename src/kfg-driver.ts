import type { SchemaDefinition, inPromise } from "./types";
import { deepMerge } from "./utils/object";
import { buildDefaultObject } from "./utils/schema";

export interface KfgDriverOptions<Config extends Record<string, any>, Async extends boolean> {
    name: string;
    config?: Config;
    async?: Async;
    forceExit?: boolean;
}

export abstract class KfgDriver<Config extends Record<string, any>, Async extends boolean> {
    public readonly name: string;
    public config: Config;
    public readonly async: Async;
    public readonly forceExit: boolean;

    constructor(options: KfgDriverOptions<Config, Async>) {
        this.name = options.name;
        this.config = options.config || {} as Config;
        this.async = (options.async ?? false) as Async;
        this.forceExit = options.forceExit ?? false;
    }

    /**
     * Loads the configuration from the source.
     * @param schema The schema definition.
     * @returns The loaded configuration object.
     */
    abstract load(schema: SchemaDefinition): inPromise<Async, Record<string, any>>;

    /**
     * Saves the configuration to the source.
     * @param data The full configuration object.
     * @param options Optional metadata for the save operation (e.g. description for a specific update).
     */
    abstract save(data: Record<string, any>, options?: { path?: string, description?: string }): inPromise<Async, void>;

    /**
     * Optional hook for updates. 
     * Use this ONLY if the driver handles atomic updates and doesn't need the full object every time.
     * If implemented, Kfg.set() will call this INSTEAD of save().
     * @param key The key updated (dot notation).
     * @param value The new value.
     */
    update?(key: string, value: any, description?: string): inPromise<Async, void>;

    /**
     * Optional hook for deletion.
     * Use this ONLY if the driver handles atomic deletion.
     * If implemented, Kfg.del() will call this INSTEAD of save().
     * @param key The key deleted.
     */
    delete?(key: string): inPromise<Async, void>;

    /**
     * Optional hook to format validation errors.
     * @param errors The array of errors from TypeBox/Value.
     * @returns A formatted string or undefined to use default formatting.
     */
    formatError?(errors: any[]): string;

    // --- Shared Utilities for Drivers ---

    protected buildDefault(schema: SchemaDefinition): Record<string, any> {
        return buildDefaultObject(schema);
    }

    protected merge(target: object, source: object): any {
        return deepMerge(target, source);
    }
}
