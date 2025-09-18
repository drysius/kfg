import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import { ConfigJSDriver } from '../src/driver';
import { parse, updateEnvContent } from '../src/utils/env';
import * as fs from 'fs';
import * as path from 'path';

const TEST_ENV_PATH = path.join(__dirname, '.env.driver.test');

// This test-specific driver faithfully reproduces the real env-driver logic
// by using the same utility functions (parse, updateEnvContent).
const createTestEnvDriver = () => new ConfigJSDriver({
    identify: 'test-env-driver',
    async: false,
    config: { path: TEST_ENV_PATH },
    onLoad() {
        this.store = {};
        if (!fs.existsSync(this.config.path)) return;
        const fileContent = fs.readFileSync(this.config.path, 'utf-8');
        this.store = parse(fileContent);
    },
    onGet(key) { return this.store[key]; },
    onSet(key, value, options) {
        this.store[key] = value;
        const currentContent = fs.existsSync(this.config.path) ? fs.readFileSync(this.config.path, 'utf-8') : '';
        const newContent = updateEnvContent(currentContent, key, value, options?.description);
        fs.writeFileSync(this.config.path, newContent);
    },
});

describe('ENV Driver', () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    afterAll(() => {
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    it('should load, get, and set synchronously', () => {
        const driver = createTestEnvDriver();
        fs.writeFileSync(TEST_ENV_PATH, 'KEY=VALUE');
        
        driver.load();
        expect(driver.get('KEY')).toBe('VALUE');

        driver.set('KEY', 'NEW_VALUE');
        expect(driver.get('KEY')).toBe('NEW_VALUE');

        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('KEY=NEW_VALUE');
    });

    it('should not error when loading a non-existent file', () => {
        const driver = createTestEnvDriver();
        expect(() => driver.load()).not.toThrow();
        expect(driver.get('ANYTHING')).toBeUndefined();
    });

    it('should create a file on set if it does not exist', () => {
        const driver = createTestEnvDriver();
        driver.set('NEW_KEY', 'NEW_VALUE');
        expect(fs.existsSync(TEST_ENV_PATH)).toBe(true);
        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('NEW_KEY=NEW_VALUE');
    });

    it('should set a value with a description', () => {
        const driver = createTestEnvDriver();
        driver.set('API_KEY', '12345', { description: 'My API Key' });
        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('# My API Key');
        expect(fileContent).toContain('API_KEY=12345');
    });

    it('should correctly quote values with spaces', () => {
        const driver = createTestEnvDriver();
        driver.set('APP_NAME', 'My Awesome App');
        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('APP_NAME="My Awesome App"');
    });

    it('should handle array values as JSON strings', () => {
        const driver = createTestEnvDriver();
        const anArray = ['item1', 'item with space', 'item,with,comma'];
        driver.set('MY_ARRAY', anArray);
        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('MY_ARRAY=["item1","item with space","item,with,comma"]');

        // Now, load it back and check if it's parsed correctly
        driver.load();
        // The driver's store will have the raw string because this test driver
        // doesn't perform the final coercion step.
        expect(driver.get('MY_ARRAY')).toBe('["item1","item with space","item,with,comma"]');
    });
});