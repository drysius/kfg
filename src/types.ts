import type {
	SchemaOptions,
	Static,
	TAny,
	TObject,
	TSchema,
} from "@sinclair/typebox";
import type { Kfg } from "./kfg";
import type { KfgDriver } from "./kfg-driver";
export type { TSchema, TObject, SchemaOptions };

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
 * The interface for a Driver definition.
 */
export interface Driver<
	AsyncDriver extends boolean,
	Config extends DriverConfig = {},
> {
	identify: string;
	async: AsyncDriver;
	config?: Partial<Config>;
	onMount?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		opts?: any,
	) => inPromise<AsyncDriver, any>;
	onUnmount?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
	) => void;
	onRequest?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		opts: any,
	) => inPromise<AsyncDriver, void>;
	onGet?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		opts: any,
	) => inPromise<AsyncDriver, any>;
	onUpdate?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		opts: any,
	) => inPromise<AsyncDriver, void>;
	onDelete?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		opts: any,
	) => inPromise<AsyncDriver, void>;
	onMerge?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		opts: any,
	) => inPromise<AsyncDriver, void>;
	onHas?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		opts: any,
	) => inPromise<AsyncDriver, boolean>;
	onInject?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		opts: any,
	) => inPromise<AsyncDriver, void>;
	onToJSON?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
	) => inPromise<AsyncDriver, any>;
	save?: (
		kfg: Kfg<KfgDriver<Config, AsyncDriver>, Record<string, TAny>>,
		data?: any,
	) => inPromise<AsyncDriver, void>;
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
	createms?: boolean;
}
