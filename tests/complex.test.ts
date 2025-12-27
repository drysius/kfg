import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { c } from '../src/factory';
import { envDriver } from '../src/drivers/env-driver';
import { jsonDriver } from '../src/drivers/json-driver';
import { Kfg, kfgDriver } from '../src';
import { deepMerge } from '../src/utils/object';
import { buildDefaultObject } from '../src/utils/schema';

const COMPLEX_TEST_DIR = path.join(__dirname, 'complex-test-files');
const COMPLEX_ENV_PATH = path.join(COMPLEX_TEST_DIR, '.env');
const COMPLEX_JSON_PATH = path.join(COMPLEX_TEST_DIR, 'config.json');

// An async version of the JSON driver, created for testing purposes.
const asyncJsonDriver = kfgDriver<any>((config) => {
    return {
        name: 'async-json-driver',
        async: true,
        
        load(schema, opts) {
            Object.assign(config, opts);
            return (async () => {
                const defaultData = buildDefaultObject(schema);
                const filePath = path.resolve(process.cwd(), config.path || 'config.json');
                let loadedData = {};
                try {
                    const fileContent = await fsp.readFile(filePath, 'utf-8');
                    if (fileContent) loadedData = JSON.parse(fileContent);
                } catch (e) { /* Ignore if file doesn't exist or is invalid */ }
                
                return deepMerge(defaultData, loadedData);
            })();
        },
        
        set(key, value, options) {
             return (async () => {
                const filePath = path.resolve(process.cwd(), config.path || 'config.json');
                await fsp.writeFile(filePath, JSON.stringify(options.data, null, 2));
             })();
        },
        
        del(key, options) {
             return (async () => {
                const filePath = path.resolve(process.cwd(), config.path || 'config.json');
                await fsp.writeFile(filePath, JSON.stringify(options.data, null, 2));
             })();
        }
    };
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

    // A schema with multiple levels of nesting and different option types,
    // designed to simulate a real-world application configuration.
    const complexSchema = {
        app: {
            server: {
                host: c.string({ default: 'localhost' }),
                port: c.number({ default: 3000 }),
                tls:{
                    enabled: c.boolean({ default: false }),
                    cert_path: c.string({ default: '/etc/ssl/cert.pem' })
                }
            },
            database: {
                host: c.string(),
                user: c.string({ default: 'guest' }),
                pass: c.string({ prop: 'DB_PASSWORD' }),
            },
        }
    };

    // This test verifies the envDriver's loading priority.
    // It ensures that values from a .env file take precedence over process.env,
    // and that both sources override the schema's default values.
    it('should correctly merge values from .env file, process.env, and defaults', () => {
        process.env.APP_SERVER_PORT = '8080'; // This value should be ignored
        fs.writeFileSync(COMPLEX_ENV_PATH, 
`# Server settings
APP_SERVER_PORT=9090

# DB Settings
APP_DATABASE_HOST=db.prod.local
DB_PASSWORD=secret-from-env-file`
        );

        const config = new Kfg(envDriver, complexSchema);
        config.load({ path: COMPLEX_ENV_PATH });

        expect(config.get('app.server.port')).toBe(9090);
        expect(config.get('app.database.host')).toBe('db.prod.local');
        expect(config.get('app.database.pass')).toBe('secret-from-env-file');
        expect(config.get('app.database.user')).toBe('guest');
        expect(config.get('app.server.host')).toBe('localhost');
    });

    // This test validates the complete lifecycle of an async driver.
    // It ensures that all primary methods (load, get, set, insert)
    // function correctly and handle promises as expected.
    it('should execute a full async workflow with load, get, set, and insert', async () => {
        const initialJson = {
            app: {
                server: { port: 9000 },
                database: { host: 'db.initial.json', pass: 'json-pass' }
            }
        };
        fs.writeFileSync(COMPLEX_JSON_PATH, JSON.stringify(initialJson));

        const config = new Kfg(asyncJsonDriver, complexSchema);

        await config.load({ path: COMPLEX_JSON_PATH });

        expect(await config.get('app.server.port')).toBe(9000);
        expect(await config.get('app.database.user')).toBe('guest');
        expect(await config.get('app.database.pass')).toBe('json-pass');

        await config.set('app.server.host', 'new.host.com');
        expect(await config.get('app.server.host')).toBe('new.host.com');

        await config.insert('app.database', { user: 'admin', host: 'db.updated.local' });
        const dbConfig = await config.root('app.database');
        expect(dbConfig).toEqual({ 
            host: 'db.updated.local', 
            user: 'admin', 
            pass: 'json-pass' 
        });

        const finalFileContent = fs.readFileSync(COMPLEX_JSON_PATH, 'utf-8');
        const parsed = JSON.parse(finalFileContent);

        expect(parsed.app.server.host).toBe('new.host.com');
        expect(parsed.app.database.user).toBe('admin');
        expect(parsed.app.database.host).toBe('db.updated.local');
    });
});