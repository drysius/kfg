import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EnvDriver } from '../src/drivers/env-driver';
import { Kfg } from '../src/kfg';
import { c } from '../src/factory';

const TEST_ENV = path.resolve(process.cwd(), '.env.test.tracing');

describe('EnvDriver Tracing and Save', () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_ENV)) fs.unlinkSync(TEST_ENV);
    });

    afterEach(() => {
        if (fs.existsSync(TEST_ENV)) fs.unlinkSync(TEST_ENV);
    });

    it('should save the full configuration back to .env with clean formatting', () => {
        const schema = {
            port: c.number({ default: 3000, description: 'Server port' }),
            db: {
                host: c.string({ default: 'localhost' }),
            }
        };

        const driver = new EnvDriver({ path: '.env.test.tracing' });
        const kfg = new Kfg(driver, schema);

        kfg.load();
        
        // Modify some values
        kfg.set('port', 8080);
        kfg.set('db.host', 'db.internal');

        const content = fs.readFileSync(TEST_ENV, 'utf-8');
        
        // Validate formatting
        expect(content).toContain('PORT=8080');
        expect(content).toContain('DB_HOST=db.internal');
        expect(content).toContain('# Server port');
        expect(content).not.toContain('PORT =');
        expect(content).not.toContain(' = 8080');
    });

    it('should correctly trace sources (process vs file vs default)', () => {
        fs.writeFileSync(TEST_ENV, 'FILE_KEY=from_file\nOVERRIDE=from_file');
        process.env.PROCESS_KEY = 'from_process';
        process.env.OVERRIDE = 'from_process';

        const schema = {
            file_key: c.string(),
            process_key: c.string(),
            override: c.string(),
            def_key: c.string({ default: 'from_default' })
        };

        const driver = new EnvDriver({ path: '.env.test.tracing' });
        const kfg = new Kfg(driver, schema);
        kfg.load();

        const tracing = (driver as any).tracing;

        expect(tracing['file_key'].source).toBe('file');
        expect(tracing['process_key'].source).toBe('process');
        expect(tracing['override'].source).toBe('process'); // process.env has priority
        expect(tracing['def_key'].source).toBe('default');

        // Clean up process.env
        delete process.env.PROCESS_KEY;
        delete process.env.OVERRIDE;
    });
});
