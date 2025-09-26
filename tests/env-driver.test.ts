import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import { envDriver } from '../src/drivers/env-driver';
import * as fs from 'fs';
import * as path from 'path';
import { c } from '../src/factory';
import { ConfigJS } from '../src/ConfigJS';

const TEST_ENV_PATH = path.join(__dirname, '.env.driver.test');

describe('ENV Driver Integration', () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    afterAll(() => {
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    it('should load and coerce values from a .env file', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'KEY=VALUE\nNUM=123');
        const config = new ConfigJS(envDriver, {
            key: c.string(),
            num: c.number(),
        });
        config.load({ path: TEST_ENV_PATH });
        expect(config.get('key')).toBe('VALUE');
        expect(config.get('num')).toBe(123);
    });

    it('should apply defaults when loading a non-existent file', () => {
        const config = new ConfigJS(envDriver, { key: c.string({default: 'abc'}) });
        // No file exists, so the default value should be used.
        config.load({ path: TEST_ENV_PATH });
        expect(config.get('key')).toBe('abc');
    });

    it('should create a file and save a value on set()', () => {
        const config = new ConfigJS(envDriver, { new_key: c.string({default: ''}) });
        config.load({ path: TEST_ENV_PATH }); // Load first (it will be empty) 
        
        config.set('new_key', 'NEW_VALUE');
        
        expect(fs.existsSync(TEST_ENV_PATH)).toBe(true);
        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('NEW_KEY=NEW_VALUE');
    });

    it('should add a comment description when setting a value', () => {
        const config = new ConfigJS(envDriver, { api_key: c.string({default: ''}) });
        config.load({ path: TEST_ENV_PATH });

        config.set('api_key', '12345', { description: 'My API Key' });

        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('# My API Key');
        expect(fileContent).toContain('API_KEY=12345');
    });

    it('should automatically quote values containing spaces during set()', () => {
        const config = new ConfigJS(envDriver, { app_name: c.string({default: ''}) });
        config.load({ path: TEST_ENV_PATH });

        config.set('app_name', 'My Awesome App');

        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('APP_NAME="My Awesome App"');
    });

    it('should serialize array values to JSON strings on set()', () => {
        const config = new ConfigJS(envDriver, { my_array: c.array(c.string(), {default: []}) });
        config.load({ path: TEST_ENV_PATH });

        const anArray = ['item1', 'item with space', 'item,with,comma'];
        config.set('my_array', anArray);

        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('MY_ARRAY=["item1","item with space","item,with,comma"]');
    });
});
