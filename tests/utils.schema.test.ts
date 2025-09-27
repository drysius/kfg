import { describe, it, expect } from 'bun:test';
import { addSmartDefaults, buildTypeBoxSchema, makeSchemaOptional } from '../src/utils/schema';
import { c } from '../src/factory';
import { Type, type TObject } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

describe('Utils: schema.ts', () => {
    describe('buildTypeBoxSchema()', () => {
        // Verifies that a ConfigJS schema definition is correctly converted into a valid TypeBox TObject.
        it('should build a valid TObject from a schema definition', () => {
            const definition = {
                app: {
                    port: c.number({ default: 3000 })
                },
                host: c.string()
            };
            const schema = buildTypeBoxSchema(definition);
            expect(schema.type).toBe('object');
            expect(schema.properties.host.type).toBe('string');
            expect(schema.properties.app.type).toBe('object');
            const appSchema = schema.properties.app as TObject;
            expect(appSchema.properties.port.type).toBe('number');
        });
    });

    describe('addSmartDefaults()', () => {
        // Tests that a default value of `{}` is added to a nested object if all of its
        // own properties are either optional or have default values.
        it('should add a default object to a node whose children are all optional or have defaults', () => {
            const schema = buildTypeBoxSchema({
                db: {
                    host: c.string({ default: 'localhost' }),
                    port: c.optional(c.number())
                }
            });
            addSmartDefaults(schema);
            const dbSchema = schema.properties.db as TObject;
            const checkSchema = Type.Object({ db: dbSchema });
            const data = {};
            Value.Default(checkSchema, data);
            expect(data).toEqual({ db: { host: 'localhost' } });
        });

        // Ensures a default object is NOT added if at least one child property is
        // required and does not have a default value.
        it('should not add a default object if one child is required without a default', () => {
            const schema = buildTypeBoxSchema({
                db: {
                    host: c.string(),
                    port: c.optional(c.number())
                }
            });
            addSmartDefaults(schema);
            const dbSchema = schema.properties.db as TObject;
            expect(dbSchema.default).toBeUndefined();
        });
    });

    describe('makeSchemaOptional()', () => {
        // Verifies that the function correctly transforms all properties in a schema
        // definition to be optional.
        it('should make all properties in a definition optional', () => {
            const definition = {
                host: c.string(),
                port: c.number()
            };
            const optionalDefinition = makeSchemaOptional(definition);
            const schema = buildTypeBoxSchema(optionalDefinition);
            expect(Value.Check(schema, {})).toBe(true);
            expect(Value.Check(schema, { host: 'a', port: 1 })).toBe(true);
        });

        // Ensures that properties marked as `important: true` are NOT made optional.
        it('should not make important properties optional', () => {
            const definition = {
                host: c.string(),
                port: c.number({ important: true })
            };
            const optionalDefinition = makeSchemaOptional(definition);
            const schema = buildTypeBoxSchema(optionalDefinition);
            expect(Value.Check(schema, {})).toBe(false);
            expect(Value.Check(schema, { port: 123 })).toBe(true);
        });

        // Tests that the function correctly handles nested objects, making properties
        // inside them optional while respecting the `important` flag.
        it('should handle nested objects', () => {
            const definition = {
                app: { host: c.string() },
                db: { port: c.number({ important: true }) }
            };
            const optionalDefinition = makeSchemaOptional(definition);
            const schema = buildTypeBoxSchema(optionalDefinition);
            // app is required, but its content (host) is optional. db is required.
            expect(Value.Check(schema, { db: { port: 123 } })).toBe(false); // missing app
            expect(Value.Check(schema, { app: {}, db: { port: 123 } })).toBe(true);
        });
    });
});
