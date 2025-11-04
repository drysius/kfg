import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import { ConfigFS, c, jsonDriver, FileFSConfigJS } from '../src/index';
import { Type } from '@sinclair/typebox';
Type.Unsafe
const TEST_DIR = path.join(__dirname, 'configfs-test-files');
const USER_DIR = path.join(TEST_DIR, 'users');
const INVENTORY_DIR = path.join(TEST_DIR, 'inventory');

const InventorySchema = c.object({
    items: c.array(c.string(), { default: [] }),
});
const UserSchema = c.object({
    name: c.string({ default: 'Test User' }),
    inventory_ids: c.array(c.string(), { default: [] }),
});

const InventoryConfigFS = new ConfigFS(jsonDriver, InventorySchema);
const UserConfigFS = new ConfigFS(jsonDriver, UserSchema);

describe('ConfigFS Core Functionality', () => {
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

    it('should create instance, load defaults, set, and save', async () => {
        const userFile = UserConfigFS.file('user-1');
        await userFile.load(); // Loads defaults from schema
        
        expect(userFile.get('name')).toBe('Test User');

        userFile.set('name', 'New Name');
        await userFile.save();

        expect(fs.existsSync(userFile.filePath)).toBe(true);
        const raw = fs.readFileSync(userFile.filePath, 'utf-8');
        const data = JSON.parse(raw);
        expect(data.name).toBe('New Name');
        // Check if default for other field is also saved
        expect(data.inventory_ids).toEqual([]);
    });

    it('should handle relationships using the public API', async () => {
        // 1. Create and save an inventory item
        const inv1 = InventoryConfigFS.file('inv-1');
        await inv1.load();
        inv1.set('items', ['sword']);
        await inv1.save();

        // 2. Create a user, link inventory, and save
        const userFile = UserConfigFS.file('user-rel');
        await userFile.load();
        userFile.set('inventory_ids', ['inv-1']);
        await userFile.save();

        // 3. Load the user again to get the saved data
        const userToLoad = UserConfigFS.file('user-rel');
        await userToLoad.load();
        const inventoryIds = userToLoad.get('inventory_ids');
        expect(inventoryIds).toEqual(['inv-1']);

        // 4. Manually retrieve the related inventory files
        const inventoryPromises = inventoryIds.map(id => InventoryConfigFS.file(id));
        const inventories = await Promise.all(inventoryPromises);
        
        // 5. Load the inventory data and assert
        await inventories[0].load();
        expect(inventories[0].get('items')).toEqual(['sword']);
    });

    it('should delete files with del()', async () => {
        const userFile = UserConfigFS.file('user-del');
        await userFile.save();
        expect(fs.existsSync(userFile.filePath)).toBe(true);
        UserConfigFS.del('user-del');
        expect(fs.existsSync(userFile.filePath)).toBe(false);
    });
});