import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { ConfigJS } from '../src/ConfigJS';
import { c } from '../src/factory';
import { envDriver } from '../src/drivers/env-driver';
import { jsonDriver } from '../src/drivers/json-driver';
import { ConfigJSDriver } from '../src/driver';
import { buildDefaultObject } from '../src/utils/schema';
import { deepMerge } from '../src/utils/object';

// --- Test Setup ---
const COMPLEX_TEST_DIR = path.join(__dirname, 'complex-test-files');
const COMPLEX_ENV_PATH = path.join(COMPLEX_TEST_DIR, '.env');
const COMPLEX_JSON_PATH = path.join(COMPLEX_TEST_DIR, 'config.json');

// An async version of the JSON driver, created for testing purposes.
const asyncJsonDriver = new ConfigJSDriver({
    ...jsonDriver,
    identify: 'async-json-driver',
    async: true,
    async onLoad(schema, opts) {
        const defaultData = this.buildDefaultObject(schema);
        const filePath = path.resolve(process.cwd(), opts.path || this.config.path || 'config.json');
        let loadedData = {};
        try {
            const fileContent = await fsp.readFile(filePath, 'utf-8');
            if (fileContent) loadedData = JSON.parse(fileContent);
        } catch (e) { /* Ignore if file doesn't exist or is invalid */ }
        this.store = this.deepMerge(defaultData, loadedData);
        return this.store;
    },
    async onSet(key, value) {
        const filePath = path.resolve(process.cwd(), this.config.path || 'config.json');
        await fsp.writeFile(filePath, JSON.stringify(this.data, null, 2));
    },
});

describe('Complex Scenarios', () => {
    beforeEach(() => {
        if (!fs.existsSync(COMPLEX_TEST_DIR)) fs.mkdirSync(COMPLEX_TEST_DIR);
        if (fs.existsSync(COMPLEX_ENV_PATH)) fs.unlinkSync(COMPLEX_ENV_PATH);
        if (fs.existsSync(COMPLEX_JSON_PATH)) fs.unlinkSync(COMPLEX_JSON_PATH);
        delete process.env.APP_SERVER_PORT;
        delete process.env.APP_DATABASE_CONNECTIONS_PASS;
    });

    afterAll(() => {
        if (fs.existsSync(COMPLEX_ENV_PATH)) fs.unlinkSync(COMPLEX_ENV_PATH);
        if (fs.existsSync(COMPLEX_JSON_PATH)) fs.unlinkSync(COMPLEX_JSON_PATH);
        if (fs.existsSync(COMPLEX_TEST_DIR)) fs.rmdirSync(COMPLEX_TEST_DIR);
    });

    // This schema features multiple levels of nesting and different option types
    // to simulate a real-world application configuration.
    const complexSchema = {
        app: {
            server: {
                host: c.string({ default: 'localhost' }),
                port: c.number({ default: 3000 }),
                tls: c.object({
                    enabled: c.boolean({ default: false }),
                    cert_path: c.string({ default: '/etc/ssl/cert.pem' })
                }, { default: {} })
            },
            database: {
                host: c.string(),
                user: c.string({ default: 'guest' }),
                pass: c.string({ prop: 'DB_PASSWORD' }),
            },
        }
    };

    it('should correctly merge values from .env file and process.env', () => {
        // Purpose: To verify the envDriver's loading priority and merging logic.
        // It checks that .env files override process.env, and both override defaults.

        // 1. Setup configuration sources
        process.env.APP_SERVER_PORT = '8080'; // This value should be ignored
        fs.writeFileSync(COMPLEX_ENV_PATH, 
`# Server settings
APP_SERVER_PORT=9090

# DB Settings
APP_DATABASE_HOST=db.prod.local
DB_PASSWORD=secret-from-env-file`
        );

        // 2. Load configuration using the envDriver
        const config = new ConfigJS(envDriver, complexSchema);
        config.load({ path: COMPLEX_ENV_PATH });

        // 3. Assertions
        // Value from .env file (should have the highest priority)
        expect(config.get('app.server.port')).toBe(9090);
        expect(config.get('app.database.host')).toBe('db.prod.local');
        expect(config.get('app.database.pass')).toBe('secret-from-env-file');

        // Value from schema defaults (should be used when no other source provides a value)
        expect(config.get('app.database.user')).toBe('guest');
        expect(config.get('app.server.host')).toBe('localhost');

        // `has` and `root` should work correctly on fully-defaulted objects
        expect(config.has('app.server.tls.enabled')).toBe(true);
        const tls = config.root('app.server.tls');
        expect(tls).toEqual({ enabled: false, cert_path: '/etc/ssl/cert.pem' });
    });

    it('should perform a full async workflow: load, get, set, and insert', async () => {
        // Purpose: To test the complete lifecycle of configuration management with an async driver.
        // This ensures that all API methods work correctly with promises.

        const initialJson = {
            app: {
                server: { port: 9000 },
                database: { host: 'db.initial.json', pass: 'json-pass' }
            }
        };
        fs.writeFileSync(COMPLEX_JSON_PATH, JSON.stringify(initialJson));

        const config = new ConfigJS(asyncJsonDriver, complexSchema);

        // 1. Load config from the JSON file
        await config.load({ path: COMPLEX_JSON_PATH });

        // 2. Get and verify initial state from both the file and defaults
        expect(await config.get('app.server.port')).toBe(9000);
        expect(await config.get('app.database.user')).toBe('guest'); // from default
        expect(await config.get('app.database.pass')).toBe('json-pass'); // from file, not using 'prop'

        // 3. Set a new value and confirm it was updated in memory
        await config.set('app.server.host', 'new.host.com');
        expect(await config.get('app.server.host')).toBe('new.host.com');

        // 4. Insert a partial object into a nested structure
        await config.insert('app.database', { user: 'admin', host: 'db.updated.local' });
        const dbConfig = await config.root('app.database');
        expect(dbConfig).toEqual({ 
            host: 'db.updated.local', 
            user: 'admin', 
            pass: 'json-pass' 
        });

        // 5. Verify that all changes were persisted to the file by the async driver
        const finalFileContent = fs.readFileSync(COMPLEX_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(finalFileContent);

        expect(parsed.app.server.host).toBe('new.host.com');
        expect(parsed.app.database.user).toBe('admin');
        expect(parsed.app.database.host).toBe('db.updated.local');
    });
});
