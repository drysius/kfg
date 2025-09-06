import {
	type TObject,
	type TProperties,
	type TSchema,
	Type,
} from "@sinclair/typebox";
import type { ConfigJSDriver } from "./driver";
import type {
	DeepGet,
	inPromise,
	Paths,
	RootPaths,
	SchemaDefinition,
	StaticSchema,
} from "./types";

export class ConfigJS<
	D extends ConfigJSDriver<any, any, any>,
	S extends SchemaDefinition,
> {
	private driver: D;
	private compiledSchema: TObject;
	private loaded = false;

	constructor(config: { driver: D; schema: S }) {
		this.driver = config.driver;
		this.compiledSchema = this._buildSchema(config.schema);
	}

	public load(options?: D["config"]) {
		const result = this.driver.load(this.compiledSchema, options);
		if (this.driver.async) {
			return (result as Promise<void>).then(() => {
				this.loaded = true;
			}) as inPromise<D["async"], void>;
		}
		this.loaded = true;
		return result as inPromise<D["async"], void>;
	}

	public get<P extends Paths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.get(path) as inPromise<
			D["async"],
			DeepGet<StaticSchema<S>, P>
		>;
	}

	public has<P extends Paths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.has(path) as inPromise<D["async"], boolean>;
	}

	public root<P extends RootPaths<StaticSchema<S>>>(path: P) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.get(path) as inPromise<
			D["async"],
			DeepGet<StaticSchema<S>, P>
		>;
	}

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

	public insert<P extends RootPaths<StaticSchema<S>>>(
		path: P,
		partial: Partial<DeepGet<StaticSchema<S>, P>>,
	) {
		if (!this.loaded) {
			throw new Error("[ConfigJS] Config not loaded. Call load() first.");
		}
		return this.driver.insert(path, partial) as inPromise<D["async"], void>;
	}

	private _buildSchema(definition: SchemaDefinition): TObject {
		const properties: TProperties = {};
		for (const key in definition) {
			const value = definition[key];
			const isObject =
				typeof value === "object" &&
				value !== null &&
				!(value as any)[Symbol.for("TypeBox.Kind")];
			properties[key] = isObject
				? this._buildSchema(value as SchemaDefinition)
				: (value as TSchema);
		}
		return Type.Object(properties);
	}
}
