import type { TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type {
	KfgDriverOptions,
	DeepGet,
	DriverConfig,
	DriverStore,
	inPromise,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";
import {
	deepMerge,
	deleteProperty,
	getProperty,
	setProperty,
} from "./utils/object";
import {
	addSmartDefaults,
	buildDefaultObject,
	buildTypeBoxSchema,
} from "./utils/schema";

/**
 * The base class for all drivers.
 * @template C The type of the driver configuration.
 * @template S The type of the driver store.
 * @template Async The type of the async flag.
 */
export class KfgDriver< 
	C extends DriverConfig,
	S extends DriverStore,
	Async extends boolean,
> {
	public readonly identify: string;
	public async = undefined as unknown as Async;
	public config: C;
	public data: Record<string, any> = {};
	public comments?: Record<string, string>;
	private compiledSchema?: TObject;

	protected store: S = {} as S;
	_onLoad?(schema: SchemaDefinition, opts: Partial<C>): inPromise<Async, any>;
	private _onSet?: (
		this: any,
		key: string,
		value: unknown,
		opions?: object,
	) => inPromise<Async, void>;
	private _onDel?: (this: any, key: string) => inPromise<Async, void>;

	// Utilities passed to drivers
	protected buildDefaultObject = buildDefaultObject;
	protected deepMerge = deepMerge;

	/**
	 * Creates a new instance of KfgDriver.
	 * @param options The driver options.
	 */
	constructor(public readonly options: KfgDriverOptions<C, S, Async>) {
		this.identify = options.identify;
		this.async = options.async as Async;
		this.config = options.config || ({} as C);
		this._onLoad = options.onLoad;
		this._onSet = options.onSet;
		this._onDel = options.onDel;
	}

	/**
	 * Clones the driver.
	 * @returns A new instance of the driver with the same options.
	 */
	public clone(): KfgDriver<C, S, Async> {
		const Constructor = this.constructor as new (
			options: KfgDriverOptions<C, S, Async>,
		) => KfgDriver<C, S, Async>;
		return new Constructor(this.options);
	}

	/**
	 * Injects data directly into the driver's data store.
	 * This data is merged with the existing data.
	 * @param data The data to inject.
	 */
	public inject(data: Partial<StaticSchema<any>>): inPromise<Async, void> {
		this.data = this.deepMerge(this.data, data);
		return (this.async ? Promise.resolve() : undefined) as inPromise<Async, void>;
	}

	/**
	 * Loads the configuration.
	 * @param schema The schema to use for validating the configuration.
	 * @param options The loading options.
	 */
	public load(
		schema: SchemaDefinition,
		options: Partial<C> = {},
	): inPromise<Async, void> {
		this.compiledSchema = buildTypeBoxSchema(schema);
		addSmartDefaults(this.compiledSchema);
		this.config = { ...this.config, ...options };
		const processResult = (result: any) => {
			this.data = result;
			this.validate(this.data);
		};

		if (this._onLoad) {
			const loadResult = this._onLoad.call(this, schema, this.config);

			if (this.async) {
				return (loadResult as Promise<any>).then(processResult) as inPromise<
					Async,
					void
				>;
			}

			processResult(loadResult);
		}

		return undefined as inPromise<Async, void>;
	}

	/**
	 * Gets a value from the configuration.
	 * @param path The path to the value.
	 * @returns The value at the given path.
	 */
	public get<T = StaticSchema<any>, P extends Paths<T> = any>(
		path: P,
	): inPromise<Async, DeepGet<T, P>> {
		//console.log('get', this.data)
		const value = getProperty(this.data, path as string);
		if (this.async) {
			return Promise.resolve(value) as any;
		}
		return value as any;
	}

	/**
	 * Checks if a value exists in the configuration.
	 * @param paths The paths to the values.
	 * @returns True if all values exist, false otherwise.
	 */
	public has<T = StaticSchema<any>, P extends Paths<T> = any>(
		...paths: P[]
	): inPromise<Async, boolean> {
		const hasAllProps = paths.every(
			(path) => getProperty(this.data, path as string) !== undefined,
		);
		if (this.async) {
			return Promise.resolve(hasAllProps) as any;
		}
		return hasAllProps as any;
	}

	/**
	 * Sets a value in the configuration.
	 * @param path The path to the value.
	 * @param value The new value.
	 * @param options The options for setting the value.
	 */
	public set<T = StaticSchema<any>, P extends Paths<T> = any>(
		path: P,
		value: DeepGet<T, P>,
		options?: { description?: string },
	): inPromise<Async, void> {
		if (path) {
			// <--- Add this check
			setProperty(this.data, path as string, value);
		}
		if (this._onSet) {
			return this._onSet.call(this, path as string, value, options);
		}
		return (this.async ? Promise.resolve() : undefined) as inPromise<
			Async,
			void
		>;
	}

	/**
	 * Inserts a partial value into an object in the configuration.
	 * @param path The path to the object.
	 * @param partial The partial value to insert.
	 */
	public insert<T = StaticSchema<any>, P extends RootPaths<T> = any>(
		path: P,
		partial: Partial<DeepGet<T, P>>,
	): inPromise<Async, void> {
		const currentObject = getProperty(this.data, path as string);
		if (typeof currentObject !== "object" || currentObject === null) {
			throw new Error(`Cannot insert into non-object at path: ${path}`);
		}
		Object.assign(currentObject, partial);

		return this.set(path as any, currentObject as any);
	}

	/**
	 * Deletes a value from the configuration.
	 * @param path The path to the value.
	 */
	public del<T = StaticSchema<any>, P extends Paths<T> = any>(
		path: P,
	): inPromise<Async, void> {
		deleteProperty(this.data, path as string);
		if (this._onDel) {
			return this._onDel.call(this, path as string);
		}
		return (this.async ? Promise.resolve() : undefined) as inPromise<
			Async,
			void
		>;
	}

	/**
	 * Validates the configuration against the schema.
	 * @param config The configuration to validate.
	 */
	private validate(config = this.data): void {
		if (!this.compiledSchema) return;

		const configWithDefaults = Value.Default(this.compiledSchema, config) as any;
		Value.Convert(this.compiledSchema, configWithDefaults);

		if (!Value.Check(this.compiledSchema, configWithDefaults)) {
			const errors = [...Value.Errors(this.compiledSchema, configWithDefaults)];
			throw new Error(
				`[Kfg] Validation failed:\n${errors
					.map((e) => `- ${e.path}: ${e.message}`) // Corrected: escaped backtick in template literal
					.join("\n")}`, // Corrected: escaped backtick in template literal
			);
		}

		this.data = configWithDefaults;
	}
}
