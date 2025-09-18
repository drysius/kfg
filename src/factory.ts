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
import type { CustomOptions } from "./types";

// Helper function to filter numeric keys from string enums
function getEnumValues(enumType: object): string[] {
	return Object.values(enumType).filter((value) => typeof value === "string");
}

const _c = {
	/** Creates a String schema. */
	String: (options?: StringOptions & CustomOptions) => Type.String(options),

	/** Creates a Number schema. */
	Number: (options?: NumberOptions & CustomOptions) => Type.Number(options),

	/** Creates a Boolean schema. */
	Boolean: (options?: SchemaOptions & CustomOptions) => Type.Boolean(options),

	/** Creates an Object schema. */
	Object: (properties: TProperties, options?: ObjectOptions & CustomOptions) =>
		Type.Object(properties, options),

	/** Creates an Array schema. */
	Array: <Schema extends TSchema>(
		items: Schema,
		options?: ArrayOptions & CustomOptions,
	) => Type.Array(items, options),

	/** Creates a Record schema. */
	Record: <K extends TSchema, V extends TSchema>(
		key: K,
		value: V,
		options?: SchemaOptions & CustomOptions,
	) => Type.Record(key, value, options),

	/** Creates a Union of Literals from a string array or a TypeScript string enum. */
	Enum: <T extends string[] | object>(
		values: T,
		options?: CustomOptions,
	): TUnion<TLiteral<string>[]> => {
		const enumValues = Array.isArray(values)
			? values
			: getEnumValues(values as object);
		return Type.Union(enumValues.map((v) => Type.Literal(v)), options);
	},

	/** Creates a string schema with 'ipv4' format. */
	IP: (options?: StringOptions & CustomOptions) =>
		Type.String({ ...options, format: "ipv4" }),

	/** Creates a string schema with 'ipv6' format. */
	IPv6: (options?: StringOptions & CustomOptions) =>
		Type.String({ ...options, format: "ipv6" }),

	/** Creates a string schema with 'email' format. */
	Email: (options?: StringOptions & CustomOptions) =>
		Type.String({ ...options, format: "email" }),

	/** Creates a string schema with 'uri' format. */
	URL: (options?: StringOptions & CustomOptions) =>
		Type.String({ ...options, format: "uri" }),

	/** Creates an Optional schema. */
	Optional: <Schema extends TSchema>(schema: Schema) => Type.Optional(schema),
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
	optional: _c.Optional,
};
