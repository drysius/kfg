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

    it('should create a new file on set() if it does not exist', () => {
        const config = new ConfigJS(jsonDriver, { user: { name: c.string({default: ''}) } });
        config.load({ path: TEST_JSON_PATH }); // Load with empty config
        config.set('user.name', 'John');

        expect(fs.existsSync(TEST_JSON_PATH)).toBe(true);
        const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        expect(parsed.user.name).toBe('John');
    });

    it('should apply defaults when the JSON file is invalid or malformed', () => {
        fs.writeFileSync(TEST_JSON_PATH, '{'); // Invalid JSON
        const config = new ConfigJS(jsonDriver, { app: { name: c.string({default: 'DefaultApp'}) } });
        config.load({ path: TEST_JSON_PATH });
        expect(config.get('app.name')).toBe('DefaultApp');
    });

    it('should apply defaults when the config file does not exist', () => {
        const config = new ConfigJS(jsonDriver, { app: { name: c.string({default: 'abc'}) } });
        config.load({ path: TEST_JSON_PATH });
        expect(config.get('app.name')).toBe('abc');
    });

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
});