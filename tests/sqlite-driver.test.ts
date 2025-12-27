import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { sqliteDriver, Kfg, Model, KfgML, c } from "../src";
import * as fs from "node:fs";

const DB_PATH = "test.db";

describe("SqliteDriver", () => {
	beforeEach(() => {
		if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
	});

	afterEach(() => {
		if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
	});

	it("should load and set values in KV table", () => {
		const schema = {
			app: {
				discord: {
					token: c.string({ default: "default-token" }),
				},
			},
		};
		const conf = new Kfg(sqliteDriver, schema);
		conf.load({ path: DB_PATH });

		expect(conf.get("app.discord.token")).toBe("default-token");

		conf.set("app.discord.token", "new-token");
		expect(conf.get("app.discord.token")).toBe("new-token");

		// Reload to check persistence
		const conf2 = new Kfg(sqliteDriver, schema);
		conf2.load({ path: DB_PATH });
		expect(conf2.get("app.discord.token")).toBe("new-token");
	});

	it("should share database connection with parents", () => {
		const parentSchema = { version: c.number({ default: 1 }) };
		const childSchema = { name: c.string({ default: "child" }) };

		const parent = new Kfg(sqliteDriver, parentSchema);
		const child = new Kfg(sqliteDriver, childSchema);

		child.load({
			path: DB_PATH,
			table: "child_settings",
			parents: [parent],
		});

		expect(child.get("name")).toBe("child");
		expect(parent.get("version")).toBe(1);

		parent.set("version", 2);
		
        // Check if both are in the same DB file by reloading
        const parent2 = new Kfg(sqliteDriver, parentSchema);
        parent2.load({ path: DB_PATH });
        expect(parent2.get("version")).toBe(2);
	});

    it("should work with KfgML find", async () => {
        const User = new Model({
            name: 'users',
            schema: {
                name: c.string(),
                age: c.number()
            }
        });

        const ml = new KfgML(sqliteDriver, { models: [User] });
        // Use ml.driver instance
        ml.driver.load({}, { path: DB_PATH });

        // Ensure table exists by calling find once
        User.find({ id: 'non-existent' });

        // Simulate creating data in KV for ML
        const db = (ml.driver as any)._db;
        db.exec(`INSERT INTO users (key, "group", type, value) VALUES ('name', '1', 'string', 'Alice')`);
        db.exec(`INSERT INTO users (key, "group", type, value) VALUES ('age', '1', 'number', '30')`);

        const user = User.find({ name: 'Alice' }) as any;
        expect(user).toBeDefined();
        expect(user.get('name')).toBe('Alice');
        expect(user.get('age')).toBe(30);
        expect(((await user.toJSON()) as any).id).toBe('1');
    });
});
