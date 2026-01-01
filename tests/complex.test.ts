import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { c } from '../src/factory';
import { EnvDriver } from '../src/drivers/env-driver';
import { Kfg, KfgDriver } from '../src';

const COMPLEX_TEST_DIR = path.join(__dirname, 'complex-test-files');
const COMPLEX_ENV_PATH = path.join(COMPLEX_TEST_DIR, '.env');

// A simple async driver to test async functionality
const simpleAsyncDriver = new KfgDriver<any, true>({
    identify: 'simple-async-driver',
    async: true,
    
    async onMount(kfg, opts) {
        await new Promise(resolve => setTimeout(resolve, 10));
        const data = { 
            app: { 
                server: { port: 9000 },
                database: { host: 'async-host' }
            } 
        };
        kfg.$store.set("data", data);
        return data;
    },
    async onGet(kfg, { path }) {
        const data = kfg.$store.get("data");
        // We need getProperty helper or simple access. 
        // Since this is a test, I'll import getProperty or just implement simple traversal.
        // But importing getProperty inside the test file is easier if it's already there? 
        // No, deepMerge is imported. I'll import getProperty.
        
        // Wait, I can't easily add import if I don't see the top of file.
        // Let's implement simple traversal or rely on the test only checking specific paths.
        // The test checks 'app.server.port'.
        // I'll assume getProperty is available or use a simple reducer.
        return path.split('.').reduce((obj, key) => obj?.[key], data);
    }
});

describe('Complex Scenarios', () => {
    beforeEach(() => {
        if (!fs.existsSync(COMPLEX_TEST_DIR)) fs.mkdirSync(COMPLEX_TEST_DIR);
        if (fs.existsSync(COMPLEX_ENV_PATH)) fs.unlinkSync(COMPLEX_ENV_PATH);
        delete process.env.APP_SERVER_PORT;
    });

    afterAll(() => {
        if (fs.existsSync(COMPLEX_ENV_PATH)) fs.unlinkSync(COMPLEX_ENV_PATH);
        if (fs.existsSync(COMPLEX_TEST_DIR)) fs.rmdirSync(COMPLEX_TEST_DIR);
    });

    const complexSchema = {
        app: {
            server: {
                host: c.string({ default: 'localhost' }),
                port: c.number({ default: 3000 }),
            },
            database: {
                host: c.string(),
                user: c.string({ default: 'guest' }),
            },
        }
    };

    it('should correctly merge values from .env file, process.env, and defaults', () => {
        fs.writeFileSync(COMPLEX_ENV_PATH, 'APP_SERVER_PORT=9090\nAPP_DATABASE_HOST=db.prod.local');

        const config = new Kfg(new KfgDriver(EnvDriver.definition), complexSchema);
        config.load({ path: COMPLEX_ENV_PATH });

        expect(config.get('app.server.port')).toBe(9090);
        expect(config.get('app.database.host')).toBe('db.prod.local');
        expect(config.get('app.database.user')).toBe('guest');
        expect(config.get('app.server.host')).toBe('localhost');
    });

    it('should work with simple async driver', async () => {
        const config = new Kfg(simpleAsyncDriver, complexSchema);
        await config.load();

        expect(await config.get('app.server.port')).toBe(9000);
        expect(await config.get('app.database.host')).toBe('async-host');
    });
});