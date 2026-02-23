import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import { JsonDriver } from '../src/drivers/json-driver';
import * as fs from 'fs';
import * as path from 'path';
import { Kfg } from '../src/kfg';
import { c } from '../src/factory';

const TEST_JSON_PATH = path.join(__dirname, 'config.test.json');

describe('JSON Driver Integration', () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_JSON_PATH)) fs.unlinkSync(TEST_JSON_PATH);
    });

    afterAll(() => {
        if (fs.existsSync(TEST_JSON_PATH)) fs.unlinkSync(TEST_JSON_PATH);
    });

    it('should load, get, and set nested data', () => {
        const initialData = { app: { name: 'TestApp' } };
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));

        const config = new Kfg(new JsonDriver({ path: 'config.test.json' }), {
            app: { name: c.string() },
            db: { host: c.string({default: 'none'}) }
        });

        // Need to override getFilePath logic implicitly via constructor or rely on path.resolve logic
        // JsonDriver logic: path.resolve(process.cwd(), config.path || "config.json")
        // The test is in tests/ directory, process.cwd() is project root? 
        // We need to make sure the driver points to TEST_JSON_PATH.
        // TEST_JSON_PATH is absolute. JsonDriver resolves relative paths.
        // If we pass an absolute path to JsonDriver config, path.resolve should handle it (on Windows/Unix mostly).
        // Let's verify JsonDriver implementation of getFilePath: path.resolve(process.cwd(), this.config.path || "config.json");
        // If this.config.path is absolute, path.resolve returns it.
        
        // Wait, I passed 'config.test.json' above. That resolves relative to CWD.
        // TEST_JSON_PATH is constructed with __dirname.
        // I should use the relative path or absolute path.
        
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const kfg = new Kfg(driver, {
            app: { name: c.string() },
            db: { host: c.string({default: 'none'}) }
        });

        kfg.load();
        expect(kfg.get('app.name')).toBe('TestApp');

        kfg.set('db.host', 'localhost');
        expect(kfg.get('db.host')).toBe('localhost');

        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        expect(parsed.db.host).toBe('localhost');
        expect(parsed.app.name).toBe('TestApp');
    });

    it('should create a new file on set() if it does not exist', () => {
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, { user: { name: c.string({default: ''}) } });
        config.load(); 
        config.set('user.name', 'John');

        expect(fs.existsSync(TEST_JSON_PATH)).toBe(true);
        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        expect(parsed.user.name).toBe('John');
    });

    it('should apply defaults when the JSON file is invalid or malformed', () => {
        fs.writeFileSync(TEST_JSON_PATH, '{'); // Invalid JSON
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, { app: { name: c.string({default: 'DefaultApp'}) } });
        config.load();
        expect(config.get('app.name')).toBe('DefaultApp');
    });

    it('should apply defaults when the config file does not exist', () => {
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, { app: { name: c.string({default: 'abc'}) } });
        config.load();
        expect(config.get('app.name')).toBe('abc');
    });

    it('should correctly get and set array values', () => {
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, { data: { items: c.array(c.any(), {default: []}) } });
        config.load();
        const anArray = ['item1', 'item2', { nested: true }];
        config.set('data.items', anArray);

        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        expect(parsed.data.items).toEqual(anArray);

        expect(config.get('data.items')).toEqual(anArray);
    });

    it('should handle deeply nested properties on set', () => {
        const initialData = { a: { b: { c: 'c', d: 1 } } }; // Should match schema structure
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));

        const schema = {
            a: { b: { c: c.string({ default: 'c' }), d: c.number({ default: 1 }) } }
        };
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, schema);
        config.load();

        config.set('a.b.c', 'new-c');
        
        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);

        expect(config.get('a.b.c')).toBe('new-c');
        expect(config.get('a.b.d')).toBe(1);
        expect(parsed.a.b.c).toBe('new-c');
        expect(parsed.a.b.d).toBe(1);
    });

    it('should coerce types from file during load', () => {
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify({ app: { port: "8080" } }));

        const schema = {
            app: { port: c.number() }
        };
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, schema);
        config.load();

        expect(config.get('app.port')).toBe(8080);
        expect(typeof config.get('app.port')).toBe('number');
    });

    it('should apply defaults when the JSON file is empty', () => {
        fs.writeFileSync(TEST_JSON_PATH, ''); // Empty file
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, { app: { name: c.string({default: 'DefaultApp'}) } });
        config.load();
        expect(config.get('app.name')).toBe('DefaultApp');
    });

    it('should save in nested format with comments when keyroot is false', () => {
        const schema = {
            app: {
                port: c.optional(c.number())
            }
        };
        const driver = new JsonDriver({ path: TEST_JSON_PATH, keyroot: false });
        const config = new Kfg(driver, schema);
        config.load();

        config.set('app.port', 8080, 'The application port');

        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);

        expect(parsed).toEqual({
            app: {
                port: 8080,
                'port:comment': 'The application port'
            }
        });

        // Test loading
        const driver2 = new JsonDriver({ path: TEST_JSON_PATH, keyroot: false });
        const config2 = new Kfg(driver2, schema);
        config2.load();
        expect(config2.get('app.port')).toBe(8080);
        expect(config2.get('app')).toEqual({ port: 8080 }); 
    });

    it('should save in flattened format with comments when keyroot is true', () => {
        const schema = {
            app: {
                port: c.optional(c.number()),
                host: c.string({ default: 'localhost' })
            }
        };
        const driver = new JsonDriver({ path: TEST_JSON_PATH, keyroot: true });
        const config = new Kfg(driver, schema);
        config.load();

        config.set('app.port', 8080, 'The application port');

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
        const driver2 = new JsonDriver({ path: TEST_JSON_PATH, keyroot: true });
        const config2 = new Kfg(driver2, schema);
        config2.load();
        // Check that the values are correctly unflattened and accessible
        expect(config2.get('app.port')).toBe(8080);
        expect(config2.get('app.host')).toBe('localhost');
        // Ensure the root object is correctly reconstructed
        expect(config2.get('app')).toEqual({ port: 8080, host: 'localhost' });
    });

    it('should throw a validation error for type mismatch on load', () => {
        const initialData = { app: { port: 'not-a-number' } };
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));
        const schema = { app: { port: c.number() } };
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, schema);
        
        expect(() => config.load()).toThrow(/Invalid JSON configuration/);
    });

    it('should not include comment properties in proxy or get() object', () => {
        const schema = { app: { port: c.optional(c.number()) } };
        const driver = new JsonDriver({ path: TEST_JSON_PATH });
        const config = new Kfg(driver, schema);
        config.load();

        config.set('app.port', 8080, 'The application port');

        const appObject = config.get('app');
        expect(appObject).toEqual({ port: 8080 });
    });

    it('should show flattened suggestions in validation error when keyroot is true', () => {
        fs.writeFileSync(TEST_JSON_PATH, JSON.stringify({}));
        const schema = {
            database: {
                url: c.string(),
                pool: {
                    min: c.number({ default: 1 }),
                    max: c.number({ default: 10 }),
                },
            },
        };
        const driver = new JsonDriver({ path: TEST_JSON_PATH, keyroot: true });
        const config = new Kfg(driver, schema);

        expect(() => config.load()).toThrow(/"database\.url": "<string>"/);
        expect(() => config.load()).not.toThrow(/"database":\s*\{/);
    });
});
