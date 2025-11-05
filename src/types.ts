import type {
	SchemaOptions,
	Static,
	TObject,
	TSchema,
} from "@sinclair/typebox";
export type { TSchema, TObject, SchemaOptions };

import type { ConfigJSDriver } from "./driver";

// --- Driver Related Types ---

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

export type DeepGet<T, P extends string> = P extends `${infer K}.${infer R}`
	? K extends keyof T
		? DeepGet<T[K], R>
		: never
	: P extends keyof T
		? T[P]
		: never;

export type inPromise<Async extends boolean, Result> = Async extends true
	? Promise<Result>
	: Result;

export type DriverConfig = Record<string, unknown>;
export type DriverStore = Record<string, unknown>;

export type DriverOnLoad<
	C extends DriverConfig,
	S extends DriverStore,
	A extends boolean,
> = (
	this: ConfigJSDriver<C, S, A>,
	schema: SchemaDefinition,
	opts: Partial<C>,
) => inPromise<A, any>;
export type DriverOnSet<
	C extends DriverConfig,
	S extends DriverStore,
	A extends boolean,
> = (
	this: ConfigJSDriver<C, S, A>,
	key: string,
	value: unknown,
	options?: { description?: string },
) => inPromise<A, void>;

export type DriverOnDel<
	C extends DriverConfig,
	S extends DriverStore,
	A extends boolean,
> = (this: ConfigJSDriver<C, S, A>, key: string) => inPromise<A, void>;

export interface ConfigJSDriverOptions<
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
