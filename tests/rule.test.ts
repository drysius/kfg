import { describe, it, expect } from "bun:test";
import { c } from "../src/factory";

describe("Factory Rule Parser", () => {
    it("should parse string rules correctly", () => {
        const schema = c.rule("required|string|min:3|max:10", "default");
        expect(schema.type).toBe("string");
        expect(schema.minLength).toBe(3);
        expect(schema.maxLength).toBe(10);
        expect(schema.default).toBe("default");
    });

    it("should parse number rules correctly", () => {
        const schema = c.rule("required|number|min:10|max:100", 50);
        expect(schema.type).toBe("number");
        expect(schema.minimum).toBe(10);
        expect(schema.maximum).toBe(100);
        expect(schema.default).toBe(50);
    });

    it("should parse boolean rules correctly", () => {
        const schema = c.rule("boolean", false);
        expect(schema.type).toBe("boolean");
        expect(schema.default).toBe(false);
    });

    it("should handle enum (in:...) rules", () => {
        const schema = c.rule("required|in:a,b,c", "a");
        expect(schema.anyOf).toHaveLength(3);
        expect(schema.default).toBe("a");
    });

    it("should handle optional flag", () => {
        const schema = c.rule("optional|string");
        // TypeBox optional wraps in a Symbol
        // We can check if it validates undefined without error if we were using validate
        // But structurally, it's an Optional schema.
        // TypeBox internals are a bit opaque, but we can check usage.
        expect(c.validate({ val: schema }, {})).toEqual({});
    });

    it("should handle email format", () => {
        const schema = c.rule("string|email");
        expect(schema.format).toBe("email");
    });
});

describe("Factory Validate", () => {
    it("should validate valid data", () => {
        const schema = {
            name: c.string(),
            age: c.number()
        };
        const data = { name: "John", age: 30 };
        const result = c.validate(schema, data);
        expect(result).toEqual(data);
    });

    it("should apply defaults", () => {
        const schema = {
            role: c.string({ default: "user" })
        };
        const result = c.validate(schema, {});
        expect(result.role).toBe("user");
    });

    it("should throw on invalid data", () => {
        const schema = {
            age: c.number()
        };
        expect(() => c.validate(schema, { age: "not a number" })).toThrow();
    });
});
