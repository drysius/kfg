import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ConfigJS } from '../src/ConfigJS';
import { c } from '../src/factory';
import { ConfigJSDriver } from '../src/driver';
import { FormatRegistry } from '@sinclair/typebox';
import * as fs from 'fs';
import * as path from 'path';

// --- Test Setup ---

const TEST_ENV_PATH = path.join(__dirname, '.env.configjs.test');

// Register formats for validation tests
beforeAll(() => {
    FormatRegistry.Set('email', (v) => /^[a-z0-9\.+-]+@[a-z0-9\._-]+\.[a-z]+$/i.test(v));
    FormatRegistry.Set('ipv4', (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v));
    FormatRegistry.Set('ipv6', (v) => /^(::)?(((\d{1,3}\.){3}\d{1,3})|([0-9a-fA-F]{1,4}::?){1,7}[0-9a-fA-F]{1,4})(::)?$/.test(v));
    FormatRegistry.Set('uri', (v) => /^https?:\/\/\w+(\.\w+)*(:\d+)?(\S*)?$/.test(v));
});

// A simple file-based driver for integration tests
const createFileDriver = (isAsync: boolean) => new ConfigJSDriver({
    identify: 'test-file-driver',
    async: isAsync,
    config: { path: TEST_ENV_PATH },
    onLoad() {
        this.store = {};
        if (!fs.existsSync(this.config.path)) return;
        const fileContent = fs.readFileSync(this.config.path, 'utf-8');
        fileContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) this.store[match[1].trim()] = match[2].trim();
        });
    },
    onGet(key) { return this.store[key]; },
    onSet(key, value) {
        this.store[key] = String(value);
        const content = Object.entries(this.store).map(([k, v]) => `${k}=${v}`).join('\n');
        fs.writeFileSync(this.config.path, content);
    },
});

// A mock in-memory driver for unit tests
const createMockDriver = (isAsync: boolean, initialStore: Record<string, any> = {}) => {
    let store = { ...initialStore };
    return new ConfigJSDriver({
        identify: 'mock-driver',
        async: isAsync,
        config: {},
        onLoad: isAsync ? async () => { store = { ...initialStore }; } : () => { store = { ...initialStore }; },
        onGet: isAsync ? async (key) => store[key] : (key) => store[key],
        onSet: isAsync ? async (key, value) => { store[key] = value; } : (key, value) => { store[key] = value; },
    });
};


// --- Test Suites ---

describe('ConfigJS', () => {

    beforeEach(() => {
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    afterAll(() => {
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    describe('Core Functionality', () => {
        it('should require load() before get() or has()', () => {
            const config = new ConfigJS({ driver: createMockDriver(false), schema: {} });
            expect(() => config.get('any')).toThrow('[ConfigJS] Config not loaded. Call load() first.');
            expect(() => config.has('any')).toThrow('[ConfigJS] Config not loaded. Call load() first.');
        });

        it('should load, get, set, and check values correctly', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'APP_NAME=MyTestApp\nFEATURE_ENABLED=true');
            const config = new ConfigJS({
                driver: createFileDriver(false),
                schema: { app: { name: c.string() }, feature: { enabled: c.boolean() } }
            });
            
            config.load();

            expect(config.get('app.name')).toBe('MyTestApp');
            expect(config.has('app.name')).toBe(true);
            expect(config.get('feature.enabled')).toBe(true);
            expect(config.has('feature.enabled')).toBe(true);
            expect(config.has('nonexistent')).toBe(false);

            config.set('app.name', 'NewAppName');
            expect(config.get('app.name')).toBe('NewAppName');
            const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
            expect(fileContent).toContain('APP_NAME=NewAppName');
        });

        it('should coerce types correctly during load', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'PORT=8080\nIS_LIVE=true\nIS_OFF=FALSE\nNUM_ONE=1');
            const config = new ConfigJS({
                driver: createFileDriver(false),
                schema: {
                    port: c.number(),
                    is_live: c.boolean(),
                    is_off: c.boolean(),
                    num_one: c.boolean(),
                }
            });
            config.load();
            expect(config.get('port')).toBe(8080);
            expect(config.get('is_live')).toBe(true);
            expect(config.get('is_off')).toBe(false);
            expect(config.get('num_one')).toBe(false); // '1' is not 'true'
        });
    });

    describe('Validation', () => {
        const complexSchema = {
            user: {
                email: c.Email(),
                role: c.Enum(['admin', 'user', 'guest']), 
            },
            server: {
                port: c.Number({
                    refines: [
                        (v) => v > 1024 || 'Port must be > 1024',
                        (v) => v < 65535 || 'Port must be < 65535'
                    ]
                })
            }
        };

        it('should pass with valid data', () => {
            const driver = createMockDriver(false, { 'USER_EMAIL': 'test@example.com', 'USER_ROLE': 'admin', 'SERVER_PORT': '3000' });
            const config = new ConfigJS({ driver, schema: complexSchema });
            expect(() => config.load()).not.toThrow();
        });

        it('should throw on invalid email format', () => {
            const driver = createMockDriver(false, { 'USER_EMAIL': 'invalid-email' });
            const config = new ConfigJS({ driver, schema: { user: { email: c.Email() } } });
            expect(() => config.load()).toThrow(/to match 'email' format/);
        });

        it('should throw on failed refine validation', () => {
            const driver = createMockDriver(false, { 'USER_EMAIL': 'test@example.com', 'USER_ROLE': 'user', 'SERVER_PORT': '80' });
            const config = new ConfigJS({ driver, schema: complexSchema });
            expect(() => config.load()).toThrow('Port must be > 1024');
        });

        it('should throw if driver.load() fails', () => {
            const failingDriver = new ConfigJSDriver({
                identify: 'failing-driver', async: false, config: {},
                onLoad: () => { throw new Error('Driver Failure'); }
            });
            const config = new ConfigJS({ driver: failingDriver, schema: {} });
            expect(() => config.load()).toThrow('Driver Failure');
        });
    });

    describe('Data Manipulation', () => {
        it('should get a sub-object with root()', () => {
            const driver = createMockDriver(false, { 'SERVER_HOST': 'example.com', 'SERVER_PORT': '3000' });
            const config = new ConfigJS({ driver, schema: { server: { host: c.String(), port: c.Number() } } });
            config.load();
            const serverConfig = config.root('server');
            expect(serverConfig).toEqual({ host: 'example.com', port: 3000 });
        });

        it('should insert a partial object and save it', () => {
            const driver = createMockDriver(false, { 'SERVER_HOST': 'example.com', 'SERVER_PORT': '3000' });
            const config = new ConfigJS({ driver, schema: { server: { host: c.String(), port: c.Number() } } });
            config.load();
            config.insert('server', { port: 9999 });

            expect(config.get('server.port')).toBe(9999);
            expect(config.get('server.host')).toBe('example.com');
        });

        it('should throw when trying to insert into a non-object', () => {
            const driver = createMockDriver(false, { 'SERVER_HOST': 'example.com' });
            const config = new ConfigJS({ driver, schema: { server: { host: c.String() } } });
            config.load();
            expect(() => config.insert('server.host' as any, { p: 1 })).toThrow(/Cannot set property/);
        });
    });

    describe('Defaults and Initial Save', () => {
        it('should handle initial_save with default values (string, number, boolean)', () => {
            const driver = createFileDriver(false);
            const config = new ConfigJS({
                driver,
                schema: {
                    db: { host: c.String({ default: 'localhost', initial_save: true }) },
                    app: { port: c.Number({ default: 3000, initial_save: true }) },
                    feature: { active: c.Boolean({ default: false, initial_save: true }) }
                }
            });

            config.load();
            expect(config.get('db.host')).toBe('localhost');
            expect(config.get('app.port')).toBe(3000);
            expect(config.get('feature.active')).toBe(false);

            const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
            expect(fileContent).toContain('DB_HOST=localhost');
            expect(fileContent).toContain('APP_PORT=3000');
            expect(fileContent).toContain('FEATURE_ACTIVE=false');
        });

        it('should not initial_save if a value is already present', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'DB_HOST=remotehost');
            const driver = createFileDriver(false);
            const config = new ConfigJS({
                driver,
                schema: { db: { host: c.String({ default: 'localhost', initial_save: true }) } }
            });

            config.load();
            expect(config.get('db.host')).toBe('remotehost');
            const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
            expect(fileContent).not.toContain('DB_HOST=localhost');
        });
    });

    describe('Async Operations', () => {
        it('should load configuration from an async driver', async () => {
            const driver = createMockDriver(true, { 'ASYNCKEY': 'asyncValue' });
            const config = new ConfigJS({ driver, schema: { asyncKey: c.string() } });
            await config.load();
            expect(await config.get('asyncKey')).toBe('asyncValue');
        });

        it('should set and insert with an async driver', async () => {
            const driver = createMockDriver(true, { 'APP_NAME': 'InitialApp', 'APP_VERSION': '0.9.0' });
            const config = new ConfigJS({ driver, schema: { app: { name: c.string(), version: c.string() } } });
            await config.load();

            await config.set('app.name', 'NewApp');
            expect(await config.get('app.name')).toBe('NewApp');

            await config.insert('app', { version: '1.0.0' });
            expect(await config.get('app.version')).toBe('1.0.0');
            const root = await config.root('app');
            expect(root).toEqual({ name: 'NewApp', version: '1.0.0' });
        });
    });
});
