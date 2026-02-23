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
	const isSchemaOptional = (schema: TSchema): boolean => {
		return Value.Check(Type.Object({ temp: schema }), {});
	};

	const hasImportantRequirement = (node: any): boolean => {
		if (!node || typeof node !== "object") return false;

		if (node[Symbol.for("TypeBox.Kind")]) {
			const schemaNode = node as TSchema & { important?: boolean };
			if (schemaNode.important) return true;

			if (schemaNode.type === "object" && (schemaNode as any).properties) {
				return Object.values((schemaNode as any).properties).some((child) =>
					hasImportantRequirement(child),
				);
			}
			return false;
		}

		return Object.values(node).some((child) => hasImportantRequirement(child));
	};

	const makeTypeBoxOptional = (schema: TSchema): TSchema => {
		const schemaAny = schema as any;

		if (schemaAny.type === "object" && schemaAny.properties) {
			const nextProperties: Record<string, TSchema> = {};
			for (const propKey of Object.keys(schemaAny.properties)) {
				nextProperties[propKey] = makeTypeBoxOptional(schemaAny.properties[propKey]);
			}

			const clone: any = { ...schemaAny, properties: nextProperties };
			clone.required = Object.keys(nextProperties).filter(
				(propKey) => !isSchemaOptional(nextProperties[propKey]),
			);
			if (clone.required.length === 0) {
				delete clone.required;
			}

			const shouldKeepRequired =
				(clone as { important?: boolean }).important === true ||
				hasImportantRequirement(clone) ||
				isSchemaOptional(clone as TSchema);

			return shouldKeepRequired
				? (clone as TSchema)
				: Type.Optional(clone as TSchema);
		}

		const shouldKeepRequired =
			(schemaAny as { important?: boolean }).important === true ||
			hasImportantRequirement(schemaAny) ||
			isSchemaOptional(schema);

		return shouldKeepRequired ? schema : Type.Optional(schema);
	};

	const newDefinition: Record<string, any> = {};
	for (const key in definition) {
		const value = (definition as any)[key];
		if (value?.[Symbol.for("TypeBox.Kind")]) {
			newDefinition[key] = makeTypeBoxOptional(value as TSchema);
		} else if (typeof value === "object" && value !== null) {
			const next = makeSchemaOptional(value);
			newDefinition[key] = hasImportantRequirement(value)
				? next
				: Type.Optional(buildTypeBoxSchema(next as SchemaDefinition));
		} else {
			newDefinition[key] = value;
		}
	}
	return newDefinition;
}
