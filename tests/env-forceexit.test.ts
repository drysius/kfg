import { describe, it, expect } from "bun:test";
import { EnvDriver } from "../src/drivers/env-driver";

describe("EnvDriver forceexit defaults", () => {
	it("should enable forceExit by default", () => {
		const driver = new EnvDriver();
		expect(driver.forceExit).toBe(true);
	});

	it("should allow disabling forceExit", () => {
		const driver = new EnvDriver({ forceexit: false });
		expect(driver.forceExit).toBe(false);
	});
});
