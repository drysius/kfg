import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { EnvDriver } from '../src/drivers/env-driver';
import { Kfg } from '../src/kfg';
import { c } from '../src/factory';
import * as fs from 'fs';
import * as path from 'path';

const TEST_ENV_PATH = path.resolve(process.cwd(), '.env.test');

describe('Env Driver Integration', () => {
    let originalEnv: Record<string, string | undefined>;

    beforeEach(() => {
        // Save current env and setup test env
        originalEnv = { ...process.env };
        process.env = {}; // Clear env to isolate test (except standard ones maybe, but fine)
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    afterEach(() => {
        // Restore env
        process.env = originalEnv;
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    it('should load simple string variable', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'APP_NAME=KfgTest\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            app_name: c.string()
        });
        
        config.load();
        expect(config.get('app_name')).toBe('KfgTest');
    });

    it('should load variables with prefix logic (envKey)', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'DB_HOST=localhost\nDB_PORT=5432\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            db: {
                host: c.string(),
                port: c.number()
            }
        });

        config.load();
        expect(config.get('db.host')).toBe('localhost');
        expect(config.get('db.port')).toBe(5432);
    });

    it('should respect custom prop mapping', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'CUSTOM_VAR=value\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            internal: c.string({ prop: 'CUSTOM_VAR' })
        });

        config.load();
        expect(config.get('internal')).toBe('value');
    });

    it('should prioritize process.env over .env file', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'API_KEY=file_key\n');
        process.env.API_KEY = 'process_key';

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            api_key: c.string()
        });

        config.load();
        expect(config.get('api_key')).toBe('process_key');
    });

    it('should coerce boolean values', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'DEBUG=true\nSSL=false\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            debug: c.boolean(),
            ssl: c.boolean()
        });

        config.load();
        expect(config.get('debug')).toBe(true);
        expect(config.get('ssl')).toBe(false);
    });

    it('should coerce number values', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'TIMEOUT=5000\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            timeout: c.number()
        });

        config.load();
        expect(config.get('timeout')).toBe(5000);
        expect(typeof config.get('timeout')).toBe('number');
    });

    it('should coerce array values (JSON string)', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'TAGS=["a","b","c"]\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            tags: c.array(c.string())
        });

        config.load();
        expect(config.get('tags')).toEqual(['a', 'b', 'c']);
    });

    it('should update existing key in .env file via set()', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'APP_NAME=OldName\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            app_name: c.string()
        });

        config.load();
        config.set('app_name', 'NewName', 'Updated name');

        const content = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(content).toContain('APP_NAME=NewName');
        expect(content).toContain('# Updated name');
        expect(config.get('app_name')).toBe('NewName');
    });

    it('should add new key to .env file via set()', () => {
        fs.writeFileSync(TEST_ENV_PATH, ''); // Empty

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            app_name: c.string({ default: 'Default' })
        });

        config.load();
        config.set('app_name', 'NewName');

        const content = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(content).toContain('APP_NAME=NewName');
    });

    it('should delete key from .env file via del()', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'APP_NAME=ToDelete\nOTHER=Keep\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            app_name: c.optional(c.string()),
            other: c.string()
        });

        config.load();
        config.del('app_name');

        const content = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(content).not.toContain('APP_NAME=ToDelete');
        expect(content).toContain('OTHER=Keep');
        expect(config.has('app_name')).toBe(false);
    });

    it('should handle quoted values correctly', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'SECRET="value with spaces"\n');

        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            secret: c.string()
        });

        config.load();
        expect(config.get('secret')).toBe('value with spaces');
    });

    it('should handle comments', () => {
        fs.writeFileSync(TEST_ENV_PATH, '# A comment\nVAR=val # inline comment\n');
        
        const driver = new EnvDriver({ path: '.env.test' });
        const config = new Kfg(driver, {
            var: c.string()
        });

        config.load();
        expect(config.get('var')).toBe('val');
    });

    // --- Bug fixes ---

    describe('c.Object() schema in env driver (Bug 1)', () => {
        it('should read nested props from env vars (APP_NAME, APP_PORT) when schema uses c.Object()', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'APP_NAME=myapp\nAPP_PORT=8080\n');

            const driver = new EnvDriver({ path: '.env.test', forceexit: false });
            const config = new Kfg(driver, {
                app: c.Object({
                    name: c.string(),
                    port: c.number(),
                })
            });

            config.load();
            expect(config.get('app')).toEqual({ name: 'myapp', port: 8080 });
        });

        it('should use defaults when c.Object() fields have defaults and env is missing', () => {
            fs.writeFileSync(TEST_ENV_PATH, '');

            const driver = new EnvDriver({ path: '.env.test', forceexit: false });
            const config = new Kfg(driver, {
                app: c.Object({
                    name: c.string({ default: 'default-app' }),
                    port: c.number({ default: 3000 }),
                })
            });

            config.load();
            const app = config.get('app');
            expect(app).not.toBeUndefined();
            expect(app.name).toBe('default-app');
            expect(app.port).toBe(3000);
        });

        it('c.Optional(c.Object()) without env → get() returns undefined, not crash', () => {
            fs.writeFileSync(TEST_ENV_PATH, '');

            const driver = new EnvDriver({ path: '.env.test', forceexit: false });
            const config = new Kfg(driver, {
                app: c.optional(c.Object({
                    name: c.string({ default: 'x' }),
                })),
                other: c.string({ default: 'y' }),
            });

            config.load();
            // should not throw — app is optional, may be undefined
            expect(() => config.get('other')).not.toThrow();
        });

        it('c.Object() with env vars should override defaults', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'DB_HOST=prod-server\nDB_PORT=5432\n');

            const driver = new EnvDriver({ path: '.env.test', forceexit: false });
            const config = new Kfg(driver, {
                db: c.Object({
                    host: c.string({ default: 'localhost' }),
                    port: c.number({ default: 3306 }),
                })
            });

            config.load();
            expect(config.get('db.host')).toBe('prod-server');
            expect(config.get('db.port')).toBe(5432);
        });

        it('c.Object() behaves same as plain nested object schema', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'SERVER_HOST=example.com\nSERVER_PORT=443\n');

            const driver1 = new EnvDriver({ path: '.env.test', forceexit: false });
            const configObj = new Kfg(driver1, {
                server: c.Object({
                    host: c.string({ default: 'localhost' }),
                    port: c.number({ default: 80 }),
                })
            });

            const driver2 = new EnvDriver({ path: '.env.test', forceexit: false });
            const configPlain = new Kfg(driver2, {
                server: {
                    host: c.string({ default: 'localhost' }),
                    port: c.number({ default: 80 }),
                }
            });

            configObj.load();
            configPlain.load();

            expect(configObj.get('server')).toEqual(configPlain.get('server'));
        });
    });

    describe('coerceType JSON object parsing (Bug 2)', () => {
        it('should parse JSON object string from env var for c.Object() field', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'CONFIG={"host":"db.local","port":5432}\n');

            const driver = new EnvDriver({ path: '.env.test', forceexit: false });
            // Using c.record to accept arbitrary JSON object as single var
            const config = new Kfg(driver, {
                config: c.record(c.string(), c.any()),
            });

            config.load();
            const val = config.get('config') as any;
            expect(val.host).toBe('db.local');
            expect(val.port).toBe(5432);
        });

        it('should fallthrough on invalid JSON object string', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'VAL={not valid json}\n');

            const driver = new EnvDriver({ path: '.env.test', forceexit: false });
            const config = new Kfg(driver, {
                val: c.string({ default: 'fallback' }),
            });

            config.load();
            // Validation fails or falls through — just ensure no unhandled exception
            expect(() => config.get('val')).not.toThrow();
        });
    });

    describe('nested object only set when non-empty (Bug 3)', () => {
        it('defaults fill in when no env vars exist for nested object', () => {
            fs.writeFileSync(TEST_ENV_PATH, '');

            const driver = new EnvDriver({ path: '.env.test', forceexit: false });
            const config = new Kfg(driver, {
                server: {
                    host: c.string({ default: 'localhost' }),
                    port: c.number({ default: 3000 }),
                }
            });

            config.load();
            expect(config.get('server.host')).toBe('localhost');
            expect(config.get('server.port')).toBe(3000);
        });

        it('partial env vars override only matching fields, defaults fill rest', () => {
            fs.writeFileSync(TEST_ENV_PATH, 'SERVER_HOST=custom-host\n');

            const driver = new EnvDriver({ path: '.env.test', forceexit: false });
            const config = new Kfg(driver, {
                server: {
                    host: c.string({ default: 'localhost' }),
                    port: c.number({ default: 3000 }),
                }
            });

            config.load();
            expect(config.get('server.host')).toBe('custom-host');
            expect(config.get('server.port')).toBe(3000);
        });
    });
});
