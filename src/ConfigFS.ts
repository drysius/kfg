import * as fs from "node:fs";
import { ConfigJS } from "./ConfigJS";
import type { ConfigJSDriver } from "./driver";
import { type SchemaDefinition, type inPromise, StaticSchema, TSchema } from "./types";
import { CFS_MANY_SYMBOL } from "./fs-factory";

type ManyPaths<S extends SchemaDefinition> = S extends TSchema
	? never
	: {
			[K in keyof S]: S[K] extends TSchema & { [CFS_MANY_SYMBOL]?: any }
				? K
				: S[K] extends SchemaDefinition
				? `${K & string}.${ManyPaths<S[K]>}`
				: never;
	  }[keyof S];

export class FileFSConfigJS<
	D extends ConfigJSDriver<any, any, any>,
	S extends SchemaDefinition,
> extends ConfigJS<D, S> {
	constructor(
		driver: D,
		schema: S,
		public readonly filePath: string,
	) {
		super(driver, schema);
	}

	public override load(
		options?: D["config"] & { only_importants?: boolean },
	) {
		const loadOptions = { ...options, path: this.filePath };
		return super.load(loadOptions);
	}

	public save(): inPromise<D["async"], void> {
		return this.driver.set(null as any, this.driver.data) as any;
	}

	public getMany<P extends ManyPaths<S>>(
		path: P,
	): inPromise<D["async"], FileFSConfigJS<any, any>[] | undefined> {
		const schema = this.conf(path as any);
		const manyInfo = (schema as any)[CFS_MANY_SYMBOL];

		if (!manyInfo) {
			throw new Error(`[ConfigFS] '${path}' is not a many-relation field.`);
		}

		const ids = this.get(path as any) as unknown as string[];
		if (!ids || !Array.isArray(ids)) {
			return undefined as any;
		}

		const relatedConfigFS = manyInfo.configFs;
		const files = ids.map((id) => relatedConfigFS.file(id));

		if (this.driver.async) {
			return Promise.all(files) as any;
		}

		return files as any;
	}

	public toString(): string {
		return this.filePath;
	}
}

export class ConfigFS<
	D extends ConfigJSDriver<any, any, any>,
	S extends SchemaDefinition,
> {
	private pathFn?: (id: string) => string;

	constructor(
		private driver: D,
		private schema: S,
	) { }

	public init(pathFn: (id: string) => string) {
		this.pathFn = pathFn;
	}

	private getPath(id: string): string {
		if (!this.pathFn) {
			throw new Error("[ConfigFS] ConfigFS not initialized. Call init() first.");
		}
		return this.pathFn(id);
	}

	public file(id: string): inPromise<D["async"], FileFSConfigJS<D, S>> {
		const filePath = this.getPath(id);
		const newDriver = new (this.driver.constructor as any)(
			this.driver.options,
		) as D;
		const fileInstance = new FileFSConfigJS(newDriver, this.schema, filePath);

		const loadResult = fileInstance.load();

		if (this.driver.async) {
			return (loadResult as Promise<void>).then(
				() => fileInstance,
			) as inPromise<D["async"], FileFSConfigJS<D, S>>;
		}
		return fileInstance as inPromise<D["async"], FileFSConfigJS<D, S>>;
	}

	public del(id: string): void {
		const filePath = this.getPath(id);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	}

	public copy(fromId: string, toId: string): void {
		const fromPath = this.getPath(fromId);
		const toPath = this.getPath(toId);
		fs.copyFileSync(fromPath, toPath);
	}

	public toJSON(id: string): inPromise<D["async"], StaticSchema<S>> {
		const fileInstance = this.file(id);
		if (fileInstance instanceof Promise) {
			return fileInstance.then(i => i.toJSON()) as any
		} else {
			return fileInstance.toJSON() as any;
		}
	}
}
