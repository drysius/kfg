import { expect, test, afterAll } from "bun:test";
import * as fs from "node:fs";
import { Kfg } from "../src/kfg";
import { jsonDriver } from "../src/drivers/json-driver";
import { Type } from "@sinclair/typebox";

const TEST_CONFIG_PATH_1 = "test-config-1.json";
const TEST_CONFIG_PATH_2 = "test-config-2.json";

const schema = {
	server: Type.Object({
		port: Type.Number({ default: 3000 }),
		host: Type.String({ default: "localhost" }),
	}),
	feature: Type.Optional(Type.String()),
};

test("Kfg instances should clone the driver and have independent state", () => {
	// Setup: create a driver instance (conceptually shared variable)
	// We modify the config path for each Kfg instance via load options to keep files separate,
    // but the critical part is that the driver *instance* memory state shouldn't leak.
    
    // Actually, to test memory leak properly:
    // If we use the SAME file, they naturally see the same data if they reload.
    // We want to test IN-MEMORY isolation.
    
    const driver = jsonDriver; // The global const
    
    const kfg1 = new Kfg(driver, schema);
    const kfg2 = new Kfg(driver, schema);

    // Initialize with different files to avoid FS interference
    kfg1.load({ path: TEST_CONFIG_PATH_1 });
    kfg2.load({ path: TEST_CONFIG_PATH_2 });

    // Modify kfg1 in memory via inject
    kfg1.inject({
        server: { port: 8080 }
    });

    // Check kfg1
    expect(kfg1.get("server.port")).toBe(8080);

    // Check kfg2 - should still be default because kfg2's driver should be a different instance
    // If it wasn't cloned, kfg2.driver would be the SAME object as kfg1.driver,
    // and kfg1.inject would have modified the shared data object.
    expect(kfg2.get("server.port")).toBe(3000);
});

test("Kfg inject should merge data deeply", () => {
    const kfg = new Kfg(jsonDriver, schema);
    kfg.load({ path: TEST_CONFIG_PATH_1 }); // Reusing file is fine here, we overwrite memory

    kfg.inject({
        server: { host: "127.0.0.1" }
    });

    // Port should remain default, Host changed
    expect(kfg.get("server.port")).toBe(3000); // Default, or 8080 if previous test persisted?
    // Wait, kfg1.inject in previous test modified kfg1.driver.data.
    // Does inject persist to disk? Our implementation of inject does NOT call save/set explicitly.
    // It only merges into this.driver.data.
    // So if kfg1 didn't call set(), the file TEST_CONFIG_PATH_1 should be empty/default.
    
    expect(kfg.get("server.host")).toBe("127.0.0.1");
});

afterAll(() => {
    if (fs.existsSync(TEST_CONFIG_PATH_1)) fs.unlinkSync(TEST_CONFIG_PATH_1);
    if (fs.existsSync(TEST_CONFIG_PATH_2)) fs.unlinkSync(TEST_CONFIG_PATH_2);
});
