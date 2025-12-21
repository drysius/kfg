import {
	type TObject,
	type TProperties,
	type TSchema,
	Type,
} from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { SchemaDefinition } from "../types";
/**
 * Adds smart defaults to a TypeBox schema.
 * @param schemaNode The schema to add the defaults to.
 */
export function addSmartDefaults(schemaNode: TObject): void {
	if (schemaNode.type !== "object" || !schemaNode.properties) {
		return;
	}
	let allChildrenOptional = true;
	for (const key in schemaNode.properties) {
		const prop = schemaNode.properties[key];

		// Ignore Unsafe schemas (used by cfs) as they are not standard TypeBox schemas
		if (prop[Symbol.for("TypeBox.Kind") as any] === "Unsafe") {
			continue;
		}

		// Only recurse if the property is a valid TypeBox object schema
		if (prop.type === "object" && prop[Symbol.for("TypeBox.Kind") as any]) {
			addSmartDefaults(prop as TObject);
		}
		const hasDefault = prop.default !== undefined;
		// Behavioral check for optionality
		const isOptional = Value.Check(Type.Object({ temp: prop }), {});
		if (!hasDefault && !isOptional) {
			allChildrenOptional = false;
		}
	}
	if (allChildrenOptional && schemaNode.default === undefined) {
		(schemaNode as any).default = {};
	}
}
/**
 * Builds a TypeBox schema from a schema definition.
 * @param definition The schema definition.
 * @returns The TypeBox schema.
 */
export function buildTypeBoxSchema(definition: SchemaDefinition): TObject {
	if (definition[Symbol.for("TypeBox.Kind") as any] === "Object") {
		return definition as TObject;
	}

	const properties: TProperties = {};
	for (const key in definition) {
		const value = definition[key] as any;

		const isObject =
			typeof value === "object" &&
			value !== null &&
			!value[Symbol.for("TypeBox.Kind")];
		if (isObject) {
			properties[key] = buildTypeBoxSchema(value);
		} else {
			properties[key] = value as TSchema;
		}
	}
	return Type.Object(properties, { additionalProperties: true });
}

/**
 * Builds a default object from a schema definition.
 * It converts the definition to a TypeBox schema, adds smart defaults,
 * and then generates the default value using TypeBox's Value.Default.
 * This ensures that nested defaults and priorities are handled correctly.
 * @param definition The schema definition.
 * @returns The default object.
 */
export function buildDefaultObject(
	definition: SchemaDefinition,
): Record<string, any> {
	const schema = buildTypeBoxSchema(definition);
	addSmartDefaults(schema);
	return Value.Default(schema, {}) as Record<string, any>;
}

/**
 * Makes a schema optional.
 * @param definition The schema definition.
 * @returns The optional schema.
 */
export function makeSchemaOptional(
	definition: SchemaDefinition,
): SchemaDefinition {
	const newDefinition: Record<string, any> = {};
	for (const key in definition) {
		const value = (definition as any)[key];
		if (value?.[Symbol.for("TypeBox.Kind")]) {
			const schema = value as TSchema & { important?: boolean };
			const isOptional = Value.Check(Type.Object({ temp: schema }), {});
			if (schema.important || isOptional) {
				newDefinition[key] = schema;
			} else {
				newDefinition[key] = Type.Optional(schema);
			}
		} else if (typeof value === "object" && value !== null) {
			newDefinition[key] = makeSchemaOptional(value);
		} else {
			newDefinition[key] = value;
		}
	}
	return newDefinition;
}
