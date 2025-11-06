import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import { KfgFS, c, cfs, jsonDriver } from '../src/index';

const TEST_DIR = path.join(__dirname, 'Kfg-test-files');
const USER_DIR = path.join(TEST_DIR, 'users');
const INVENTORY_DIR = path.join(TEST_DIR, 'inventory');

// 1. Define o Kfg para Inventário
const InventoryKfgFS = new KfgFS(jsonDriver, {
    item: c.array(c.string(), { default: [], description: "Lista de itens no inventário" }),
    location: c.string({ default: "warehouse", description: "Localização do inventário" }),
}, { only_importants: true });

const UserSchema = {
    name: c.string({ default: "New User", description: "Nome do usuário" }),
    age: c.number({ default: 18, description: "Idade do usuário" }),
    is_active: c.boolean({ default: true, description: "Status de atividade do usuário" }),
    inventory_ids: cfs.many(InventoryKfgFS, {
        default: [],
        description: "Lista de IDs de inventário pertencentes ao usuário",
    }),
    address: {
        street: c.string({ default: '' }),
        city: c.string({ default: '' }),
    },
};

const UserKfg = new KfgFS(jsonDriver, UserSchema, { only_importants: true });

const USER_PROFILE_DIR = path.join(TEST_DIR, 'user-profiles');

const UserProfileSchema = {
    user_id: c.string({ description: "ID do usuário" }),
    bio: c.string({ default: "", description: "Biografia do usuário" }),
    user: cfs.join(UserKfg, { fk: 'user_id' }),
};

const UserProfileKfg = new KfgFS(jsonDriver, UserProfileSchema, { only_importants: true });

describe('Kfg v2', () => {
    beforeEach(async () => {
        if (fs.existsSync(TEST_DIR)) {
            await fsp.rm(TEST_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(USER_DIR, { recursive: true });
        fs.mkdirSync(INVENTORY_DIR, { recursive: true });
        fs.mkdirSync(USER_PROFILE_DIR, { recursive: true });
        InventoryKfgFS.init((id) => path.join(INVENTORY_DIR, `${id}.json`));
        UserKfg.init((id) => path.join(USER_DIR, `${id}.json`));
        UserProfileKfg.init((id) => path.join(USER_PROFILE_DIR, `${id}.json`));
    });

    afterAll(async () => {
        if (fs.existsSync(TEST_DIR)) {
            await fsp.rm(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('should create and manage inventory items', async () => {
        const inv1 = InventoryKfgFS.file("inv-1");
        inv1.set("item", ["espada", "escudo"]);
        inv1.set("location", "arsenal");

        const inv2 = InventoryKfgFS.file("inv-2");
        inv2.set("item", ["poção", "pergaminho"]);

        const inv1Data = await inv1.toJSON();
        expect(inv1Data.item).toEqual(["espada", "escudo"]);
        expect(inv1Data.location).toBe("arsenal");

        const inv2Data = await inv2.toJSON();
        expect(inv2Data.item).toEqual(["poção", "pergaminho"]);
        expect(inv2Data.location).toBe("warehouse"); // Default value
    });

    it('should create and manage a user with relationships', async () => {
        const user1 = UserKfg.file("user-123");
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
        const inv1 = InventoryKfgFS.file("inv-1");
        inv1.set("item", ["espada", "escudo"]);

        const inv2 = InventoryKfgFS.file("inv-2");
        inv2.set("item", ["poção", "pergaminho"]);

        // Create user and link inventories
        const user1 = UserKfg.file("user-123");
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
        const userFile = UserKfg.file('user-1');
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

    it('should demonstrate other Kfg manager methods', async () => {
        // Create a user to be copied and deleted
        const user1 = UserKfg.file("user-123");
        user1.set("name", "Alice");

        // Copy user-123 to user-456
        UserKfg.copy("user-123", "user-456");
        const user2 = UserKfg.file("user-456");
        const user2Data = await user2.toJSON();
        expect(user2Data.name).toBe("Alice");

        // Delete user-123
        UserKfg.del("user-123");
        expect(fs.existsSync(user1.filePath)).toBe(false); // Check if file is deleted
        const deletedUser = UserKfg.file("user-123");
        const deletedUserData = await deletedUser.toJSON();
        expect(deletedUserData.name).toBe("New User"); // Should be default value
    });

    it('should create and manage a user profile with a joined user', async () => {
        const user1 = UserKfg.file("user-123");
        user1.set("name", "Alice");
        user1.set("age", 30);
        await user1.save();

        const userProfile1 = UserProfileKfg.file("profile-456");
        userProfile1.set("user_id", "user-123");
        userProfile1.set("bio", "Software Engineer");
        await userProfile1.save();

        const userProfileData = await userProfile1.toJSON();
        expect(userProfileData.user_id).toBe("user-123");
        expect(userProfileData.bio).toBe("Software Engineer");

        const joinedUser = await userProfile1.getJoin("user");
        expect(joinedUser).toBeDefined();
        expect(joinedUser!.get('name')).toBe("Alice");
        expect(joinedUser!.get('age')).toBe(30);
    });
});
