import type {
	SchemaOptions,
	Static,
	TObject,
	TSchema,
} from "@sinclair/typebox";
export type { TSchema, TObject, SchemaOptions };

import type { Model } from "./model";

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
export type DriverConfig = Record<any, any>;

/**
 * The interface for a Functional Driver instance.
 * @template A Async flag
 */
export interface Driver<A extends boolean> {
	name: string;
	async: A;
	model?: boolean;

	load(schema: SchemaDefinition, opts?: any): inPromise<A, any>;
	get(key?: string): inPromise<A, any>;
	set(
		key: string,
		value: any,
		options?: { description?: string; data?: any },
	): inPromise<A, void>;
	has(...keys: string[]): inPromise<A, boolean>;
	del(key: string, options?: { data?: any }): inPromise<A, void>;
	inject(data: any): inPromise<A, void>;

	/** Called before operations like get, set, del, etc. */
	onRequest?(): inPromise<A, void>;
	/** Called when the driver is no longer needed or updated. */
	unmount?(): void;

	// Optional Model methods
	find?(schema: SchemaDefinition, opts: any): any;
	findBy?(schema: SchemaDefinition, opts: any): any;
	create?(schema: SchemaDefinition, data: any): any;
	update?(schema: SchemaDefinition, id: any, data: any): any;
	delete?(schema: SchemaDefinition, id: any): any;
}

/**
 * Factory function type to create a driver.
 */
export type DriverFactory<C extends DriverConfig, A extends boolean> = (
	config: Partial<C>,
) => Driver<A>;

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
	model?: Model<any>;
	createms?: boolean;
}
