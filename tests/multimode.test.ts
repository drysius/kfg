import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { Kfg } from "../src/kfg";
import { c } from "../src/factory";
import { JsonDriver, AsyncJsonDriver } from "../src/drivers/json-driver";
import { SqliteDriver, AsyncSqliteDriver } from "../src/drivers/sqlite-driver";
import { KfgDriver } from "../src/kfg-driver";
import * as fs from "fs";
import * as path from "path";

const TEST_DIR = path.join(__dirname, "temp_multimode");
const TEST_DB = path.join(__dirname, "test_multimode.db");

describe("Kfg Multimode Functionality", () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        try {
            if (fs.existsSync(TEST_DB)) {
                fs.unlinkSync(TEST_DB);
            }
        } catch { /* ignore */ }
        fs.mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        try {
            if (fs.existsSync(TEST_DB)) {
                fs.unlinkSync(TEST_DB);
            }
        } catch { /* ignore */ }
    });

    it("should create items and respect hooks in multimode (JsonDriver)", () => {
        const schema = {
            id: c.string(),
            username: c.string(),
            role: c.string({ default: "user" }),
        };

        const kfg = new Kfg(new KfgDriver(JsonDriver.definition), schema, true);
        
        // Hooks
        kfg.on('create', (data) => {
            data.role = "admin"; // Modify before create
            return data;
        });

        const pattern = path.join(TEST_DIR, "users/{id}.json");
        kfg.load({ path: pattern });

        const newUser = { id: "1", username: "alice" };
        kfg.create(newUser);

        expect(kfg.size()).toBe(1);
        expect(kfg.get("1.role")).toBe("admin");
        expect(kfg.get("1.username")).toBe("alice");

        // Verify file existence
        const filePath = path.join(TEST_DIR, "users/1.json");
        expect(fs.existsSync(filePath)).toBe(true);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        expect(content.role).toBe("admin");
    });

    it("should load existing items with {id} pattern (JsonDriver)", () => {
        // Pre-populate files
        const usersDir = path.join(TEST_DIR, "users");
        fs.mkdirSync(usersDir, { recursive: true });
        fs.writeFileSync(path.join(usersDir, "1.json"), JSON.stringify({ id: "1", username: "bob" }));
        fs.writeFileSync(path.join(usersDir, "2.json"), JSON.stringify({ id: "2", username: "charlie" }));

        const schema = {
            id: c.string(),
            username: c.string(),
        };

        const kfg = new Kfg(new KfgDriver(JsonDriver.definition), schema, true);
        kfg.load({ path: path.join(TEST_DIR, "users/{id}.json") });

        expect(kfg.size()).toBe(2);
        expect(kfg.get("1.username")).toBe("bob");
        expect(kfg.get("2.username")).toBe("charlie");
    });

    it("should use where() to scope operations", () => {
        const schema = {
            id: c.string(),
            val: c.number({ default: 0 }),
        };
        const kfg = new Kfg(new KfgDriver(JsonDriver.definition), schema, true);
        kfg.load({ path: path.join(TEST_DIR, "{id}.json") });

        kfg.create({ id: "abc", val: 10 });
        
        const item = kfg.where("abc");
        expect(item.get("val")).toBe(10);
        
        item.set("val", 20);
        expect(kfg.get("abc.val")).toBe(20);

        item.del();
        expect(kfg.has("abc")).toBe(false);
        expect(kfg.size()).toBe(0);
    });

    it("should work with AsyncJsonDriver", async () => {
        const schema = { id: c.string(), data: c.string() };
        const kfg = new Kfg(new KfgDriver(AsyncJsonDriver.definition), schema, true);
        const pattern = path.join(TEST_DIR, "async/{id}.json");
        
        await kfg.load({ path: pattern });
        
        await kfg.create({ id: "test1", data: "async_val" });
        expect(kfg.size()).toBe(1);
        
        const val = await kfg.get("test1.data");
        expect(val).toBe("async_val");
        
        // Reload to check persistence
        const kfg2 = new Kfg(new KfgDriver(AsyncJsonDriver.definition), schema, true);
        await kfg2.load({ path: pattern });
        expect(kfg2.size()).toBe(1);
        expect(await kfg2.get("test1.data")).toBe("async_val");
    });

    it("should work with SqliteDriver in multimode", () => {
        const schema = {
            id: c.string(),
            name: c.string(),
            meta: c.object({
                score: c.number(),
            }),
        };

        let kfg, kfg2, kfg3;
        try {
            kfg = new Kfg(new KfgDriver(SqliteDriver.definition), schema, true);
            kfg.load({ path: TEST_DB, table: "users" });

            kfg.create({ id: "user1", name: "dave", meta: { score: 100 } });

            expect(kfg.size()).toBe(1);
            expect(kfg.get("user1.meta.score")).toBe(100);

            // Update prop
            kfg.set("user1.meta.score", 200);
            expect(kfg.get("user1.meta.score")).toBe(200);
            
            kfg.save(); // Force save to ensure update is persisted before unmount (though unmount should save now)
            kfg.unmount(); // Release DB

            // Check persistence
            kfg2 = new Kfg(new KfgDriver(SqliteDriver.definition), schema, true);
            kfg2.load({ path: TEST_DB, table: "users" });
            expect(kfg2.size()).toBe(1);
            expect(kfg2.get("user1.name")).toBe("dave");
            expect(kfg2.get("user1.meta.score")).toBe(200);

            // Delete
            kfg2.del("user1");
            expect(kfg2.size()).toBe(0);
            
            kfg2.save();
            kfg2.unmount(); // Release DB

            kfg3 = new Kfg(new KfgDriver(SqliteDriver.definition), schema, true);
            kfg3.load({ path: TEST_DB, table: "users" });
            expect(kfg3.size()).toBe(0);
        } finally {
            if (kfg && kfg.driver) try { kfg.unmount(); } catch {}
            if (kfg2 && kfg2.driver) try { kfg2.unmount(); } catch {}
            if (kfg3 && kfg3.driver) try { kfg3.unmount(); } catch {}
        }
    });
    
    it("should run hooks on update and delete", () => {
         const schema = { id: c.string(), key: c.string() };
         const kfg = new Kfg(new KfgDriver(JsonDriver.definition), schema, true);
         kfg.load({ path: path.join(TEST_DIR, "hooks/{id}.json") });
         
         let updateCalled = false;
         let deleteCalled = false;
         
         kfg.on('update', (data, old) => {
             updateCalled = true;
             expect(old.key).toBe("init");
             return data;
         });
         
         kfg.on('delete', (data) => {
             deleteCalled = true;
             expect(data.key).toBe("updated");
             return data;
         });
         
         kfg.create({ id: "1", key: "init" });
         
         // Set whole item to trigger update hook (as per current implementation)
         kfg.set("1", { id: "1", key: "updated" });
         expect(updateCalled).toBe(true);
         expect(kfg.get("1.key")).toBe("updated");
         
         kfg.del("1");
         expect(deleteCalled).toBe(true);
         expect(kfg.size()).toBe(0);
    });
});
