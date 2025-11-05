import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import { ConfigFS, c, cfs, jsonDriver } from '../src/index';
import { Type } from '@sinclair/typebox';

const TEST_DIR = path.join(__dirname, 'configfs-test-files');
const USER_DIR = path.join(TEST_DIR, 'users');
const INVENTORY_DIR = path.join(TEST_DIR, 'inventory');

// 1. Define o ConfigFS para Inventário
const InventoryConfigFS = new ConfigFS(jsonDriver, {
    item: c.array(c.string(), { default: [], description: "Lista de itens no inventário" }),
    location: c.string({ default: "warehouse", description: "Localização do inventário" }),
}, { only_importants: true });

const UserSchema = {
    name: c.string({ default: "New User", description: "Nome do usuário" }),
    age: c.number({ default: 18, description: "Idade do usuário" }),
    is_active: c.boolean({ default: true, description: "Status de atividade do usuário" }),
    inventory_ids: cfs.many(InventoryConfigFS, {
        default: [],
        description: "Lista de IDs de inventário pertencentes ao usuário",
    }),
    address: {
        street: c.string({ default: '' }),
        city: c.string({ default: '' }),
    },
};

const UserConfigFS = new ConfigFS(jsonDriver, UserSchema, { only_importants: true });

describe('ConfigFS v2', () => {
    beforeEach(async () => {
        if (fs.existsSync(TEST_DIR)) {
            await fsp.rm(TEST_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(USER_DIR, { recursive: true });
        fs.mkdirSync(INVENTORY_DIR, { recursive: true });
        InventoryConfigFS.init((id) => path.join(INVENTORY_DIR, `${id}.json`));
        UserConfigFS.init((id) => path.join(USER_DIR, `${id}.json`));
    });

    afterAll(async () => {
        if (fs.existsSync(TEST_DIR)) {
            await fsp.rm(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('should create and manage inventory items', async () => {
        const inv1 = InventoryConfigFS.file("inv-1");
        inv1.set("item", ["espada", "escudo"]);
        inv1.set("location", "arsenal");

        const inv2 = InventoryConfigFS.file("inv-2");
        inv2.set("item", ["poção", "pergaminho"]);

        const inv1Data = await inv1.toJSON();
        expect(inv1Data.item).toEqual(["espada", "escudo"]);
        expect(inv1Data.location).toBe("arsenal");

        const inv2Data = await inv2.toJSON();
        expect(inv2Data.item).toEqual(["poção", "pergaminho"]);
        expect(inv2Data.location).toBe("warehouse"); // Default value
    });

    it('should create and manage a user with relationships', async () => {
        const user1 = UserConfigFS.file("user-123");
        user1.set("name", "Alice");
        user1.set("age", 30);
        user1.set("is_active", true);
        user1.set("inventory_ids", ["inv-1", "inv-2"]);

        const userData = await user1.toJSON();
        expect(userData.name).toBe("Alice");
        expect(userData.age).toBe(30);
        expect(userData.is_active).toBe(true);
        expect(userData.inventory_ids).toEqual(["inv-1", "inv-2"]);
    });

    it('should access related inventories using getMany', async () => {
        // Create inventories first
        const inv1 = InventoryConfigFS.file("inv-1");
        inv1.set("item", ["espada", "escudo"]);

        const inv2 = InventoryConfigFS.file("inv-2");
        inv2.set("item", ["poção", "pergaminho"]);

        // Create user and link inventories
        const user1 = UserConfigFS.file("user-123");
        user1.set("inventory_ids", ["inv-1", "inv-2"]);

        const user1Inventories = await user1.getMany("inventory_ids");
        expect(user1Inventories).toBeDefined();
        expect(user1Inventories!.length).toBe(2);

        const inv1Data = await user1Inventories![0].toJSON();
        expect(inv1Data.item).toEqual(["espada", "escudo"]);

        const inv2Data = await user1Inventories![1].toJSON();
        expect(inv2Data.item).toEqual(["poção", "pergaminho"]);
    });

    it('should get, has, and insert data', async () => {
        const userFile = UserConfigFS.file('user-1');
        //console.log(userFile)
        // Test get
        expect(userFile.get('name')).toBe('New User');

        // Test has
        expect(userFile.has('name')).toBe(true);
        expect(userFile.has('age')).toBe(true);
        expect(userFile.has('is_active')).toBe(true);
        expect(userFile.has('inventory_ids')).toBe(true);
        expect(userFile.has('nonexistent' as any)).toBe(false);

        // Test insert
        userFile.insert('address', { street: '123 Main St' });
        expect(userFile.get('address.street')).toBe('123 Main St');

        await userFile.save();

        const raw = fs.readFileSync(userFile.filePath, 'utf-8');
        const data = JSON.parse(raw);
        expect(data.address.street).toBe('123 Main St');
    });

    it('should demonstrate other ConfigFS manager methods', async () => {
        // Create a user to be copied and deleted
        const user1 = UserConfigFS.file("user-123");
        user1.set("name", "Alice");

        // Copy user-123 to user-456
        UserConfigFS.copy("user-123", "user-456");
        const user2 = UserConfigFS.file("user-456");
        const user2Data = await user2.toJSON();
        expect(user2Data.name).toBe("Alice");

        // Delete user-123
        UserConfigFS.del("user-123");
        expect(fs.existsSync(user1.filePath)).toBe(false); // Check if file is deleted
        const deletedUser = UserConfigFS.file("user-123");
        const deletedUserData = await deletedUser.toJSON();
        expect(deletedUserData.name).toBe("New User"); // Should be default value
    });
});
