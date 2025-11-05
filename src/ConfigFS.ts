import * as fs from "node:fs";
import { ConfigJS } from "./ConfigJS";
import type { ConfigJSDriver } from "./driver";
import { CFS_JOIN_SYMBOL, CFS_MANY_SYMBOL } from "./fs-factory";
import type {
	DeepGet,
	inPromise,
	Paths,
	RelationPaths,
	SchemaDefinition,
	StaticSchema,
	StaticSchemaWithRelation,
} from "./types";

/**
 * Represents a file-based configuration that extends the base ConfigJS class.
 * It is used to manage a single configuration file.
 * @template D The type of the driver.
 * @template S The type of the schema.
 */
//@ts-ignore more recursive types, ignore
export class FileFSConfigJS<
	D extends ConfigJSDriver<any, any, any>,
	S extends SchemaDefinition,
> extends ConfigJS<D, S> {
	/**
	 * Creates a new instance of FileFSConfigJS.
	 * @param driver The driver to use for loading and saving the configuration.
	 * @param schema The schema to use for validating the configuration.
	 * @param filePath The path to the configuration file.
	 */
	constructor(
		driver: D,
		schema: S,
		public readonly filePath: string,
	) {
		super(driver, schema);
	}

	/**
	 * Loads the configuration from the file.
	 * @param options The loading options.
	 */
	public override load(options?: D["config"] & { only_importants?: boolean }) {
		const loadOptions = { ...options, path: this.filePath };
		return super.load(loadOptions);
	}

	/**
	 * Sets a value in the configuration.
	 * @param path The path to the value.
	 * @param value The new value.
	 * @param options The options for setting the value.
	 */
	//@ts-ignore configfs change internal logic of configjs, ignore this
	public override set<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: StaticSchemaWithRelation<DeepGet<StaticSchema<S>, P>>,
		options?: { description?: string },
	): inPromise<D["async"], void> {
		return super.set(path, value as any, options);
	}

	/**
	 * Inserts a partial value into an object in the configuration.
	 * @param path The path to the object.
	 * @param partial The partial value to insert.
	 */
	//@ts-ignore configfs change internal logic of configjs, ignore this
	public override insert<P extends Paths<StaticSchema<S>>>(
		path: P,
		value: Partial<StaticSchemaWithRelation<DeepGet<StaticSchema<S>, P>>>,
	): inPromise<D["async"], void> {
		//@ts-ignore
		return super.insert(path, value as any);
	}

	/**
	 * Gets a value from the configuration.
	 * @param path The path to the value.
	 * @returns The value at the given path.
	 */
	//@ts-ignore configfs change internal logic of configjs, ignore this
	public override root<P extends Paths<StaticSchema<S>>>(
		path: P,
	): inPromise<
		D["async"],
		StaticSchemaWithRelation<DeepGet<StaticSchema<S>, P>>
	> {
		//@ts-ignore more recursive types, ignore
		return super.root(path) as never;
	}

	/**
	 * Checks if a value exists in the configuration.
	 * @param paths The paths to the values.
	 * @returns True if all values exist, false otherwise.
	 */
	public override has<P extends Paths<StaticSchema<S>>>(
		...paths: P[]
	): inPromise<D["async"], boolean> {
		return super.has(...paths);
	}

	/**
	 * Gets the schema for a given path.
	 * @param path The path to the schema.
	 * @returns The schema at the given path.
	 */
	public override conf<P extends Paths<StaticSchema<S>>>(
		path: P,
	): DeepGet<S, P> {
		return super.conf(path) as never;
	}

	/**
	 * Returns cached data
	 * @returns
	 */
	//@ts-ignore more recursive types, ignore
	public override toJSON(): inPromise<
		D["async"],
		StaticSchemaWithRelation<StaticSchema<S>>
	> {
		return super.toJSON() as never;
	}

	/**
	 * Saves the configuration to the file.
	 */
	public save(): inPromise<D["async"], void> {
		return this.driver.set(null as any, this.driver.data) as any;
	}

	/**
	 * Gets the related configurations for a many-to-many relation.
	 * @param path The path to the relation.
	 * @returns An array of related configurations.
	 */
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

	/**
	 * Gets the related configuration for a one-to-one relation.
	 * @param path The path to the relation.
	 * @returns The related configuration.
	 */
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

	/**
	 * Returns the file path of the configuration.
	 */
	public toString(): string {
		return this.filePath;
	}
}

/**
 * A class for managing multiple configuration files.
 * @template D The type of the driver.
 * @template S The type of the schema.
 */
export class ConfigFS<
	D extends ConfigJSDriver<any, any, any>,
	S extends SchemaDefinition,
> {
	private pathFn?: (id: string) => string;

	/**
	 * Creates a new instance of ConfigFS.
	 * @param driver The driver to use for loading and saving the configurations.
	 * @param schema The schema to use for validating the configurations.
	 * @param config The configuration options.
	 */
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

	/**
	 * Initializes the ConfigFS instance with a path function.
	 * @param pathFn A function that returns the file path for a given ID.
	 */
	public init(pathFn: (id: string) => string) {
		this.pathFn = pathFn;
	}

	/**
	 * Gets the file path for a given ID.
	 * @param id The ID of the configuration file.
	 * @returns The file path.
	 */
	private getPath(id: string): string {
		if (!this.pathFn) {
			throw new Error(
				"[ConfigFS] ConfigFS not initialized. Call init() first.",
			);
		}
		return this.pathFn(id);
	}

	/**
	 * Gets a file-based configuration for a given ID.
	 * @param id The ID of the configuration file.
	 * @returns A FileFSConfigJS instance.
	 */
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

	/**
	 * Deletes a configuration file.
	 * @param id The ID of the configuration file.
	 */
	public del(id: string): void {
		const filePath = this.getPath(id);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	}

	/**
	 * Copies a configuration file.
	 * @param fromId The ID of the source configuration file.
	 * @param toId The ID of the destination configuration file.
	 */
	public copy(fromId: string, toId: string): void {
		const fromPath = this.getPath(fromId);
		const toPath = this.getPath(toId);
		fs.copyFileSync(fromPath, toPath);
	}

	/**
	 * Gets the configuration data for a given ID.
	 * @param id The ID of the configuration file.
	 * @returns The configuration data.
	 */
	public toJSON(id: string): inPromise<D["async"], StaticSchema<S>> {
		const fileInstance = this.file(id);
		if (fileInstance instanceof Promise) {
			return fileInstance.then((i) => i.toJSON()) as any;
		} else {
			return fileInstance.toJSON() as any;
		}
	}
}
