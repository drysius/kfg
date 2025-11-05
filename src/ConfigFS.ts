import * as fs from "node:fs";
import type { TUnsafe } from "@sinclair/typebox";
import { ConfigJS } from "./ConfigJS";
import type { ConfigJSDriver } from "./driver";
import { CFS_JOIN_SYMBOL, CFS_MANY_SYMBOL } from "./fs-factory";
import type {
	DeepGet,
	inPromise,
	Paths,
	SchemaDefinition,
	StaticSchema,
	TSchema,
} from "./types";

export type StaticSchemaWithRelation<S> = S extends TSchema
	? StaticSchema<S>
	: {
			[K in keyof S]: S[K] extends FileFSConfigJS<any, any>
				? string
				: S[K] extends FileFSConfigJS<any, any>[]
					? string[]
					: StaticSchemaWithRelation<S[K]>;
		};

type RelationPaths<S extends SchemaDefinition> = S extends TSchema
	? never
	: {
			[K in keyof S]: S[K] extends
				| TUnsafe<FileFSConfigJS<any, any>>
				| TUnsafe<FileFSConfigJS<any, any>[]>
				? K
				: S[K] extends SchemaDefinition
					? `${K & string}.${RelationPaths<S[K]>}`
					: never;
		}[keyof S];

//@ts-expect-error more recursive types, ignore
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

	public override load(options?: D["config"] & { only_importants?: boolean }) {
		const loadOptions = { ...options, path: this.filePath };
		return super.load(loadOptions);
	}

	//@ts-expect-error configfs change internal logic of configjs, ignore this
	public override set<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: StaticSchemaWithRelation<DeepGet<StaticSchema<S>, P>>,
		options?: { description?: string },
	): inPromise<D["async"], void> {
		return super.set(path, value as any, options);
	}

	//@ts-expect-error configfs change internal logic of configjs, ignore this
	public override insert<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: Partial<StaticSchemaWithRelation<DeepGet<StaticSchema<S>, P>>>,
	): inPromise<D["async"], void> {
		//@ts-expect-error
		return super.insert(path, value as any);
	}

	//@ts-expect-error configfs change internal logic of configjs, ignore this
	public override root<P extends Paths<StaticSchema<S>>>(
		path: P,
	): inPromise<
		D["async"],
		StaticSchemaWithRelation<DeepGet<StaticSchema<S>, P>>
	> {
		//@ts-expect-error more recursive types, ignore
		return super.root(path) as never;
	}

	public override has<P extends Paths<StaticSchema<S>>>(
		...paths: P[]
	): inPromise<D["async"], boolean> {
		return super.has(...paths);
	}

	public override conf<P extends Paths<StaticSchema<S>>>(
		path: P,
	): DeepGet<S, P> {
		return super.conf(path) as never;
	}

	//@ts-expect-error more recursive types, ignore
	public override toJSON(): inPromise<
		D["async"],
		StaticSchemaWithRelation<StaticSchema<S>>
	> {
		return super.toJSON() as never;
	}

	public save(): inPromise<D["async"], void> {
		return this.driver.set(null as any, this.driver.data) as any;
	}

	public getMany<P extends RelationPaths<S>>(
		path: P,
	): inPromise<D["async"], DeepGet<StaticSchema<S>, P> | undefined> {
		const schema = this.conf(path as any) as any;
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

	public getJoin<P extends RelationPaths<S>>(
		path: P,
	): inPromise<D["async"], FileFSConfigJS<any, any> | undefined> {
		const schema = this.conf(path as any) as any;
		const joinInfo = (schema as any)[CFS_JOIN_SYMBOL];

		if (!joinInfo) {
			throw new Error(`[ConfigFS] '${path}' is not a join-relation field.`);
		}

		const fkValue = this.get(joinInfo.fk as any) as unknown as string;

		if (!fkValue) {
			return undefined as any;
		}

		const relatedConfigFS = joinInfo.configFs;
		const fileInstance = relatedConfigFS.file(fkValue);

		if (this.driver.async) {
			return (fileInstance as Promise<FileFSConfigJS<any, any>>).then(
				async (instance) => {
					await instance.load();
					return instance;
				},
			) as any;
		}

		const loadedInstance = fileInstance as FileFSConfigJS<any, any>;
		loadedInstance.load();
		return loadedInstance as any;
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
		public driver: D,
		public schema: S,
		public config?: Partial<D["config"]> & {
			/**
			 * If true, all schema properties will be treated as optional during validation,
			 * except for those marked as `important: true`. This is useful for loading a
			 * partial configuration without triggering validation errors for missing values.
			 */
			only_importants?: boolean;
		},
	) {}

	public init(pathFn: (id: string) => string) {
		this.pathFn = pathFn;
	}

	private getPath(id: string): string {
		if (!this.pathFn) {
			throw new Error(
				"[ConfigFS] ConfigFS not initialized. Call init() first.",
			);
		}
		return this.pathFn(id);
	}

	public file(id: string): inPromise<D["async"], FileFSConfigJS<D, S>> {
		const filePath = this.getPath(id);
		const newDriver = new (this.driver.constructor as any)(
			this.driver.options,
		) as D;
		const fileInstance = new FileFSConfigJS(newDriver, this.schema, filePath);

		const loadResult = fileInstance.load(this.config);

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
			return fileInstance.then((i) => i.toJSON()) as any;
		} else {
			return fileInstance.toJSON() as any;
		}
	}
}
