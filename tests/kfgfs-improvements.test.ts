import { expect, test, afterAll, beforeAll } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { Kfg } from "../src/kfg";
import { KfgFS } from "../src/kfg-fs";
import { jsonDriver } from "../src/drivers/json-driver";
import { Type } from "@sinclair/typebox";

const TEST_DIR = "kfgfs_test_dir";
const TEST_FILE_RELOAD = "reload_test.json";

const schema = {
	name: Type.String({ default: "default_name" }),
	age: Type.Number({ default: 18 }),
};

beforeAll(() => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR);
});

afterAll(() => {
    if (fs.existsSync(TEST_FILE_RELOAD)) fs.unlinkSync(TEST_FILE_RELOAD);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

test("Kfg reload should reload configuration", () => {
    const kfg = new Kfg(jsonDriver, schema);
    // Write initial file
    fs.writeFileSync(TEST_FILE_RELOAD, JSON.stringify({ name: "Initial", age: 20 }));
    
    kfg.load({ path: TEST_FILE_RELOAD });
    expect(kfg.get("name")).toBe("Initial");

    // Modify file externally
    fs.writeFileSync(TEST_FILE_RELOAD, JSON.stringify({ name: "Reloaded", age: 25 }));
    
    // Reload
    kfg.reload();
    expect(kfg.get("name")).toBe("Reloaded");
    expect(kfg.get("age")).toBe(25);
});

test("Kfg schematic should return schema definition", () => {
    const kfg = new Kfg(jsonDriver, schema);
    kfg.load({ path: TEST_FILE_RELOAD }); // Just to satisfy loaded check if schematic requires it (it doesn't usually require load for schema access, but 'conf' implies getting config schema which is static).
    
    // Actually Kfg.conf/schematic implementation calls getProperty on this.schema.
    // So it doesn't need load(), but my implementation adds "if (!this.loaded) throw".
    // Let's verify that behavior.
    
    const nameSchema = kfg.schematic("name");
    // nameSchema should be the Type.String(...) object or similar from definition
    // In our definition: name: Type.String(...)
    
    expect(nameSchema).toHaveProperty("type", "string");
    expect(nameSchema).toHaveProperty("default", "default_name");
});

test("KfgFS create and exist", () => {
    const kfgFS = new KfgFS(jsonDriver, schema);
    kfgFS.init((id) => path.join(TEST_DIR, `${id}.json`));

    const id = "new_user";
    const filePath = path.join(TEST_DIR, `${id}.json`);

    // Ensure clean state
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    expect(kfgFS.exist(id)).toBe(false);

    // Create
    const instance = kfgFS.create(id, { name: "CreatedUser", age: 30 });
    
    expect(kfgFS.exist(id)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    
    // Verify content
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(content).toEqual({ name: "CreatedUser", age: 30 });
    
    // Verify instance loaded correctly
    expect(instance.get("name")).toBe("CreatedUser");
});

test("KfgFS create should throw if exists", () => {
    const kfgFS = new KfgFS(jsonDriver, schema);
    kfgFS.init((id) => path.join(TEST_DIR, `${id}.json`));
    const id = "existing_user";
    kfgFS.create(id); // create first time
    
    expect(() => {
        kfgFS.create(id);
    }).toThrow();
});
