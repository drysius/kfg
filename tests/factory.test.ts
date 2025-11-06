import { describe, it, expect, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { c } from "../src/factory";
import { Kfg } from "../src/kfg";
import { jsonDriver } from "../src/drivers/json-driver";
import { envDriver } from "../src/drivers/env-driver";

const TEST_JSON_PATH = "test-config.json";
const TEST_ENV_PATH = ".env.test";

// Clean up test files after all tests in this file have run.
afterAll(() => {
	if (fs.existsSync(TEST_JSON_PATH)) {
		fs.unlinkSync(TEST_JSON_PATH);
	}
	if (fs.existsSync(TEST_ENV_PATH)) {
		fs.unlinkSync(TEST_ENV_PATH);
	}
});

describe("Schema Factory: c", () => {
	// This suite verifies that the `c` helper functions correctly create
	// the underlying TypeBox schema objects with the expected properties.
	describe("Unit Tests for Schema Creation", () => {
		// Tests the c.String helper for creating a string schema.
		it("should create a string schema with a default value", () => {
			const schema = c.String({ default: "hello" });
			expect(schema.type).toBe("string");
			expect(schema.default).toBe("hello");
		});

		// Tests the c.Number helper for creating a number schema.
		it("should create a number schema with a default value", () => {
			const schema = c.Number({ default: 123 });
			expect(schema.type).toBe("number");
			expect(schema.default).toBe(123);
		});

		// Tests the c.Boolean helper for creating a boolean schema.
		it("should create a boolean schema with a default value", () => {
			const schema = c.Boolean({ default: true });
			expect(schema.type).toBe("boolean");
			expect(schema.default).toBe(true);
		});

		// Tests the c.Object helper for creating an object schema.
		it("should create an object schema with a default value", () => {
			const schema = c.Object(
				{ id: c.Number() },
				{ default: { id: 1 } },
			);
			expect(schema.type).toBe("object");
			expect(schema.default).toEqual({ id: 1 });
		});

		// Tests the c.Array helper for creating an array schema.
		it("should create an array schema with a default value", () => {
			const schema = c.Array(c.String(), { default: ["a", "b"] });
			expect(schema.type).toBe("array");
			expect(schema.default).toEqual(["a", "b"]);
		});

		// Tests the c.Record helper for creating a record/map schema.
		it("should create a record schema with a default value", () => {
			const schema = c.Record(c.String(), c.Number(), {
				default: { key: 123 },
			});
			expect(schema.type).toBe("object");
			expect(schema.default).toEqual({ key: 123 });
		});

		// Tests creating a union schema from a simple array of strings.
		it("should create an enum schema from a string array", () => {
			const schema = c.Enum(["admin", "user"], { default: "user" });
			expect(schema.anyOf).toHaveLength(2);
			expect(schema.default).toBe("user");
		});

		// Tests creating a union schema from a const-asserted array.
		it("should create an enum schema from a const string array", () => {
			const ROLES = ["admin", "user"] as const;
			const schema = c.Enum(ROLES, { default: "admin" });
			expect(schema.anyOf).toHaveLength(2);
			expect(schema.anyOf[0].const).toBe("admin");
			expect(schema.default).toBe("admin");
		});

		// Tests creating a union schema from a numeric TypeScript enum.
		it("should create an enum schema from a numeric TypeScript enum", () => {
			enum Status {
				Active = 1,
				Inactive = 0,
			}
			const schema = c.Enum(Status, { default: Status.Active });
			expect(schema.anyOf).toHaveLength(2);
			expect(schema.anyOf.map((item) => item.const).sort()).toEqual([0, 1]);
			expect(schema.default).toBe(1);
		});

		// Tests creating a union schema from a string-based TypeScript enum.
		it("should create an enum schema from a string TypeScript enum", () => {
			enum Role {
				Admin = "ADMIN",
				User = "USER",
			}
			const schema = c.Enum(Role, { default: Role.User });
			expect(schema.anyOf).toHaveLength(2);
			expect(schema.anyOf.map((item) => item.const).sort()).toEqual([
				"ADMIN",
				"USER",
			]);
			expect(schema.default).toBe("USER");
		});

		// Verifies helpers for creating string schemas with specific formats (ipv4, email, uri).
		it("should create schemas with special string formats", () => {
			const ipSchema = c.ip({ default: "127.0.0.1" });
			const emailSchema = c.email({ default: "test@example.com" });
			const urlSchema = c.url({ default: "https://example.com" });

			expect(ipSchema.format).toBe("ipv4");
			expect(ipSchema.default).toBe("127.0.0.1");

			expect(emailSchema.format).toBe("email");
			expect(emailSchema.default).toBe("test@example.com");

			expect(urlSchema.format).toBe("uri");
			expect(urlSchema.default).toBe("https://example.com");
		});

		// Tests the c.Random helper for creating a random number schema.
		it("should create a random number schema with correct properties", () => {
			const schema = c.Random({ max: 500 });
			expect(schema.type).toBe("number");
			expect(schema[Symbol.for("isRandom")]).toBe(true);
			expect(schema.max).toBe(500);
		});
	});

	// This suite verifies that the schemas created by the factory work correctly
	// when used with the main Kfg class and real drivers.
	describe("Integration with Drivers", () => {
		describe("JsonDriver", () => {
			// Ensures that default values from a schema are loaded when the JSON file is missing.
			it("should load default values when config file is missing", () => {
				const schema = {
					port: c.number({ default: 3000 }),
					name: c.string({ default: "MyApp" }),
				};
				const config = new Kfg(jsonDriver, schema);
				config.load({ path: TEST_JSON_PATH });

				expect(config.get("port")).toBe(3000);
				expect(config.get("name")).toBe("MyApp");
			});

			// Ensures that values from a JSON file override the schema's default values.
			it("should load values from the json file over defaults", () => {
				fs.writeFileSync(TEST_JSON_PATH, JSON.stringify({ port: 8080, name: "MyTestApp" }));
				const schema = {
					port: c.number({ default: 3000 }),
					name: c.string({ default: "MyApp" }),
				};
				const config = new Kfg(jsonDriver, schema);
				config.load({ path: TEST_JSON_PATH });

				expect(config.get("port")).toBe(8080);
				expect(config.get("name")).toBe("MyTestApp");
			});
		});

		describe("EnvDriver", () => {
			// Ensures that default values from a schema are loaded when the .env file is missing.
			it("should load default values when .env file is missing", () => {
				const schema = {
					port: c.number({ default: 3000 }),
					appName: c.string({ default: "MyApp", prop: "APP_NAME" }),
				};
				const config = new Kfg(envDriver, schema);
				config.load({ path: TEST_ENV_PATH });

				expect(config.get("port")).toBe(3000);
				expect(config.get("appName")).toBe("MyApp");
			});

			// Ensures that values from a .env file override the schema's default values.
			it("should load values from the .env file over defaults", () => {
				fs.writeFileSync(TEST_ENV_PATH, "PORT=8080\nAPP_NAME=MyTestApp");
				const schema = {
					port: c.number({ default: 3000 }),
					app: {
						name:c.string({ default: "MyApp", prop: "APP_NAME" })
					},
				};
				const config = new Kfg(envDriver, schema);
				config.load({ path: TEST_ENV_PATH });

				expect(config.get("port")).toBe(8080);
				expect(config.get("app.name")).toBe("MyTestApp");
			});
		});
	});
});
