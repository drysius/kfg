import {
	type TObject,
	type TProperties,
	type TSchema,
	Type,
} from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { SchemaDefinition } from "../types";

export function addSmartDefaults(schemaNode: TObject): void {
	if (schemaNode.type !== "object" || !schemaNode.properties) {
		return;
	}
	let allChildrenOptional = true;
	for (const key in schemaNode.properties) {
		const prop = schemaNode.properties[key];
		if (prop.type === "object") {
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

export function buildTypeBoxSchema(definition: SchemaDefinition): TObject {
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

export function buildDefaultObject(
	definition: SchemaDefinition,
): Record<string, any> {
	const obj: Record<string, any> = {};
	for (const key in definition) {
		const value = definition[key] as any;
		if (value[Symbol.for("TypeBox.Kind")]) {
			if (value.default !== undefined) {
				obj[key] = value.default;
			}
		} else if (typeof value === "object" && value !== null) {
			obj[key] = buildDefaultObject(value);
		}
	}
	return obj;
}

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
