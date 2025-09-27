import type { TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type {
	ConfigJSDriverOptions,
	DeepGet,
	DriverConfig,
	DriverStore,
	inPromise,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";
import { deepMerge, getProperty, setProperty } from "./utils/object";
import {
	addSmartDefaults,
	buildDefaultObject,
	buildTypeBoxSchema,
} from "./utils/schema";

export class ConfigJSDriver<
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
		options?: object,
	) => inPromise<Async, void>;

	// Utilities passed to drivers
	protected buildDefaultObject = buildDefaultObject;
	protected deepMerge = deepMerge;

	constructor(options: ConfigJSDriverOptions<C, S, Async>) {
		this.identify = options.identify;
		this.async = options.async as Async;
		this.config = options.config || ({} as C);
		this._onLoad = options.onLoad;
		this._onSet = options.onSet;
	}

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

	public get<T = StaticSchema<any>, P extends Paths<T> = any>(
		path: P,
	): inPromise<Async, DeepGet<T, P>> {
		const value = getProperty(this.data, path as string);
		if (this.async) {
			return Promise.resolve(value) as any;
		}
		return value as any;
	}

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

	public set<T = StaticSchema<any>, P extends Paths<T> = any>(
		path: P,
		value: DeepGet<T, P>,
		options?: { description?: string },
	): inPromise<Async, void> {
		setProperty(this.data, path as string, value);
		if (this._onSet) {
			return this._onSet.call(this, path as string, value, options);
		}
		return (this.async ? Promise.resolve() : undefined) as inPromise<
			Async,
			void
		>;
	}

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

	private validate(config = this.data): void {
		if (!this.compiledSchema) return;

		Value.Default(this.compiledSchema, config);
		Value.Convert(this.compiledSchema, config);

		if (!Value.Check(this.compiledSchema, config)) {
			const errors = [...Value.Errors(this.compiledSchema, config)];
			throw new Error(
				`[ConfigJS] Validation failed:\n${errors
					.map((e) => `- ${e.path}: ${e.message}`)
					.join("\n")}`,
			);
		}

		this.data = config;
	}
}
