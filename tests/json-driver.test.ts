import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import { ConfigJSDriver } from '../src/driver';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

const TEST_JSON_PATH = path.join(__dirname, 'config.test.json');

// --- Helper Functions (mirrored from the actual driver for accurate testing) ---
function getProperty(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function setProperty(obj: Record<string, any>, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    let target = obj;
    for (const key of keys) {
        if (target[key] === undefined || typeof target[key] !== 'object') {
            target[key] = {};
        }
        target = target[key];
    }
    target[lastKey] = value;
}

const createTestJsonDriver = (isAsync: boolean) => {
    if (isAsync) {
        return new ConfigJSDriver({
            identify: 'test-json-driver-async',
            async: true,
            config: { path: TEST_JSON_PATH },
            async onLoad() {
                this.store = {}; // Reset store
                try {
                    const fileContent = await fsp.readFile(this.config.path, 'utf-8');
                    if (fileContent) this.store = JSON.parse(fileContent);
                } catch (error: any) {
                    if (error.code === 'ENOENT') return; // File not found is ok
                    throw error; // Other errors should fail the test
                }
            },
            onGet(key) { return Promise.resolve(getProperty(this.store, key)); },
            async onSet(key, value) {
                setProperty(this.store, key, value);
                await fsp.writeFile(this.config.path, JSON.stringify(this.store, null, 2));
            },
        });
    }

    return new ConfigJSDriver({
        identify: 'test-json-driver-sync',
        async: false,
        config: { path: TEST_JSON_PATH },
        onLoad() {
            this.store = {}; // Reset store
            if (!fs.existsSync(this.config.path)) return;
            const fileContent = fs.readFileSync(this.config.path, 'utf-8');
            if (fileContent) {
                try {
                    this.store = JSON.parse(fileContent);
                } catch (e) {
                    // In tests, we want to know if JSON is invalid
                    throw new Error('Invalid JSON');
                }
            }
        },
        onGet(key) { return getProperty(this.store, key); },
        onSet(key, value) {
            setProperty(this.store, key, value);
            fs.writeFileSync(this.config.path, JSON.stringify(this.store, null, 2));
        },
    });
};

describe('JSON Driver', () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_JSON_PATH)) fs.unlinkSync(TEST_JSON_PATH);
    });

    afterAll(() => {
        if (fs.existsSync(TEST_JSON_PATH)) fs.unlinkSync(TEST_JSON_PATH);
    });

    describe('Synchronous', () => {
        it('should load, get, and set nested data', () => {
            const driver = createTestJsonDriver(false);
            const initialData = { app: { name: 'TestApp' } };
            fs.writeFileSync(TEST_JSON_PATH, JSON.stringify(initialData));

            driver.load();
            expect(driver.get('app.name')).toBe('TestApp');

            driver.set('db.host', 'localhost');
            expect(driver.get('db.host')).toBe('localhost');

            const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
            const parsed = JSON.parse(fileContent);
            expect(parsed.db.host).toBe('localhost');
            expect(parsed.app.name).toBe('TestApp');
        });

        it('should create a new file on set if it does not exist', () => {
            const driver = createTestJsonDriver(false);
            driver.load(); // store is empty
            driver.set('user.name', 'John');

            expect(fs.existsSync(TEST_JSON_PATH)).toBe(true);
            const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
            const parsed = JSON.parse(fileContent);
            expect(parsed.user.name).toBe('John');
        });

        it('should throw an error for invalid JSON', () => {
            const driver = createTestJsonDriver(false);
            fs.writeFileSync(TEST_JSON_PATH, '{');
            expect(() => driver.load()).toThrow('Invalid JSON');
        });

        it('should not error on load if file does not exist', () => {
            const driver = createTestJsonDriver(false);
            expect(() => driver.load()).not.toThrow();
            expect(driver.get('anything')).toBeUndefined();
        });

        it('should handle array values', () => {
            const driver = createTestJsonDriver(false);
            driver.load();
            const anArray = ['item1', 'item2', { nested: true }];
            driver.set('data.items', anArray);

            const fileContent = fs.readFileSync(TEST_JSON_PATH, 'utf-8');
            const parsed = JSON.parse(fileContent);
            expect(parsed.data.items).toEqual(anArray);

            // Check if get returns the array correctly
            expect(driver.get('data.items')).toEqual(anArray);
        });
    });

    describe('Asynchronous', () => {
        it('should load, get, and set nested data', async () => {
            const driver = createTestJsonDriver(true);
            const initialData = { app: { name: 'TestAppAsync' } };
            await fsp.writeFile(TEST_JSON_PATH, JSON.stringify(initialData));

            await driver.load();
            expect(await driver.get('app.name')).toBe('TestAppAsync');

            await driver.set('db.host', 'localhost-async');
            expect(await driver.get('db.host')).toBe('localhost-async');

            const fileContent = await fsp.readFile(TEST_JSON_PATH, 'utf-8');
            const parsed = JSON.parse(fileContent);
            expect(parsed.db.host).toBe('localhost-async');
            expect(parsed.app.name).toBe('TestAppAsync');
        });

        it('should not error on load if file does not exist', async () => {
            const driver = createTestJsonDriver(true);
            await expect(driver.load()).resolves.toBeUndefined();
            expect(await driver.get('anything')).toBeUndefined();
        });

        it('should throw an error for invalid JSON', async () => {
            const driver = createTestJsonDriver(true);
            await fsp.writeFile(TEST_JSON_PATH, '{');
            await expect(driver.load()).rejects.toThrow();
        });
    });
});
