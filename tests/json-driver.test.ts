import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import { jsonDriver } from '../src/drivers/json-driver';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigJS } from '../src/ConfigJS';
import { c } from '../src/factory';

const TEST_JSON_PATH = path.join(__dirname, 'config.test.json');

describe('JSON Driver Integration', () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_JSON_PATH)) fs.unlinkSync(TEST_JSON_PATH);
    });

    afterAll(() => {
        if (fs.existsSync(TEST_JSON_PATH)) fs.unlinkSync(TEST_JSON_PATH);
    });

    // Tests the basic workflow of loading data from a file, getting a value,
    // setting a new value, and verifying the persisted result.
    it('should load, get, and set nested data', () => {
        const initialData = { app: { name: 'TestApp' } };
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));

        const config = new ConfigJS(jsonDriver, {
            app: { name: c.string() },
            db: { host: c.string({default: 'none'}) }
        });

        config.load({ path: TEST_JSON_PATH });
        expect(config.get('app.name')).toBe('TestApp');

        config.set('db.host', 'localhost');
        expect(config.get('db.host')).toBe('localhost');

        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        expect(parsed.db.host).toBe('localhost');
        expect(parsed.app.name).toBe('TestApp');
    });

    // Verifies that the driver creates a new JSON file if one doesn't exist
    // when `set()` is called.
    it('should create a new file on set() if it does not exist', () => {
        const config = new ConfigJS(jsonDriver, { user: { name: c.string({default: ''}) } });
        config.load({ path: TEST_JSON_PATH }); // Load with empty config
        config.set('user.name', 'John');

        expect(fs.existsSync(TEST_JSON_PATH)).toBe(true);
        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        expect(parsed.user.name).toBe('John');
    });

    // Ensures that the driver gracefully handles a malformed or invalid JSON file
    // by falling back to the schema's default values.
    it('should apply defaults when the JSON file is invalid or malformed', () => {
        fs.writeFileSync(TEST_JSON_PATH, '{'); // Invalid JSON
        const config = new ConfigJS(jsonDriver, { app: { name: c.string({default: 'DefaultApp'}) } });
        config.load({ path: TEST_JSON_PATH });
        expect(config.get('app.name')).toBe('DefaultApp');
    });

    // Confirms that schema defaults are used when the target config file does not exist.
    it('should apply defaults when the config file does not exist', () => {
        const config = new ConfigJS(jsonDriver, { app: { name: c.string({default: 'abc'}) } });
        config.load({ path: TEST_JSON_PATH });
        expect(config.get('app.name')).toBe('abc');
    });

    // Tests the ability to correctly get and set values that are arrays.
    it('should correctly get and set array values', () => {
        const config = new ConfigJS(jsonDriver, { data: { items: c.array(c.any(), {default: []}) } });
        config.load({ path: TEST_JSON_PATH });
        const anArray = ['item1', 'item2', { nested: true }];
        config.set('data.items', anArray);

        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        expect(parsed.data.items).toEqual(anArray);

        expect(config.get('data.items')).toEqual(anArray);
    });

    // Verifies that setting a deeply nested property does not overwrite
    // other properties within the same parent object.
    it('should handle deeply nested properties on set', () => {
        const schema = {
            a: { b: { c: c.string({ default: 'c' }), d: c.number({ default: 1 }) } }
        };
        const config = new ConfigJS(jsonDriver, schema);
        config.load({ path: TEST_JSON_PATH });

        config.set('a.b.c', 'new-c');
        
        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);

        expect(config.get('a.b.c')).toBe('new-c');
        expect(config.get('a.b.d')).toBe(1);
        expect(parsed.a.b.c).toBe('new-c');
        expect(parsed.a.b.d).toBe(1);
    });

    // Checks that values are correctly coerced to their schema-defined types
    // during the loading process (e.g., a string in the file to a number).
    it('should coerce types from file during load', () => {
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify({ app: { port: "8080" } }));

        const schema = {
            app: { port: c.number() }
        };
        const config = new ConfigJS(jsonDriver, schema);
        config.load({ path: TEST_JSON_PATH });

        expect(config.get('app.port')).toBe(8080);
        expect(typeof config.get('app.port')).toBe('number');
    });

    // Tests the `insert` method to ensure it correctly merges a partial object
    // into an existing nested object.
    it('should correctly merge data with insert()', () => {
        const initialData = {
            app: { name: 'MyApp', server: { host: 'localhost' } }
        };
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));

        const schema = {
            app: {
                name: c.string(),
                server: {
                    host: c.string(),
                    port: c.number({ default: 3000 })
                }
            }
        };
        const config = new ConfigJS(jsonDriver, schema);
        config.load({ path: TEST_JSON_PATH });

        config.insert('app.server', { port: 8080 });

        const server = config.root('app.server');
        expect(server).toEqual({ host: 'localhost', port: 8080 });

        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        expect(parsed.app.server).toEqual({ host: 'localhost', port: 8080 });
    });

    // Ensures that an empty JSON file is handled gracefully, applying defaults
    // as if the file did not exist.
    it('should apply defaults when the JSON file is empty', () => {
        fs.writeFileSync(TEST_JSON_PATH, ''); // Empty file
        const config = new ConfigJS(jsonDriver, { app: { name: c.string({default: 'DefaultApp'}) } });
        config.load({ path: TEST_JSON_PATH });
        expect(config.get('app.name')).toBe('DefaultApp');
    });

    // Verifies the comment feature, ensuring that descriptions provided to `set()`
    // are saved as sibling properties with a `:comment` suffix and are preserved
    // across subsequent loads and saves.
    it('should save in nested format with comments when keyroot is false', () => {
        const schema = {
            app: {
                port: c.optional(c.number())
            }
        };
        const config = new ConfigJS(jsonDriver, schema);
        config.load({ path: TEST_JSON_PATH, keyroot: false });

        config.set('app.port', 8080, { description: 'The application port' });

        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);

        expect(parsed).toEqual({
            app: {
                port: 8080,
                'port:comment': 'The application port'
            }
        });

        // Test loading
        const config2 = new ConfigJS(jsonDriver, schema);
        config2.load({ path: TEST_JSON_PATH, keyroot: false });
        expect(config2.get('app.port')).toBe(8080);
        expect(config2.root('app')).toEqual({ port: 8080 }); // Ensure comment is not in config data
    });

    // Verifies that when `keyroot: true` is used, the JSON file is saved in a flattened
    // format and that comments are also flattened correctly.
    it('should save in flattened format with comments when keyroot is true', () => {
        const schema = {
            app: {
                port: c.optional(c.number()),
                host: c.string({ default: 'localhost' })
            }
        };
        const config = new ConfigJS(jsonDriver, schema);
        config.load({ path: TEST_JSON_PATH, keyroot: true });

        config.set('app.port', 8080, { description: 'The application port' });

        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);

        // Verify the flattened structure in the saved file
        expect(parsed).toEqual({
            'app.port': 8080,
            'app.port:comment': 'The application port',
            'app.host': 'localhost'
        });
        // Explicitly check that the nested 'app' object does not exist
        expect(parsed.app).toBeUndefined();

        // Test that loading the flattened file works correctly
        const config2 = new ConfigJS(jsonDriver, schema);
        config2.load({ path: TEST_JSON_PATH, keyroot: true });
        // Check that the values are correctly unflattened and accessible
        expect(config2.get('app.port')).toBe(8080);
        expect(config2.get('app.host')).toBe('localhost');
        // Ensure the root object is correctly reconstructed
        expect(config2.root('app')).toEqual({ port: 8080, host: 'localhost' });
    });

    // Checks that the `insert` method throws an error when attempting to merge
    // data into a path that resolves to a non-object value.
    it('should throw an error when inserting into a non-object', () => {
        const initialData = { app: { port: 3000 } };
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));
        const schema = { app: { port: c.number() } };
        const config = new ConfigJS(jsonDriver, schema);
        config.load({ path: TEST_JSON_PATH });

        expect(() => config.insert('app.port', { a: 1 } as any)).toThrow('Cannot insert into non-object at path: app.port');
    });

    // Confirms that `set` throws an error if it tries to create a property
    // on a path that is blocked by an existing non-object value.
    it('should throw an error when setting a sub-property of a non-object', () => {
        const initialData = { app: { port: 3000 } };
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));
        const schema = { app: { port: c.any() } };
        const config = new ConfigJS(jsonDriver, schema);
        config.load({ path: TEST_JSON_PATH });

        expect(() => config.set('app.port.host' as any, 'localhost')).toThrow('Cannot set property on non-object at path: port');
    });

    // Ensures that loading a file with data that does not match the schema's
    // type definition results in a validation error.
    it('should throw a validation error for type mismatch on load', () => {
        const initialData = { app: { port: 'not-a-number' } };
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));
        const schema = { app: { port: c.number() } };
        const config = new ConfigJS(jsonDriver, schema);
        
        expect(() => config.load({ path: TEST_JSON_PATH })).toThrow(/Validation failed/);
    });

    // Verifies that the object returned by `root()` contains only configuration
    // data and does not include any comment metadata.
    it('should not include comment properties in root() object', () => {
        const schema = { app: { port: c.optional(c.number()) } };
        const config = new ConfigJS(jsonDriver, schema);
        config.load({ path: TEST_JSON_PATH });

        config.set('app.port', 8080, { description: 'The application port' });

        const appObject = config.root('app');
        expect(appObject).toEqual({ port: 8080 });
    });
});
