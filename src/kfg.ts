import { Value } from "@sinclair/typebox/value";
import type { KfgDriver } from "./kfg-driver";
import { KfgStore } from "./store";
import type {
	DeepGet,
	inPromise,
	KfgHookCallback,
	KfgHooks,
	MultiDeepGet,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";
import {
	addSmartDefaults,
	buildTypeBoxSchema,
	makeSchemaOptional,
} from "./utils/schema";

/**
 * The main class for Kfg. It is responsible for loading and managing the configuration.
 * @template D The type of the driver.
 * @template S The type of the schema.
 * @template M Whether multimode is enabled.
 */
export class Kfg<
	D extends KfgDriver<any, any>,
	S extends SchemaDefinition,
	M extends boolean = false,
> {
	public driver: D;
	public schema: S;
	public $store = new KfgStore();
	public multimode = false;
	private loaded = false;
	private _lastOptions: any;
	private hooks: {
		[K in keyof KfgHooks<S>]?: Array<KfgHookCallback<S, K>>;
	} = {};

	/**
	 * Creates a new instance of Kfg.
	 * @param driver The driver instance.
	 * @param schema The schema to use for validating the configuration.
	 * @param options Options or multimode flag.
	 */
	constructor(driver: D, schema: S, options?: { multiple?: M } | M) {
		this.driver = driver;
		this.schema = schema;
		if (typeof options === "boolean") {
			this.multimode = options;
		} else if (options) {
			this.multimode = (options as any).multiple || false;
		}
	}

	/**
	 * Returns the driver configuration from the store.
	 */
	get $config(): D["config"] {
		// We access store here for meta-config.
		return this.$store.get("~driver", this.driver.config);
	}

	/**
	 * Registers a hook.
	 */
	public on<E extends keyof KfgHooks<S>>(
		event: E,
		fn: KfgHookCallback<S, E>,
	): this {
		if (!this.hooks[event]) {
			this.hooks[event] = [];
		}
		this.hooks[event]?.push(fn as any);
		return this;
	}

	private runHooks<E extends keyof KfgHooks<S>>(
		event: E,
		...args: KfgHooks<S>[E]
	): any | Promise<any> {
		const hooks = this.hooks[event];

		if (!hooks || hooks.length === 0) {
			return this.driver.async ? Promise.resolve(args[0]) : args[0];
		}

		let currentData = args[0];
		const otherArgs = args.slice(1);

		if (this.driver.async) {
			return (async () => {
				for (const hook of hooks) {
					const result = await (hook as any)(currentData, ...otherArgs);
					if (result !== undefined && event !== "ready") {
						currentData = result;
					}
				}
				return currentData;
			})();
		}

		for (const hook of hooks) {
			const result = (hook as any)(currentData, ...otherArgs);
			if (result !== undefined && event !== "ready") {
				currentData = result;
			}
		}
		return currentData;
	}

	/**
	 * Mounts the configuration using the driver.
	 * @param options - The loading options.
	 */
	public mount(
		options?: D["config"] & {
			only_importants?: boolean;
		},
	): inPromise<D["async"], void> {
		this._lastOptions = options;
		let schemaToLoad = this.schema;
		if (options?.only_importants) {
			schemaToLoad = makeSchemaOptional(this.schema) as S;
		}

		const processResult = (result: any) => {
			this.validate(result, schemaToLoad);
			this.loaded = true;
			this.runHooks("ready");
		};

		const result = this.driver.mount(this, options);
		if (this.driver.async) {
			return (result as Promise<void>).then(processResult) as inPromise<
				D["async"],
				void
			>;
		}
		processResult(result);
		return undefined as inPromise<D["async"], void>;
	}

	/**
	 * Alias for mount().
	 */
	public load(
		options?: Partial<D["config"]> & {
			only_importants?: boolean;
		},
	) {
		return this.mount(options);
	}

	/**
	 * Reloads the configuration.
	 * @param options - The loading options.
	 */
	public reload(
		options?: Partial<D["config"]> & {
			only_importants?: boolean;
		},
	) {
		this.loaded = false;
		return this.mount(options || this._lastOptions);
	}

	/**
	 * Saves the configuration.
	 * @param data Optional data to save.
	 */
	public save(data?: any): inPromise<D["async"], void> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}
		return this.driver.saveTo(this, data) as inPromise<D["async"], void>;
	}

	/**
	 * Gets a value from the configuration.
	 * @param path The path to the value.
	 * @returns The value at the given path.
	 */
	public get<
		P extends M extends true
			? `${string}.${Paths<StaticSchema<S>>}` | string
			: Paths<StaticSchema<S>>,
	>(
		path: P,
	): inPromise<
		D["async"],
		M extends true
			? MultiDeepGet<StaticSchema<S>, P>
			: DeepGet<StaticSchema<S>, P>
	> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}
		return this.driver.get(this, path as string);
	}

	/**
	 * Checks if a value exists in the configuration.
	 * @param paths The paths to the values.
	 * @returns True if all values exist, false otherwise.
	 */
	public has<
		P extends M extends true
			? `${string}.${Paths<StaticSchema<S>>}` | string
			: Paths<StaticSchema<S>>,
	>(...paths: P[]): inPromise<D["async"], boolean> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}
		return this.driver.has(this, ...(paths as string[])) as inPromise<
			D["async"],
			boolean
		>;
	}

	/**
	 * Sets a value in the configuration.
	 */
	public set<
		P extends M extends true
			? `${string}.${Paths<StaticSchema<S>>}` | string
			: Paths<StaticSchema<S>>,
	>(
		path: P,
		value: M extends true
			? MultiDeepGet<StaticSchema<S>, P>
			: DeepGet<StaticSchema<S>, P>,
		options?: { description?: string },
	): inPromise<D["async"], void> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}

		const run = (processedValue: any) => {
			return this.driver.set(
				this,
				path as string,
				processedValue,
				options,
			) as inPromise<D["async"], void>;
		};

		if (this.multimode) {
			const parts = (path as string).split(".");
			const id = parts[0];

			if (parts.length === 1) {
				const getItem = this.get(id as any);

				const processHook = (oldItem: any) => {
					if (oldItem) {
						return this.runHooks("update", value as any, oldItem);
					}
					return value;
				};

				if (this.driver.async) {
					return (getItem as Promise<any>)
						.then((oldItem) => processHook(oldItem))
						.then((processed) => run(processed)) as any;
				}

				const oldItem = getItem;
				const processed = processHook(oldItem);
				return run(processed) as any;
			}
		}

		return this.driver.set(this, path as string, value, options) as inPromise<
			D["async"],
			void
		>;
	}

	/**
	 * Inserts a partial value into an object in the configuration.
	 */
	public insert<
		P extends M extends true
			? `${string}.${RootPaths<StaticSchema<S>>}` | string
			: RootPaths<StaticSchema<S>>,
	>(
		path: P,
		partial: Partial<
			M extends true
				? MultiDeepGet<StaticSchema<S>, P>
				: DeepGet<StaticSchema<S>, P>
		>,
	): inPromise<D["async"], void> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}
		return this.driver.insert(this, path as string, partial) as inPromise<
			D["async"],
			void
		>;
	}

	/**
	 * Injects a partial value directly into the root configuration object.
	 */
	public inject(data: Partial<StaticSchema<S>>): inPromise<D["async"], void> {
		return this.driver.inject(this, data) as inPromise<D["async"], void>;
	}

	/**
	 * Deletes a value from the configuration.
	 */
	public del<
		P extends M extends true
			? `${string}.${Paths<StaticSchema<S>>}` | string
			: Paths<StaticSchema<S>>,
	>(path: P): inPromise<D["async"], void> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}

		const run = () => {
			return this.driver.del(this, path as string) as inPromise<
				D["async"],
				void
			>;
		};

		if (this.multimode) {
			const parts = (path as string).split(".");
			if (parts.length === 1) {
				const id = parts[0];
				const getItem = this.get(id as any);

				const processHook = (oldItem: any) => {
					if (oldItem) {
						return this.runHooks("delete", oldItem);
					}
					return null;
				};

				if (this.driver.async) {
					return (getItem as Promise<any>)
						.then((oldItem) => processHook(oldItem))
						.then(() => run()) as any;
				}

				const oldItem = getItem;
				processHook(oldItem);
				return run() as any;
			}
		}

		return run() as any;
	}

	public create(data: Partial<StaticSchema<S>>): inPromise<D["async"], any> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}

		const run = (processedData: any) => {
			return this.driver.create(this, processedData);
		};

		const hookResult = this.runHooks("create", data as any);
		if (this.driver.async) {
			return (hookResult as Promise<any>).then(run) as any;
		}
		return run(hookResult) as any;
	}

	public size(): number {
		return this.driver.size(this);
	}

	public where(id: string) {
		const self = this;
		return {
			get(path?: string) {
				const fullPath = path ? `${id}.${path}` : id;
				return self.get(fullPath as any);
			},
			set(path: string, value: any) {
				const fullPath = `${id}.${path}`;
				return self.set(fullPath as any, value);
			},
			del(path?: string) {
				const fullPath = path ? `${id}.${path}` : id;
				return self.del(fullPath as any);
			},
			toJSON() {
				return undefined;
			},
		};
	}

	/**
	 * Validates data against the schema.
	 */
	private validate(data: any, schema = this.schema): any {
		if (this.multimode) {
			if (typeof data !== "object" || data === null) {
				return {};
			}
			for (const key in data) {
				data[key] = this.validateItem(data[key], schema);
			}
			return data;
		}
		return this.validateItem(data, schema);
	}

	private validateItem(data: any, schema: SchemaDefinition): any {
		const compiledSchema = buildTypeBoxSchema(schema);
		addSmartDefaults(compiledSchema);
		const configWithDefaults = Value.Default(compiledSchema, data) as any;
		Value.Convert(compiledSchema, configWithDefaults);

		if (!Value.Check(compiledSchema, configWithDefaults)) {
			const errors = [...Value.Errors(compiledSchema, configWithDefaults)];
			throw new Error(
				`[Kfg] Validation failed:\n${errors
					.map((e) => `- ${e.path}: ${e.message}`) // Corrected escape sequence for newline
					.join("\n")}`,
			);
		}
		return configWithDefaults;
	}

	/**
	 * Unmounts the driver.
	 */
	public unmount() {
		this.driver.unmount?.(this);
	}

	/**
	 * Returns cached data.
	 */
	public toJSON(): StaticSchema<S> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}
		return this.driver.toJSON(this);
	}
}
