import { describe, it, expect } from 'bun:test';
import { Kfg } from '../src/kfg';
import { KfgDriver } from '../src/kfg-driver';
import { c } from '../src/factory';
import type { SchemaDefinition } from '../src/types';

// Mock driver for testing Kfg core logic without FS
class MockDriver extends KfgDriver<any, false> {
    public data: Record<string, any> = {};
    public updates: Array<{ key: string; value: any; description?: string }> = [];
    public lastLoadedSchema?: SchemaDefinition;
    constructor(initialData: any = {}) {
        super({ name: 'mock', config: {}, async: false });
        this.data = initialData;
    }

    load(schema: SchemaDefinition) {
        this.lastLoadedSchema = schema;
        return this.data;
    }

    save(data: Record<string, any>) {
        this.data = data;
    }

    update(key: string, value: any, description?: string) {
        this.updates.push({ key, value, description });
    }
}

class AsyncMockDriver extends KfgDriver<any, true> {
    public data: Record<string, any> = {};
    constructor(initialData: any = {}) {
        super({ name: 'mock-async', config: {}, async: true });
        this.data = initialData;
    }

    async load(_schema: SchemaDefinition) {
        return this.data;
    }

    async save(data: Record<string, any>) {
        this.data = data;
    }
}

describe('Kfg Core Logic', () => {

    it('should initialize and load defaults', () => {
        const driver = new MockDriver({});
        const kfg = new Kfg(driver, {
            app: {
                name: c.string({ default: 'DefaultApp' }),
                port: c.number({ default: 3000 })
            }
        });

        kfg.load();
        expect(kfg.get('app.name')).toBe('DefaultApp');
        expect(kfg.get('app.port')).toBe(3000);
        expect(kfg.config.app.name).toBe('DefaultApp');
    });

    it('should validate data on load', () => {
        const driver = new MockDriver({ app: { port: "invalid" } });
        const kfg = new Kfg(driver, {
            app: { port: c.number() }
        });

        expect(() => kfg.load()).toThrow(/Invalid configuration/);
    });

    it('should validate data on set', () => {
        const driver = new MockDriver({});
        const kfg = new Kfg(driver, {
            count: c.number({ default: 0 })
        });
        kfg.load();

        expect(() => kfg.set('count', "string" as any)).toThrow(/Invalid configuration/);
        // Should rollback
        expect(kfg.get('count')).toBe(0);
    });

    it('should support inject() merging', () => {
        const driver = new MockDriver({ user: { name: 'Old' } });
        const kfg = new Kfg(driver, {
            user: { 
                name: c.string(), 
                role: c.string({ default: 'user' }) 
            }
        });
        kfg.load();

        kfg.inject({ user: { role: 'admin' } });
        
        expect(kfg.get('user.name')).toBe('Old');
        expect(kfg.get('user.role')).toBe('admin');
        expect(driver.data.user.role).toBe('admin'); // Verify persistence
    });

    it('should support insert() merging into nested object', () => {
        const driver = new MockDriver({ config: { a: 1 } });
        const kfg = new Kfg(driver, {
            config: {
                a: c.number(),
                b: c.number({ default: 2 })
            }
        });
        kfg.load();

        kfg.insert('config', { b: 99 });

        expect(kfg.get('config.a')).toBe(1);
        expect(kfg.get('config.b')).toBe(99);
    });

    it('should handle only_importants load option', () => {
        // Schema requires 'requiredField', but data is missing it.
        // Normal load would fail.
        const driver = new MockDriver({});
        const kfg = new Kfg(driver, {
            requiredField: c.string(),
            optionalField: c.string({ default: 'opt' })
        });

        // Should throw normally
        expect(() => kfg.load()).toThrow();

        // Should pass with only_importants (makes required optional)
        kfg.load({ only_importants: true });
        expect(kfg.has('requiredField')).toBe(false);
        expect(kfg.get('optionalField')).toBe('opt');
    });
    
    it('should support proxy access', () => {
        const driver = new MockDriver();
        const kfg = new Kfg(driver, { val: c.number({default: 10}) });
        kfg.load();

        expect(kfg.config.val).toBe(10);
        
        // Proxy is read-only
        expect(() => { (kfg.config as any).val = 20; }).toThrow(/read-only/);
    });
    
    it('should support root() alias', () => {
        const driver = new MockDriver();
        const kfg = new Kfg(driver, { rootVal: c.boolean({default: true}) });
        kfg.load();
        expect(kfg.root('rootVal')).toBe(true);
    });

    it('should return schema definition via conf/schematic', () => {
        const schema = { a: c.string() };
        const kfg = new Kfg(new MockDriver({ a: 'val' }), schema);
        kfg.load();
        
        const def = kfg.conf('a');
        expect(def.type).toBe('string');
        
        const def2 = kfg.schematic('a');
        expect(def2.type).toBe('string');
    });

    it('should handle deletion', () => {
        const driver = new MockDriver({ temp: 'value' });
        const kfg = new Kfg(driver, { temp: c.optional(c.string()) });
        kfg.load();

        expect(kfg.has('temp')).toBe(true);
        kfg.del('temp');
        expect(kfg.has('temp')).toBe(false);
    });

    it('should throw for read operations before load()', () => {
        const kfg = new Kfg(new MockDriver({ a: 1 }), { a: c.number() });
        expect(() => kfg.get('a')).toThrow(/Configuration not loaded/);
        expect(() => kfg.has('a')).toThrow(/Configuration not loaded/);
        expect(() => kfg.toJSON()).toThrow(/Configuration not loaded/);
    });

    it('should support has() with multiple paths for compatibility', () => {
        const driver = new MockDriver({ app: { name: 'x', port: 3000 } });
        const kfg = new Kfg(driver, {
            app: {
                name: c.string(),
                port: c.number(),
                host: c.optional(c.string()),
            },
        });
        kfg.load();

        expect(kfg.has('app.name')).toBe(true);
        expect(kfg.has('app.name', 'app.port')).toBe(true);
        expect(kfg.has('app.name', 'app.host')).toBe(false);
    });

    it('should support set() options object with description for compatibility', () => {
        const driver = new MockDriver({ app: { port: 3000 } });
        const kfg = new Kfg(driver, {
            app: { port: c.number() },
        });
        kfg.load();

        kfg.set('app.port', 8080, { description: 'http port' });
        expect(kfg.get('app.port')).toBe(8080);
        expect(driver.updates).toHaveLength(1);
        expect(driver.updates[0]).toEqual({
            key: 'app.port',
            value: 8080,
            description: 'http port',
        });
    });

    it('should support set() description string for compatibility', () => {
        const driver = new MockDriver({ app: { port: 3000 } });
        const kfg = new Kfg(driver, {
            app: { port: c.number() },
        });
        kfg.load();

        kfg.set('app.port', 9090, 'legacy description');
        expect(driver.updates[0]?.description).toBe('legacy description');
    });

    it('should support reload() and reuse last options', () => {
        const driver = new MockDriver({ app: { port: 3000 } });
        const kfg = new Kfg(driver, { app: { port: c.number() } });

        kfg.load();
        expect(kfg.get('app.port')).toBe(3000);

        driver.data = { app: { port: 5000 } };
        kfg.reload();
        expect(kfg.get('app.port')).toBe(5000);
    });

    it('should merge load options into driver config and keep on reload()', () => {
        const driver = new MockDriver({ app: { port: 3000 } });
        driver.config = { path: 'a.json' };
        const kfg = new Kfg(driver, { app: { port: c.number() } });

        kfg.load({ path: 'b.json' } as any);
        expect(driver.config.path).toBe('b.json');

        kfg.reload();
        expect(driver.config.path).toBe('b.json');
    });

    it('should expose driver and schema aliases for compatibility', () => {
        const driver = new MockDriver({ a: 'x' });
        const schema = { a: c.string() };
        const kfg = new Kfg(driver, schema);

        expect(kfg.driver).toBe(driver);
        expect(kfg.schema).toBe(schema);
    });

    it('should enforce important field with only_importants inside c.object()', () => {
        const driver = new MockDriver({});
        const kfg = new Kfg(driver, {
            database: c.object({
                url: c.string({ important: true }),
                pool: c.object({
                    min: c.number(),
                    max: c.number(),
                }),
            }),
        });

        expect(() => kfg.load({ only_importants: true })).toThrow();
        driver.data = { database: { url: 'postgres://localhost' } };
        kfg.load({ only_importants: true });
        expect(kfg.get('database.url')).toBe('postgres://localhost');
    });

    it('should allow set() after load({ only_importants: true }) without full-schema failure', () => {
        const driver = new MockDriver({
            database: { url: 'postgres://localhost' },
        });
        const kfg = new Kfg(driver, {
            database: c.object({
                url: c.string({ important: true }),
                timeout: c.number(),
                username: c.string(),
                password: c.string(),
            }),
            feature: c.string(),
        });

        kfg.load({ only_importants: true });
        expect(() => kfg.set('database.url', 'postgres://remote')).not.toThrow();
        expect(kfg.get('database.url')).toBe('postgres://remote');
    });

    it('should return plain object from toJSON after load()', () => {
        const kfg = new Kfg(new MockDriver({ a: 2 }), { a: c.number() });
        kfg.load();
        expect(kfg.toJSON()).toEqual({ a: 2 });
    });

    it('should return Promise from toJSON when driver is async', async () => {
        const kfg = new Kfg(new AsyncMockDriver({ a: 3 }), { a: c.number() });
        await kfg.load();
        await expect(kfg.toJSON()).resolves.toEqual({ a: 3 });
    });
});
