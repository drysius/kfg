import { Type, type TObject, type TProperties, type TSchema, TOptional } from '@sinclair/typebox';
import type { SchemaDefinition } from '../types';

/**
 * Recursively traverses a compiled TypeBox schema object and adds a `{ default: {} }`
 * to any object node whose children are all optional or have default values.
 * This function modifies the schema object in-place.
 * @param schemaNode The current node of the compiled schema to process.
 */
export function addSmartDefaults(schemaNode: TObject): void {
    if (schemaNode.type !== 'object' || !schemaNode.properties) {
        return;
    }

    let allChildrenOptional = true;
    for (const key in schemaNode.properties) {
        const prop = schemaNode.properties[key];

        // Recurse first
        if (prop.type === 'object') {
            addSmartDefaults(prop as TObject);
        }

        // Check if the property has a default or is optional
        const hasDefault = prop.default !== undefined;
        const isOptional = (prop as TOptional<TSchema>).modifier === 'Optional';

        // If the property is required (not optional) and has no default, then the parent can't get a default.
        if (!hasDefault && !isOptional) {
            allChildrenOptional = false;
        }
    }

    // If all children were optional and this object doesn't already have a default, add one.
    if (allChildrenOptional && schemaNode.default === undefined) {
        (schemaNode as any).default = {};
    }
}


export function buildTypeBoxSchema(definition: SchemaDefinition): TObject {
    const properties: TProperties = {};
    for (const key in definition) {
        const value = definition[key] as any;
        const isObject = typeof value === 'object' && value !== null && !value[Symbol.for('TypeBox.Kind')];

        if (isObject) {
            properties[key] = buildTypeBoxSchema(value);
        } else {
            properties[key] = value as TSchema;
        }
    }
    return Type.Object(properties);
}

export function buildDefaultObject(definition: SchemaDefinition): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const key in definition) {
        const value = definition[key] as any;
        if (value[Symbol.for('TypeBox.Kind')]) {
            if (value.default !== undefined) {
                obj[key] = value.default;
            }
        } else if (typeof value === 'object' && value !== null) {
            obj[key] = buildDefaultObject(value);
        }
    }
    return obj;
}