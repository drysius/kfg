import {
	type ArrayOptions,
	type NumberOptions,
	type ObjectOptions,
	type SchemaOptions,
	type StringOptions,
	type TLiteral,
	type TProperties,
	type TSchema,
	type TUnion,
	Type,
} from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { rule } from "./rule";
import type { CustomOptions, SchemaDefinition } from "./types";
import { addSmartDefaults, buildTypeBoxSchema } from "./utils/schema";

// Helper function to extract values from string arrays, const arrays, or enums
function getEnumValues<T extends readonly (string | number)[] | object>(
	values: T,
): (string | number)[] {
	if (Array.isArray(values)) {
		return values as (string | number)[];
	}
	// For enums, filter out numeric keys if it's a numeric enum
	const isNumericEnum = Object.values(values).some(
		(v) => typeof v === "number",
	);
	if (isNumericEnum) {
		return Object.values(values).filter(
			(v) => typeof v === "number",
		) as number[];
	}
	return Object.values(values).filter((v) => typeof v === "string") as string[];
}

const _c = {
	/** Creates a String schema. */
	String: <TDefault extends string>(
		options?: StringOptions & CustomOptions<TDefault>,
	) => Type.String(options),

	/** Creates a Number schema. */
	Number: <TDefault extends number>(
		options?: NumberOptions & CustomOptions<TDefault>,
	) => Type.Number(options),

	/** Creates a Boolean schema. */
	Boolean: <TDefault extends boolean>(
		options?: Omit<SchemaOptions, "default"> & CustomOptions<TDefault>,
	) => Type.Boolean(options),

	/** Creates an Object schema. */
	Object: <
		Properties extends TProperties,
		TDefault extends Record<string, any>,
	>(
		properties: Properties,
		options?: ObjectOptions & CustomOptions<TDefault>,
	) => Type.Object(properties, options),

	/** Creates an Array schema. */
	Array: <Schema extends TSchema, TDefault extends any[]>(
		items: Schema,
		options?: ArrayOptions & CustomOptions<TDefault>,
	) => Type.Array(items, options),

	/** Creates a Record schema. */
	Record: <
		K extends TSchema,
		V extends TSchema,
		TDefault extends Record<string, any>,
	>(
		key: K,
		value: V,
		options?: Omit<SchemaOptions, "default"> & CustomOptions<TDefault>,
	) => Type.Record(key, value, options),

	/** Creates a Union of Literals from a string array, const array, or a TypeScript enum. */
	Enum: <
		T extends readonly (string | number)[] | object,
		TValues = T extends readonly (infer U)[]
			? U
			: T extends object
				? T[keyof T]
				: never,
	>(
		values: T,
		options?: CustomOptions<TValues> & Omit<SchemaOptions, "default">,
		//@ts-expect-error ignore
	): TUnion<TLiteral<TValues>[]> => {
		const enumValues = getEnumValues(values);
		return Type.Union(
			enumValues.map((v) => Type.Literal(v)),
			options,
			//@ts-expect-error ignore
		) as TUnion<TLiteral<TValues>[]>;
	},

	/** Creates a string schema with 'ipv4' format. */
	IP: <TDefault extends string>(
		options?: StringOptions & CustomOptions<TDefault>,
	) => Type.String({ ...options, format: "ipv4" }),

	/** Creates a string schema with 'ipv6' format. */
	IPv6: <TDefault extends string>(
		options?: StringOptions & CustomOptions<TDefault>,
	) => Type.String({ ...options, format: "ipv6" }),

	/** Creates a string schema with 'email' format. */
	Email: <TDefault extends string>(
		options?: StringOptions & CustomOptions<TDefault>,
	) => Type.String({ ...options, format: "email" }),

	/** Creates a string schema with 'uri' format. */
	URL: <TDefault extends string>(
		options?: StringOptions & CustomOptions<TDefault>,
	) => Type.String({ ...options, format: "uri" }),

	/** Creates an Any schema. */
	Any: () => Type.Any(),

	/** Creates an Optional schema. */
	Optional: <Schema extends TSchema>(schema: Schema) => Type.Optional(schema),

	/** Creates a Number schema that defaults to a random value if not provided. */
	Random: (options?: NumberOptions & { max?: number }) => {
		const { max = 100, ...rest } = options || {};
		return Type.Number({
			...rest,
			[Symbol.for("isRandom")]: true,
			max,
		});
	},

	/** Creates a Model relation schema. */
	Model: (
		model: any,
		resolver?: (instance: any) => any,
		options?: CustomOptions<any>,
	) => {
		return Type.Any({
			...options,
			model,
			resolver,
		});
	},

	/** Creates a number schema that defaults to current timestamp in ms. */
	createms: (options?: NumberOptions & CustomOptions<number>) => {
		return Type.Number({
			...options,
			createms: true,
			default: Date.now(),
		});
	},

	/**
	 * Creates a schema based on a Laravel-like rule string.
	 * @param rules The rule string (e.g., 'required|string|min:3').
	 * @param defaultValue The default value.
	 */
	rule: rule,

	/**
	 * Validates data against a schema definition.
	 * @param schema The schema definition.
	 * @param data The data to validate.
	 * @returns The validated and coerced data.
	 */
	validate: (schema: SchemaDefinition, data: any): any => {
		const compiledSchema = buildTypeBoxSchema(schema);
		addSmartDefaults(compiledSchema);
		const configWithDefaults = Value.Default(compiledSchema, data) as any;
		Value.Convert(compiledSchema, configWithDefaults);

		if (!Value.Check(compiledSchema, configWithDefaults)) {
			const errors = [...Value.Errors(compiledSchema, configWithDefaults)];
			throw new Error(
				`Validation failed:\n${errors
					.map((e) => `- ${e.path}: ${e.message}`)
					.join("\n")}`,
			);
		}
		return configWithDefaults;
	},
};

/**
 * A helper object for creating schema definitions with custom metadata.
 * Includes both PascalCase and camelCase versions of helpers.
 */
export const c = {
	..._c,
	string: _c.String,
	number: _c.Number,
	boolean: _c.Boolean,
	object: _c.Object,
	array: _c.Array,
	record: _c.Record,
	enum: _c.Enum,
	ip: _c.IP,
	ipv6: _c.IPv6,
	email: _c.Email,
	url: _c.URL,
	any: _c.Any,
	optional: _c.Optional,
	random: _c.Random,
	model: _c.Model,
	createms: _c.createms,
	rule: _c.rule,
	validate: _c.validate,
};
export const k = c;
export const m = c;
