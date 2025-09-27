import { describe, it, expect } from 'bun:test';
import { flattenObject, unflattenObject, getProperty, setProperty, deepMerge, isObject } from '../src/utils/object';

describe('Utils: object.ts', () => {
    describe('getProperty()', () => {
        const obj = { a: { b: { c: 1 } }, d: 2 };
        // Tests retrieving a deeply nested property using dot notation.
        it('should get a nested property', () => {
            expect(getProperty(obj, 'a.b.c')).toBe(1);
        });
        // Tests retrieving a property at the top level of the object.
        it('should get a top-level property', () => {
            expect(getProperty(obj, 'd')).toBe(2);
        });
        // Verifies that `undefined` is returned for paths that do not exist.
        it('should return undefined for non-existent path', () => {
            expect(getProperty(obj, 'a.x.y')).toBeUndefined();
        });
    });

    describe('setProperty()', () => {
        // Verifies that a value can be set on a deeply nested property.
        it('should set a nested property', () => {
            const obj = { a: { b: { c: 1 } } };
            setProperty(obj, 'a.b.c', 2);
            expect(obj.a.b.c).toBe(2);
        });
        // Ensures that the function creates the necessary nested objects if the path doesn't exist.
        it('should create nested objects if they dont exist', () => {
            const obj = {};
            setProperty(obj, 'a.b.c', 1);
            expect((obj as any).a.b.c).toBe(1);
        });
    });

    describe('isObject()', () => {
        // Confirms that plain objects are correctly identified.
        it('should return true for objects', () => {
            expect(isObject({})).toBe(true);
            expect(isObject({ a: 1 })).toBe(true);
        });
        // Confirms that arrays, null, and primitives are not identified as objects.
        it('should return false for non-objects', () => {
            expect(isObject(null)).toBe(false);
            expect(isObject(undefined)).toBe(false);
            expect(isObject([])).toBe(false);
            expect(isObject('a')).toBe(false);
            expect(isObject(1)).toBe(false);
        });
    });

    describe('deepMerge()', () => {
        // Tests the recursive merging of two objects.
        it('should merge two objects', () => {
            const target = { a: 1, b: { c: 2 } };
            const source = { b: { d: 3 }, e: 4 };
            const result = deepMerge(target, source);
            expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
        });
        // Ensures that properties from the source object overwrite those in the target.
        it('should overwrite target properties with source properties', () => {
            const target = { a: 1 };
            const source = { a: 2 };
            expect(deepMerge(target, source).a).toBe(2);
        });
    });

    describe('flattenObject()', () => {
        // Verifies that a nested object is correctly converted to a single-level object with dot-notation keys.
        it('should flatten a nested object', () => {
            const obj = { a: { b: { c: 1 } }, d: 2 };
            const flat = flattenObject(obj);
            expect(flat).toEqual({ 'a.b.c': 1, d: 2 });
        });
        // Checks that an empty object remains empty after flattening.
        it('should handle empty objects', () => {
            expect(flattenObject({})).toEqual({});
        });
        // Ensures that an object that is already flat is returned unchanged.
        it('should handle already flat objects', () => {
            const obj = { a: 1, b: 2 };
            expect(flattenObject(obj)).toEqual(obj);
        });
    });

    describe('unflattenObject()', () => {
        // Tests that an object with dot-notation keys is correctly converted back into a nested structure.
        it('should unflatten a flat object', () => {
            const flat = { 'a.b.c': 1, d: 2 };
            const obj = unflattenObject(flat);
            expect(obj).toEqual({ a: { b: { c: 1 } }, d: 2 });
        });
        // Checks that an empty object remains empty after unflattening.
        it('should handle empty objects', () => {
            expect(unflattenObject({})).toEqual({});
        });
        // Ensures that an object that is already nested is returned unchanged.
        it('should handle already nested objects', () => {
            const obj = { a: { b: 1 } };
            expect(unflattenObject(obj)).toEqual(obj);
        });
    });
});