import type {
	SchemaOptions,
	Static,
	TObject,
	TSchema,
} from "@sinclair/typebox";

export type { TSchema, TObject, SchemaOptions };

/**
 * A recursive type representing the user-friendly schema definition.
 */
export type SchemaDefinition =
	| TSchema // Any valid TypeBox schema (string, number, array, etc.)
	| {
			[key: string]: SchemaDefinition;
	  };

/**
 * A mapped type that converts a SchemaDefinition into a static TypeScript type.
 */
export type StaticSchema<T> =
	// If it's a TypeBox array, transform to item[] type
	T extends { type: "array"; items: infer I }
		? StaticSchema<I>[]
		: // If it's any simple TSchema
			T extends TSchema
			? Static<T>
			: // If it's a SchemaDefinition object, apply recursively
				T extends SchemaDefinition
				? { -readonly [K in keyof T]: StaticSchema<T[K]> }
				: never;

/**
 * Represents a path to a value in an object.
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
 * Represents a path to a value in an object, supporting partial deep paths.
 * Used for inserting partial data.
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
 */
export type DeepGet<T, P extends string> = P extends `${infer K}.${infer R}`
	? K extends keyof T
		? DeepGet<T[K], R>
		: never
	: P extends keyof T
		? T[P]
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
	createms?: boolean;
}

/**
 * Helper type for async/sync return values.
 * Since we are moving to strict synchronous for now, this might just be Result.
 * But keeping it for potential compatibility if we re-introduce async drivers later.
 */
export type inPromise<Async extends boolean, Result> = Async extends true
    ? Promise<Result>
    : Result;
