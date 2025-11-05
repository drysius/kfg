import type { ConfigJSDriver } from "./driver";
import type {
	DeepGet,
	inPromise,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";
import { getProperty } from "./utils/object";
import { makeSchemaOptional } from "./utils/schema";

/**
 * The main class for ConfigJS. It is responsible for loading and managing the configuration.
 * @template D The type of the driver.
 * @template S The type of the schema.
 */
export class ConfigJS<
	D extends ConfigJSDriver<any, any, any>,
	S extends SchemaDefinition,
> {
	public driver: D;
	public schema: S;
	private loaded = false;

	/**
	 * Creates a new instance of ConfigJS.
	 * @param driver The driver to use for loading and saving the configuration.
	 * @param schema The schema to use for validating the configuration.
	 */
	constructor(driver: D, schema: S) {
		this.driver = driver;
		this.schema = schema;
	}

	/**
	 * Loads the configuration.
	 * @param options - The loading options.
	 */
	public load(
		options?: Partial<D["config"]> & {
			/**
			 * If true, all schema properties will be treated as optional during validation,
			 * except for those marked as `important: true`. This is useful for loading a
			 * partial configuration without triggering validation errors for missing values.
			 */
			only_importants?: boolean;
		},
	) {
		let schemaToLoad = this.schema;
		if (options?.only_importants) {
			schemaToLoad = makeSchemaOptional(this.schema) as S;
		}
		const result = this.driver.load(schemaToLoad, options);
		if (this.driver.async) {
			return (result as Promise<void>).then(() => {
				this.loaded = true;
			}) as inPromise<D["async"], void>;
		}
		this.loaded = true;
		return result as inPromise<D["async"], void>;
	}

	/**
	 * Gets a value from the configuration.
	 * @param path The path to the value.
	 * @returns The value at the given path.
	 */
	public get<P extends Paths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.get(path) as inPromise<
			D["async"],
			DeepGet<StaticSchema<S>, P>
		>;
	}

	/**
	 * Checks if a value exists in the configuration.
	 * @param paths The paths to the values.
	 * @returns True if all values exist, false otherwise.
	 */
	public has<P extends Paths<StaticSchema<S>>>(...paths: P[]) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.has(...paths) as inPromise<D["async"], boolean>;
	}

	/**
	 * Gets a value from the configuration.
	 * @param path The path to the value.
	 * @returns The value at the given path.
	 */
	public root<P extends RootPaths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.get(path) as inPromise<
			D["async"],
			DeepGet<StaticSchema<S>, P>
		>;
	}

	/**
	 * Sets a value in the configuration.
	 * @param path The path to the value.
	 * @param value The new value.
	 * @param options The options for setting the value.
	 */
	public set<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: DeepGet<StaticSchema<S>, P>,
		options?: { description?: string },
	) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.set(path, value, options) as inPromise<D["async"], void>;
	}

	/**
	 * Inserts a partial value into an object in the configuration.
	 * @param path The path to the object.
	 * @param partial The partial value to insert.
	 */
	public insert<P extends RootPaths<StaticSchema<S>>>(
		path: P,
		partial: Partial<DeepGet<StaticSchema<S>, P>>,
	) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.insert(path, partial) as inPromise<D["async"], void>;
	}

	/**
	 * Deletes a value from the configuration.
	 * @param path The path to the value.
	 */
	public del<P extends Paths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.del(path) as inPromise<D["async"], void>;
	}

	/**
	 * Gets the schema for a given path.
	 * @param path The path to the schema.
	 * @returns The schema at the given path.
	 */
	public conf<P extends Paths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return getProperty(this.schema, path as string) as DeepGet<S, P>;
	}

	/**
	 * Returns cached data
	 * @returns
	 */
	public async toJSON() {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		if (this.driver.async) {
			return Promise.resolve(this.driver.data) as inPromise<
				D["async"],
				StaticSchema<S>
			>;
		}
		return this.driver.data as inPromise<D["async"], StaticSchema<S>>;
	}
}
