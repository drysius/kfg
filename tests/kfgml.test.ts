import { describe, it, expect } from 'bun:test';
import { kfgDriver, Model, KfgML, c, m, Kfg } from '../src';

describe('KfgML System', () => {
    // Schema definition
    const userSchema = {
        id: c.string(),
        name: c.string(),
        age: c.number(),
        created_at: m.createms(),
    };

    const licenceSchema = {
        id: c.string(),
        name: c.string(),
    };

    // Models
    const Users = new Model({ name: 'users', schema: userSchema });
    const Licences = new Model({ name: 'licences', schema: licenceSchema });

    // Mock Driver
    const mockData: Record<string, any[]> = {
        'users': [
            { id: '1', name: 'Alice', age: 30, created_at: 1000 },
            { id: '2', name: 'Bob', age: 25, created_at: 2000 },
        ],
        'licences': [
            { id: 'L1', name: 'MIT' }
        ]
    };

    const mockDriverFactory = kfgDriver<any>((config) => ({
        name: 'mock-ml-driver',
        async: false,
        
        find(schema, opts) {
            const modelName = opts.model as string;
            const data = mockData[modelName] || [];
            const queryKeys = Object.keys(opts).filter(k => k !== 'model' && k !== 'relations');
            if (queryKeys.length === 0) return data[0];
            const item = data.find(item => {
                return queryKeys.every(key => item[key] === opts[key]);
            });
            return item ? { ...item } : undefined;
        },
        findBy(schema, opts) {
             return this.find(schema, opts);
        },
        load(schema, opts) {
             return {}; 
        },
        set(key, value, options) {},
        del(key, options) {}
    }));

    const kfgml = new KfgML(mockDriverFactory, {
        models: [Users, Licences]
    });

    it('should find a user by name', () => {
        const user = Users.find({ name: 'Alice' });
        expect(user).toBeInstanceOf(Kfg);
        expect(user.get('name')).toBe('Alice');
        expect(user.get('age')).toBe(30);
    });

    it('should hydrate user data correctly', () => {
        const user = Users.find({ id: '2' });
        expect(user.get('name')).toBe('Bob');
        expect(user.get('created_at')).toBe(2000);
    });
    
    it('should support modifying data', () => {
         const user = Users.find({ name: 'Alice' });
         user.set('age', 31);
         expect(user.get('age')).toBe(31);
    });

    it('should retrieve model by name using getModel', () => {
        const userModel = kfgml.getModel('users');
        expect(userModel).toBe(Users);
        
        const licenceModel = kfgml.getModel('licences');
        expect(licenceModel).toBe(Licences);

        expect(kfgml.getModel('non-existent')).toBeUndefined();
    });

    it('should execute migrations using migrate', async () => {
        let migrationExecuted = false;
        const migration = {
            name: 'test-migration',
            up: async (driver: any) => {
                migrationExecuted = true;
            },
            down: async (ml: any) => {}
        };

        const mlWithMigration = new KfgML(mockDriverFactory, {
            models: [Users],
            migrations: [migration as any]
        });

        await mlWithMigration.migrate();
        expect(migrationExecuted).toBe(true);
    });

});
