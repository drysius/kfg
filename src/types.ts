import type {
	SchemaOptions,
	Static,
	TObject,
	TSchema,
	TUnsafe,
} from "@sinclair/typebox";
export type { TSchema, TObject, SchemaOptions };

import type { KfgDriver } from "./kfg-driver";
import { KfgFileFS } from "./kfg-fs";

// --- Driver Related Types ---

/**
 * Represents a path to a value in an object.
 * @template T The type of the object.
 */
export type Paths<T> = T extends object
	? {
			[K in keyof T]: K extends string
				? T[K] extends ReadonlyArray<any>
					? K
					: T[K] extends object
						? `${K}.${Paths<T[K]>}` | K
						: K
				: never;
		}[keyof T]
	: never;

/**
 * Represents a path to a value in an object.
 * @template T The type of the object.
 */
export type RootPaths<T> = T extends object
	? {
			[K in keyof T]: K extends string
				? T[K] extends ReadonlyArray<any>
					? K
					: T[K] extends object
						? K | `${K}.${RootPaths<T[K]>}`
						: never
				: never;
		}[keyof T]
	: never;

/**
 * Gets the type of a value at a given path in an object.
 * @template T The type of the object.
 * @template P The path to the value.
 */
export type DeepGet<T, P extends string> = P extends `${infer K}.${infer R}`
	? K extends keyof T
		? DeepGet<T[K], R>
		: never
	: P extends keyof T
		? T[P]
		: never;

/**
 * Represents a value that can be a promise or a plain value.
 * @template Async The type of the async flag.
 * @template Result The type of the result.
 */
export type inPromise<Async extends boolean, Result> = Async extends true
	? Promise<Result>
	: Result;

/**
 * Represents the configuration of a driver.
 */
export type DriverConfig = Record<string, unknown>;
/**
 * Represents the store of a driver.
 */
export type DriverStore = Record<string, unknown>;

/**
 * Represents the onLoad method of a driver.
 * @template C The type of the driver configuration.
 * @template S The type of the driver store.
 * @template A The type of the async flag.
 */
export type DriverOnLoad<
	C extends DriverConfig,
	S extends DriverStore,
	A extends boolean,
> = (
	this: KfgDriver<C, S, A>,
	schema: SchemaDefinition,
	opts: Partial<C>,
) => inPromise<A, any>;
/**
 * Represents the onSet method of a driver.
 * @template C The type of the driver configuration.
 * @template S The type of the driver store.
 * @template A The type of the async flag.
 */
export type DriverOnSet<
	C extends DriverConfig,
	S extends DriverStore,
	A extends boolean,
> = (
	this: KfgDriver<C, S, A>,
	key: string,
	value: unknown,
	options?: { description?: string },
) => inPromise<A, void>;

/**
 * Represents the onDel method of a driver.
 * @template C The type of the driver configuration.
 * @template S The type of the driver store.
 * @template A The type of the async flag.
 */
export type DriverOnDel<
	C extends DriverConfig,
	S extends DriverStore,
	A extends boolean,
> = (this: KfgDriver<C, S, A>, key: string) => inPromise<A, void>;

/**
 * Represents the options of a driver.
 * @template C The type of the driver configuration.
 * @template S The type of the driver store.
 * @template A The type of the async flag.
 */
export interface KfgDriverOptions<
	C extends DriverConfig,
	S extends DriverStore,
	A extends boolean,
> {
	identify: string;
	async: A;
	config: C;
	getEnvKeyForPath?: (path: string) => string;
	onLoad?: DriverOnLoad<C, S, A>;
	onSet?: DriverOnSet<C, S, A>;
	onDel?: DriverOnDel<C, S, A>;
}

// --- Schema Related Types ---

/**
 * Represents the static schema with relations.
 * @template S The type of the schema.
 */
export type StaticSchemaWithRelation<S> = S extends TSchema
	? StaticSchema<S>
	: {
			[K in keyof S]: S[K] extends KfgFileFS<any, any>
				? string
				: S[K] extends KfgFileFS<any, any>[]
					? string[]
					: StaticSchemaWithRelation<S[K]>;
		};

/**
 * Represents the paths to the relations in a schema.
 * @template S The type of the schema.
 */
export type RelationPaths<S extends SchemaDefinition> = S extends TSchema
	? never
	: {
			[K in keyof S]: S[K] extends
				| TUnsafe<KfgFileFS<any, any>>
				| TUnsafe<KfgFileFS<any, any>[]>
				? K
				: S[K] extends SchemaDefinition
					? `${K & string}.${RelationPaths<S[K]>}`
					: never;
		}[keyof S];

/**
 * A recursive type representing the user-friendly schema definition.
 */
export type SchemaDefinition =
	| TSchema // Qualquer schema TypeBox válido (string, number, array, etc.)
	| {
			[key: string]: SchemaDefinition;
	  };
/**
 * A mapped type que converte um SchemaDefinition em tipo estático TypeScript.
 * Agora com suporte a arrays do TypeBox.
 */
export type StaticSchema<T> =
	// Se for um array TypeBox, transforma no tipo do item[]
	T extends { type: "array"; items: infer I }
		? StaticSchema<I>[]
		: // Se for qualquer TSchema simples
			T extends TSchema
			? Static<T>
			: // Se for um objeto SchemaDefinition, aplica recursivamente
				T extends SchemaDefinition
				? { -readonly [K in keyof T]: StaticSchema<T[K]> }
				: never;

/**
 * Custom metadata properties that can be added to a schema.
 */
export interface CustomOptions<Default = any> {
	description?: string;
	default?: Default;
	important?: boolean;
	initial_save?: boolean;
	prop?: string;
	refines?: ((value: unknown) => boolean | string)[];
}
