import type { SchemaDefinition, StaticSchema, DeepGet, Paths, RootPaths, inPromise } from "./types";
import { KfgDriver } from "./kfg-driver";
import { getProperty, setProperty, deleteProperty, deepMerge } from "./utils/object";
import { buildTypeBoxSchema, addSmartDefaults, makeSchemaOptional } from "./utils/schema";
import { Value } from "@sinclair/typebox/value";
import type { TObject } from "@sinclair/typebox";
import { defaultValidationMessage, notLoadedMessage } from "./errors";

export class Kfg<
    D extends KfgDriver<any, any>,
    S extends SchemaDefinition
> {
    public readonly "~driver": D;
    public readonly "~schema": { defined: S, compiled: TObject };
    private "~lastLoadOptions"?:
        | (Partial<D["config"]> & { only_importants?: boolean })
        | undefined;
    
    // Internal state
    public "~cache": Record<string, any> = {};
    public "~loaded": boolean = false;

    /**
     * Proxy to access configuration properties directly.
     * Example: kfg.config.database.port
     */
    public readonly config: StaticSchema<S>;
    public get driver(): D {
        return this["~driver"];
    }

    public get schema(): S {
        return this["~schema"].defined;
    }

    constructor(driver: D, schema: S) {
        this["~driver"] = driver;
        
        const compiled = buildTypeBoxSchema(schema);
        addSmartDefaults(compiled);
        
        this["~schema"] = {
            defined: schema,
            compiled: compiled
        };

        // Initialize proxy
        this.config = new Proxy({}, {
            get: (_target, prop) => {
                if (!this["~loaded"]) {
                    throw new Error(notLoadedMessage("reading from config proxy"));
                }
                return Reflect.get(this["~cache"], prop);
            },
            set: () => {
                throw new Error("[Kfg] Config is read-only via proxy. Use .set() to modify and persist.");
            },
            ownKeys: () => {
                return this["~loaded"] ? Reflect.ownKeys(this["~cache"]) : [];
            },
            getOwnPropertyDescriptor: (_target, prop) => {
                return this["~loaded"] ? Reflect.getOwnPropertyDescriptor(this["~cache"], prop) : undefined;
            }
        }) as StaticSchema<S>;
    }

    /**
     * Loads the configuration from the driver.
     */
	public load(
		options?: Partial<D["config"]> & {
			only_importants?: boolean;
		},
	): inPromise<D["async"], void> {
        this["~lastLoadOptions"] = options;
        if (options) {
            const { only_importants: _onlyImportants, ...driverConfig } = options as any;
            this["~driver"].config = {
                ...this["~driver"].config,
                ...driverConfig,
            };
        }

        let schemaToLoad = this["~schema"].defined;
        let compiled = buildTypeBoxSchema(schemaToLoad);
        addSmartDefaults(compiled);

        if (options?.only_importants) {
            schemaToLoad = makeSchemaOptional(schemaToLoad) as S;
            compiled = buildTypeBoxSchema(schemaToLoad);
            addSmartDefaults(compiled);
        }
        this["~schema"].compiled = compiled;

        const result = this["~driver"].load(schemaToLoad);

        const process = (rawData: any) => {
             const cleanData = this.validateAndClean(rawData, this["~schema"].compiled);
             this["~cache"] = cleanData;
             this["~loaded"] = true;
        };

        if (this["~driver"].async) {
            return (result as Promise<any>).then(process) as any;
        }

        process(result);
        return undefined as any;
    }

    public reload(
		options?: Partial<D["config"]> & {
			only_importants?: boolean;
		},
	): inPromise<D["async"], void> {
        this["~loaded"] = false;
        const nextOptions = options ?? this["~lastLoadOptions"];
        return this.load(nextOptions);
    }

    public save(): inPromise<D["async"], void> {
        if (!this["~loaded"]) throw new Error(notLoadedMessage("saving"));
        return this["~driver"].save(this["~cache"]) as any;
    }

    public get<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<StaticSchema<S>, P> {
        if (!this["~loaded"]) throw new Error(notLoadedMessage(`reading "${String(path)}"`));
        return getProperty(this["~cache"], path as string);
    }

    public root<P extends RootPaths<StaticSchema<S>>>(path: P): DeepGet<StaticSchema<S>, P> {
        return this.get(path as any) as DeepGet<StaticSchema<S>, P>;
    }

    public set<P extends Paths<StaticSchema<S>>>(
        path: P, 
        value: DeepGet<StaticSchema<S>, P>,
        descriptionOrOptions?: string | { description?: string }
    ): inPromise<D["async"], void> {
        if (!this["~loaded"]) throw new Error(notLoadedMessage(`writing "${String(path)}"`));
        const description =
            typeof descriptionOrOptions === "string"
                ? descriptionOrOptions
                : descriptionOrOptions?.description;
        
        const original = JSON.parse(JSON.stringify(this["~cache"]));
        setProperty(this["~cache"], path as string, value);
        
        try {
            this["~cache"] = this.validateAndClean(this["~cache"], this["~schema"].compiled);
        } catch (e) {
            this["~cache"] = original;
            throw e;
        }

        if (this["~driver"].update) {
            return this["~driver"].update(path as string, value, description) as any;
        } else {
            return this["~driver"].save(this["~cache"], { path: path as string, description }) as any;
        }
    }

	public insert<P extends RootPaths<StaticSchema<S>>>(
		path: P,
		partial: Partial<DeepGet<StaticSchema<S>, P>>,
	): inPromise<D["async"], void> {
		if (!this["~loaded"]) {
			throw new Error(notLoadedMessage(`inserting into "${String(path)}"`));
		}
        
        const currentObject = getProperty(this["~cache"], path as string);
        if (typeof currentObject !== "object" || currentObject === null) {
            throw new Error(`Cannot insert into non-object at path: ${String(path)}`);
        }
        
        const original = JSON.parse(JSON.stringify(this["~cache"]));
        Object.assign(currentObject, partial);
        
        try {
            this["~cache"] = this.validateAndClean(this["~cache"], this["~schema"].compiled);
        } catch (e) {
            this["~cache"] = original;
            throw e;
        }
        
        if (this["~driver"].update) {
            return this["~driver"].update(path as string, currentObject) as any;
        } else {
            return this["~driver"].save(this["~cache"]) as any;
        }
	}

	public inject(data: Partial<StaticSchema<S>>): inPromise<D["async"], void> {
        if (!this["~loaded"]) {
			throw new Error(notLoadedMessage("injecting data"));
		}
        
        const original = JSON.parse(JSON.stringify(this["~cache"]));
        this["~cache"] = deepMerge(this["~cache"], data);
        
        try {
            this["~cache"] = this.validateAndClean(this["~cache"], this["~schema"].compiled);
        } catch (e) {
            this["~cache"] = original;
            throw e;
        }
        
        return this["~driver"].save(this["~cache"]) as any;
    }

    public del<P extends Paths<StaticSchema<S>>>(path: P): inPromise<D["async"], void> {
        if (!this["~loaded"]) throw new Error(notLoadedMessage(`deleting "${String(path)}"`));
        
        const original = JSON.parse(JSON.stringify(this["~cache"]));
        const deleted = deleteProperty(this["~cache"], path as string);
        
        if (!deleted) return (this["~driver"].async ? Promise.resolve() : undefined) as any;

        try {
            this["~cache"] = this.validateAndClean(this["~cache"], this["~schema"].compiled);
        } catch (e) {
             this["~cache"] = original;
             throw e;
        }
        
        if (this["~driver"].delete) {
            return this["~driver"].delete(path as string) as any;
        } else {
            return this["~driver"].save(this["~cache"]) as any;
        }
    }

    public has<P extends Paths<StaticSchema<S>>>(...paths: P[]): boolean {
        if (!this["~loaded"]) {
            throw new Error(notLoadedMessage("checking paths"));
        }
        return paths.every((path) => getProperty(this["~cache"], path as string) !== undefined);
    }

	public conf<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<S, P> {
		if (!this["~loaded"]) {
			throw new Error(notLoadedMessage(`reading schema for "${String(path)}"`));
		}
		return getProperty(this["~schema"].defined, path as string) as DeepGet<S, P>;
	}

    public schematic<P extends Paths<StaticSchema<S>>>(path: P): DeepGet<S, P> {
        return this.conf(path);
    }

    private validateAndClean(data: any, schema: TObject): any {
        const current = Value.Default(schema, data) as any;
        Value.Convert(schema, current);

        if (!Value.Check(schema, current)) {
            const errors = [...Value.Errors(schema, current)];

            let message = defaultValidationMessage(errors);
            if (this["~driver"].formatError) {
                const customMessage = this["~driver"].formatError(errors);
                if (customMessage) {
                    message = customMessage;
                }
            }

            if (this["~driver"].forceExit) {
                console.error(message);
                process.exit(1);
            }

            throw new Error(message);
        }
        return current;
    }

    public toJSON(): inPromise<D["async"], StaticSchema<S>> {
        if (!this["~loaded"]) {
            throw new Error(notLoadedMessage("exporting JSON"));
        }
        if (this["~driver"].async) {
            return Promise.resolve(this["~cache"] as StaticSchema<S>) as any;
        }
        return this["~cache"] as any;
    }
}
