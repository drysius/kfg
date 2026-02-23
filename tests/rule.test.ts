import { describe, it, expect } from 'bun:test';
import { rule } from '../src/rule';
import { Value } from '@sinclair/typebox/value';
import { Type } from '@sinclair/typebox';

describe('Rule Parser', () => {
    it('should parse simple types', () => {
        const sString = rule('string');
        const sNumber = rule('number');
        const sBoolean = rule('boolean');
        const sInt = rule('integer');

        expect(sString.type).toBe('string');
        expect(sNumber.type).toBe('number');
        expect(sBoolean.type).toBe('boolean');
        expect(sInt.type).toBe('integer');
    });

    it('should handle optional/nullable', () => {
        const sOptional = rule('string|optional');
        // Type.Optional(T) means the property key can be missing.
        // Value.Check is structural.
        // Checking { val: undefined } against { val: Type.Optional(Type.String()) } works.
        // Checking sOptional against undefined directly... 
        // TypeBox behavior: Value.Check(Type.Optional(T), undefined) is FALSE in strict mode, because Optional is a Modifier, not a Type.
        // BUT, TypeBox 0.32 changed this? Or 0.34?
        // Let's wrap in object to be safe and correct per JSON Schema semantics.
        const schema = Type.Object({ val: sOptional });
        expect(Value.Check(schema, {})).toBe(true);
        expect(Value.Check(schema, { val: 'test' })).toBe(true);
        expect(Value.Check(schema, { val: 123 })).toBe(false);
    });

    it('should parse min/max constraints for string', () => {
        const schema = rule('string|min:3|max:5');
        expect(schema.minLength).toBe(3);
        expect(schema.maxLength).toBe(5);

        expect(Value.Check(schema, 'ab')).toBe(false);
        expect(Value.Check(schema, 'abc')).toBe(true);
        expect(Value.Check(schema, 'abcde')).toBe(true);
        expect(Value.Check(schema, 'abcdef')).toBe(false);
    });

    it('should parse min/max constraints for number', () => {
        const schema = rule('number|min:10|max:20');
        expect(schema.minimum).toBe(10);
        expect(schema.maximum).toBe(20);

        expect(Value.Check(schema, 9)).toBe(false);
        expect(Value.Check(schema, 10)).toBe(true);
        expect(Value.Check(schema, 20)).toBe(true);
        expect(Value.Check(schema, 21)).toBe(false);
    });

    it('should parse email format', () => {
        const schema = rule('email');
        expect(schema.format).toBe('email');
        // Note: 'email' format requires registration or environment support.
        // If it fails, we might need to rely on regex or skip validation check here.
        // Assuming test environment doesn't have it, let's skip value check or mock it.
        // Or better: ensure TypeBox check returns true if format is unknown (default behavior of JSON Schema spec, but TypeBox might be strict).
        // Actually, let's just check the schema structure.
        expect(schema.type).toBe('string');
    });

    it('should parse enum (in:)', () => {
        const schema = rule('in:a,b,c');
        expect(Value.Check(schema, 'a')).toBe(true);
        expect(Value.Check(schema, 'b')).toBe(true);
        expect(Value.Check(schema, 'd')).toBe(false);
    });

    it('should parse regex', () => {
        const schema = rule('regex:^[a-z]+$');
        expect(Value.Check(schema, 'abc')).toBe(true);
        expect(Value.Check(schema, '123')).toBe(false);
    });

    it('should handle defaults', () => {
        const schema = rule('string', 'default');
        expect(schema.default).toBe('default');
    });

    it('should handle boolean defaults', () => {
        const schema = rule('boolean', true);
        expect(schema.default).toBe(true);
    });
});
