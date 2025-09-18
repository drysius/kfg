import type { TObject, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type {
	ConfigJSDriverOptions,
	DeepGet,
	DriverConfig,
	DriverStore,
	inPromise,
	Paths,
	RootPaths,
	StaticSchema,
} from "./types";
import { getProperty, setProperty } from "./utils/object";

export class ConfigJSDriver<
	C extends DriverConfig,
	S extends DriverStore,
	Async extends boolean,
> {
	public readonly identify: string;
	public async = undefined as unknown as Async;
	public config: C;
	public data: Record<string, any> = {};
	private compiledSchema?: TObject;
	private _getEnvKeyForPathOverridden?: (path: string) => string;

	protected store: S = {} as S;
	private _onLoad?: (this: any, opts: Partial<C>) => inPromise<Async, void>;
	private _onGet?: (this: any, key: string) => inPromise<Async, unknown>;
	private _onSet?: (
		this: any,
		key: string,
		value: unknown,
		options?: object,
	) => inPromise<Async, void>;

	constructor(options: ConfigJSDriverOptions<C, S, Async>) {
		this.identify = options.identify;
		this.async = options.async as Async;
		this.config = options.config || ({} as C);
		this._onLoad = options.onLoad;
		this._onGet = options.onGet;
		this._onSet = options.onSet;
		this._getEnvKeyForPathOverridden = options.getEnvKeyForPath;
	}

	public load(schema?: TObject, options: Partial<C> = {}): inPromise<Async, void> {
		if (schema) this.compiledSchema = schema;
		this.config = {
			...this.config,
			...options
		}

		const afterSaves = () => {
			this.validate();
		};

		const afterBuild = (config: Record<string, any>) => {
			this.data = config;
			if (!this.compiledSchema) return;

			const savesResult = this._applyInitialSaves(this.compiledSchema, "");
			if (this.async) {
				return (savesResult as Promise<void>).then(afterSaves);
			}
			afterSaves();
			return savesResult;
		};

		const afterLoad = () => {
			if (!this.compiledSchema) {
				return afterBuild(this.store);
			}

			if (this.async) {
				return this._buildConfigFromRawAsync(this.compiledSchema, "").then(
					(config) => afterBuild(config),
				);
			}
			const config = this.buildConfigFromRaw(this.compiledSchema, "");
			return afterBuild(config);
		};

		const loadResult = this._onLoad?.call(this, options ?? ({} as Partial<C>));
		if (this.async) {
			return (loadResult as Promise<void>).then(afterLoad) as inPromise<
				Async,
				void
			>;
		}
		afterLoad();
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
		path: P,
	): boolean {
		return getProperty(this.data, path as string) !== undefined;
	}

	public set<T = StaticSchema<any>, P extends Paths<T> = any>(
		path: P,
		value: DeepGet<T, P>,
		options?: { description?: string },
	): inPromise<Async, void> {
		setProperty(this.data, path as string, value);
		const envKey = this._getEnvKeyForPath(path as string);
		if (this._onSet) {
			return this._onSet.call(this, envKey, value, options);
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
		const promises: any[] = [];
		for (const [key, value] of Object.entries(partial)) {
			const fullPath = `${path}.${key}`;
			promises.push(this.set(fullPath as any, value as any));
		}

		if (this.async) {
			return Promise.all(promises).then(() => {}) as inPromise<Async, void>;
		}
		return undefined as inPromise<Async, void>;
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
		this._runRefines(this.compiledSchema, config, "");
	}

	private _runRefines(schema: TObject, config: any, path: string) {
		for (const key in schema.properties) {
			const propSchema = schema.properties[key] as any;
			const currentPath = path ? `${path}.${key}` : key;
			const value = config?.[key];

			if (value === undefined) continue;

			if (propSchema.type === "object" && propSchema.properties) {
				this._runRefines(propSchema, value, currentPath);
			} else if (propSchema.refines) {
				for (const refine of propSchema.refines) {
					const result = refine(value);
					if (result !== true)
						throw new Error(
							`[ConfigJS] Validation failed for '${currentPath}': ${
								typeof result === "string" ? result : "failed refine function"
							}`,
						);
				}
			}
		}
	}

	private _buildConfigFromRawAsync(
		schema: TObject,
		prefix: string,
	): Promise<Record<string, any>> {
		const result: Record<string, any> = {};
		const keys = Object.keys(schema.properties);
		const promises = keys.map((key) => {
			const propSchema = schema.properties[key] as any;
			const currentPath = prefix ? `${prefix}.${key}` : key;

			if (propSchema.type === "object" && propSchema.properties) {
				return this._buildConfigFromRawAsync(propSchema, currentPath).then(
					(value) => {
						result[key] = value;
					},
				);
			}
			const envKey = this._getEnvKeyForPath(currentPath);
			return (this._onGet?.(envKey) as Promise<unknown>).then((rawValue) => {
				result[key] =
					rawValue !== undefined
						? this.coerceType(rawValue, propSchema)
						: undefined;
			});
		});

		return Promise.all(promises).then(() => result);
	}

	private buildConfigFromRaw(
		schema: TObject,
		prefix: string,
	): Record<string, any> {
		const result: Record<string, any> = {};
		for (const key in schema.properties) {
			const propSchema = schema.properties[key] as any;
			const currentPath = prefix ? `${prefix}.${key}` : key;
			const envKey = this._getEnvKeyForPath(currentPath);
			const rawValue = this._onGet?.(envKey);

			result[key] =
				propSchema.type === "object" && propSchema.properties
					? this.buildConfigFromRaw(propSchema, currentPath)
					: rawValue !== undefined
						? this.coerceType(rawValue, propSchema)
						: undefined;
		}
		return result;
	}

	private coerceType(value: any, schema: TSchema) {
		if (schema.type === "number") return Number(value);
		if (schema.type === "boolean")
			return String(value).toLowerCase() === "true";
		if (schema.type === "array" && typeof value === "string") {
			const trimmedValue = value.trim();
			if (trimmedValue.startsWith("[") && trimmedValue.endsWith("]")) {
				try {
					return JSON.parse(trimmedValue);
				} catch (e) {
					// Not valid JSON, fall through to let validation handle it.
				}
			} else if (trimmedValue.includes(",")) {
				if (trimmedValue === "") return [];
				return trimmedValue.split(",").map((s) => s.trim());
			}
		}
		return value;
	}

	private _applyInitialSaves(
		schema: TObject,
		prefix: string,
	): inPromise<Async, void> {
		const promises: any[] = [];
		for (const key in schema.properties) {
			const propSchema = schema.properties[key] as any;
			const currentPath = prefix ? `${prefix}.${key}` : key;

			if (propSchema.type === "object" && propSchema.properties) {
				promises.push(this._applyInitialSaves(propSchema, currentPath));
			} else if (
				propSchema.initial_save &&
				propSchema.default !== undefined &&
				this.get(currentPath as any) === undefined
			) {
				promises.push(this.set(currentPath as any, propSchema.default));
			}
		}

		if (this.async) {
			return Promise.all(promises).then(() => {}) as inPromise<Async, void>;
		}
		return undefined as inPromise<Async, void>;
	}

	private _getEnvKeyForPath(path: string): string {
		if (this._getEnvKeyForPathOverridden) {
			return this._getEnvKeyForPathOverridden(path);
		}
		if (!this.compiledSchema) return path.replace(/\./g, "_").toUpperCase();
		const segments = path.split(".");
		let schema: any = this.compiledSchema;

		for (const segment of segments) {
			schema = schema?.properties?.[segment];
			if (!schema) break;
		}

		return schema?.prop || path.replace(/\./g, "_").toUpperCase();
	}
}
