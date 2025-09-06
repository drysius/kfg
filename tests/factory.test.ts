import { describe, it, expect } from 'bun:test';
import { c } from '../src/factory';
import { Kind } from '@sinclair/typebox';

describe('Factory: c', () => {
    it('should create a string schema with custom options using PascalCase', () => {
        const schema = c.String({ description: 'A test string', important: true });
        expect(schema.type).toBe('string');
        expect(schema.description).toBe('A test string');
        expect(schema.important).toBe(true);
    });

    it('should create a number schema using camelCase', () => {
        const schema = c.number();
        expect(schema.type).toBe('number');
    });

    it('should create a boolean schema using PascalCase', () => {
        const schema = c.Boolean();
        expect(schema.type).toBe('boolean');
    });

    it('should create an object schema using camelCase', () => {
        const schema = c.object({ id: c.Number() });
        expect(schema.type).toBe('object');
        expect(schema.properties.id.type).toBe('number');
    });

    it('should create an array schema', () => {
        const schema = c.Array(c.String());
        expect(schema.type).toBe('array');
        expect(schema.items.type).toBe('string');
    });

    it('should create a record schema', () => {
        const schema = c.Record(c.String(), c.Number());
        expect(schema.type).toBe('object');
        expect(schema.patternProperties['^(.*)$']).toBeDefined();
    });

    it('should handle Enum with string array', () => {
        const schema = c.Enum(['admin', 'user']);
        expect(schema.anyOf).toBeDefined();
        expect(schema.anyOf.length).toBe(2);
        expect(schema.anyOf[0].const).toBe('admin');
    });

    it('should handle Enum with TypeScript enum using camelCase', () => {
        enum UserRole { Admin = 'ADMIN', User = 'USER' };
        const schema = c.enum(UserRole);
        expect(schema.anyOf).toBeDefined();
        expect(schema.anyOf.length).toBe(2);
        expect(schema.anyOf[0].const).toBe('ADMIN');
        expect(schema.anyOf[1].const).toBe('USER');
    });

    it('should create a string schema with ipv4 format', () => {
        const schema = c.ip();
        expect(schema.type).toBe('string');
        expect(schema.format).toBe('ipv4');
    });

    it('should create a string schema with ipv6 format', () => {
        const schema = c.IPv6();
        expect(schema.type).toBe('string');
        expect(schema.format).toBe('ipv6');
    });

    it('should create a string schema with email format', () => {
        const schema = c.Email();
        expect(schema.type).toBe('string');
        expect(schema.format).toBe('email');
    });

    it('should create a string schema with uri format using camelCase', () => {
        const schema = c.url();
        expect(schema.type).toBe('string');
        expect(schema.format).toBe('uri');
    });

    it('should create an optional schema', () => {
        const schema = c.Optional(c.String());
        expect(schema[Symbol.for('TypeBox.Optional')]).toBe('Optional');
    });

    it('should attach refines functions to the schema', () => {
        const myRefine = (v: string) => v.length > 3;
        const schema = c.String({ refines: [myRefine] });
        expect(schema.refines).toBeDefined();
        expect(schema.refines![0]).toBe(myRefine);
    });
});
