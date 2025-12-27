import type {
	DeepGet,
	Driver,
	DriverFactory,
	inPromise,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";
import { getProperty } from "./utils/object";
import { makeSchemaOptional } from "./utils/schema";

/**
 * The main class for Kfg. It is responsible for loading and managing the configuration.
 * @template D The type of the driver.
 * @template S The type of the schema.
 */
export class Kfg<D extends Driver<any>, S extends SchemaDefinition> {
	public driver: D;
	public schema: S;
	private loaded = false;
	private _lastOptions: any;

	/**
	 * Creates a new instance of Kfg.
	 * @param driverOrFactory The driver instance or factory function.
	 * @param schema The schema to use for validating the configuration.
	 */
	constructor(driverOrFactory: D | DriverFactory<any, any>, schema: S) {
		if (typeof driverOrFactory === "function") {
			this.driver = driverOrFactory({}) as D;
		} else {
			this.driver = driverOrFactory;
		}
		this.schema = schema;
	}

	/**
	 * Reloads the configuration.
	 * @param options - The loading options.
	 */
	public reload(
		options?: any & {
			only_importants?: boolean;
		},
	) {
		this.loaded = false;
		return this.load(options || this._lastOptions);
	}

	/**
	 * Loads the configuration.
	 * @param options - The loading options.
	 */
	public load(
		options?: any & {
			only_importants?: boolean;
		},
	) {
		this._lastOptions = options;
		let schemaToLoad = this.schema;
		if (options?.only_importants) {
			schemaToLoad = makeSchemaOptional(this.schema) as S;
		}
		const result = this.driver.load(schemaToLoad, options);
		if (this.driver.async) {
			return (result as Promise<any>).then((data) => {
				this.driver.inject(data);
				this.loaded = true;
			}) as inPromise<D["async"], void>;
		}
		this.driver.inject(result);
		this.loaded = true;
		return undefined as inPromise<D["async"], void>;
	}

	/**
	 * Gets a value from the configuration.
	 * @param path The path to the value.
	 * @returns The value at the given path.
	 */
	public get<P extends Paths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call load() first.");
		}
		return this.driver.get(path as string) as inPromise<
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
			throw new Error("[Kfg] Config not loaded. Call load() first.");
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
			throw new Error("[Kfg] Config not loaded. Call load() first.");
		}
		return this.driver.get(path as string) as inPromise<
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
			throw new Error("[Kfg] Config not loaded. Call load() first.");
		}

		const run = async () => {
			const data = await this.driver.get();
			return this.driver.set(path as string, value, { ...options, data });
		};

		if (this.driver.async) return run() as inPromise<D["async"], void>;
		const data = this.driver.get();
		return this.driver.set(path as string, value, {
			...options,
			data,
		}) as inPromise<D["async"], void>;
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
			throw new Error("[Kfg] Config not loaded. Call load() first.");
		}

		const run = async () => {
			const data = await this.driver.get();
			const target = getProperty(data, path as string);
			if (typeof target !== "object" || target === null) {
				throw new Error(`Cannot insert into non-object at path: ${path}`);
			}
			Object.assign(target, partial);
			return this.driver.set(path as string, target, { data });
		};

		if (this.driver.async) return run() as inPromise<D["async"], void>;
		const data = this.driver.get();
		const target = getProperty(data, path as string);
		if (typeof target !== "object" || target === null) {
			throw new Error(`Cannot insert into non-object at path: ${path}`);
		}
		Object.assign(target, partial);
		return this.driver.set(path as string, target, { data }) as inPromise<
			D["async"],
			void
		>;
	}

	/**
	 * Injects a partial value directly into the root configuration object.
	 * @param data The partial data to inject.
	 */
	public inject(data: Partial<StaticSchema<S>>) {
		return this.driver.inject(data) as inPromise<D["async"], void>;
	}

	/**
	 * Deletes a value from the configuration.
	 * @param path The path to the value.
	 */
	public del<P extends Paths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call load() first.");
		}

		const run = async () => {
			const data = await this.driver.get();
			return this.driver.del(path as string, { data });
		};

		if (this.driver.async) return run() as inPromise<D["async"], void>;
		const data = this.driver.get();
		return this.driver.del(path as string, { data }) as inPromise<
			D["async"],
			void
		>;
	}

	/**
	 * Gets the schema for a given path.
	 * @param path The path to the schema.
	 * @returns The schema at the given path.
	 */
	public conf<P extends Paths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call load() first.");
		}
		return getProperty(this.schema, path as string) as DeepGet<S, P>;
	}

	/**
	 * Returns the schema definition for a given path.
	 * @param path The path to the schema.
	 * @returns The schema at the given path.
	 */
	public schematic<P extends Paths<StaticSchema<S>>>(path: P) {
		return this.conf(path);
	}

	/**
	 * Hydrates the configuration with data and marks it as loaded.
	 * @param data The data to hydrate with.
	 */
	public hydrate(data: Partial<StaticSchema<S>>) {
		this.inject(data);
		this.loaded = true;
	}

	/**
	 * Returns cached data
	 * @returns
	 */
	public toJSON() {
		if (!this.loaded) {
			throw new Error("[Kfg] Config not loaded. Call load() first.");
		}
		return this.driver.get() as inPromise<D["async"], StaticSchema<S>>;
	}

	/**
	 * Unmounts the driver and cleans up resources.
	 */
	public unmount() {
		if (this.driver.unmount) {
			this.driver.unmount();
		}
	}
}
