import { Value } from "@sinclair/typebox/value";
import type { KfgDriver } from "./kfg-driver";
import { KfgStore } from "./store";
import type {
	DeepGet,
	inPromise,
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
 */
export class Kfg<D extends KfgDriver<any, any>, S extends SchemaDefinition> {
	public driver: D;
	public schema: S;
	public $store = new KfgStore();
	private loaded = false;
	private _lastOptions: any;

	/**
	 * Creates a new instance of Kfg.
	 * @param driver The driver instance.
	 * @param schema The schema to use for validating the configuration.
	 */
	constructor(driver: D, schema: S) {
		this.driver = driver;
		this.schema = schema;
	}

	/**
	 * Returns the driver configuration from the store.
	 */
	get $config(): D["config"] {
		return this.$store.get("~driver", this.driver.config);
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
	public get<P extends Paths<StaticSchema<S>>>(
		path: P,
	): inPromise<D["async"], DeepGet<StaticSchema<S>, P>> {
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
	public has<P extends Paths<StaticSchema<S>>>(
		...paths: P[]
	): inPromise<D["async"], boolean> {
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
	public set<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: DeepGet<StaticSchema<S>, P>,
		options?: { description?: string },
	): inPromise<D["async"], void> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}
		return this.driver.set(this, path as string, value, options) as inPromise<
			D["async"],
			void
		>;
	}

	/**
	 * Inserts a partial value into an object in the configuration.
	 */
	public insert<P extends RootPaths<StaticSchema<S>>>(
		path: P,
		partial: Partial<DeepGet<StaticSchema<S>, P>>,
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
	public del<P extends Paths<StaticSchema<S>>>(
		path: P,
	): inPromise<D["async"], void> {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call mount() first.");
		}
		return this.driver.del(this, path as string) as inPromise<D["async"], void>;
	}

	/**
	 * Validates data against the schema.
	 */
	private validate(data: any, schema = this.schema): any {
		const compiledSchema = buildTypeBoxSchema(schema);
		addSmartDefaults(compiledSchema);
		const configWithDefaults = Value.Default(compiledSchema, data) as any;
		Value.Convert(compiledSchema, configWithDefaults);

		if (!Value.Check(compiledSchema, configWithDefaults)) {
			const errors = [...Value.Errors(compiledSchema, configWithDefaults)];
			throw new Error(
				`[Kfg] Validation failed:\n${errors
					.map((e) => `- ${e.path}: ${e.message}`)
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
