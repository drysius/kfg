import { describe, it, expect, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { c } from "../src/factory";
import { ConfigJS } from "../src/ConfigJS";
import { jsonDriver } from "../src/drivers/json-driver";
import { envDriver } from "../src/drivers/env-driver";

const TEST_JSON_PATH = "test-config.json";
const TEST_ENV_PATH = ".env.test";

// Cleanup test files
afterAll(() => {
	if (fs.existsSync(TEST_JSON_PATH)) {
		fs.unlinkSync(TEST_JSON_PATH);
	}
	if (fs.existsSync(TEST_ENV_PATH)) {
		fs.unlinkSync(TEST_ENV_PATH);
	}
});

describe("Factory: c", () => {
	describe("Schema Creation", () => {
		it("should create a string schema with a default value", () => {
			const schema = c.String({ default: "hello" });
			expect(schema.type).toBe("string");
			expect(schema.default).toBe("hello");
		});

		it("should create a number schema with a default value", () => {
			const schema = c.Number({ default: 123 });
			expect(schema.type).toBe("number");
			expect(schema.default).toBe(123);
		});

		it("should create a boolean schema with a default value", () => {
			const schema = c.Boolean({ default: true });
			expect(schema.type).toBe("boolean");
			expect(schema.default).toBe(true);
		});

		it("should create an object schema with a default value", () => {
			const schema = c.Object(
				{ id: c.Number() },
				{ default: { id: 1 } },
			);
			expect(schema.type).toBe("object");
			expect(schema.default).toEqual({ id: 1 });
		});

		it("should create an array schema with a default value", () => {
			const schema = c.Array(c.String(), { default: ["a", "b"] });
			expect(schema.type).toBe("array");
			expect(schema.default).toEqual(["a", "b"]);
		});

		it("should create a record schema with a default value", () => {
			const schema = c.Record(c.String(), c.Number(), {
				default: { key: 123 },
			});
			expect(schema.type).toBe("object");
			expect(schema.default).toEqual({ key: 123 });
		});

		it("should handle Enum with string array and a default value", () => {
			const schema = c.Enum(["admin", "user"], { default: "user" });
			expect(schema.anyOf).toHaveLength(2);
			expect(schema.default).toBe("user");
		});

		it("should handle Enum with a const string array", () => {
			const ROLES = ["admin", "user"] as const;
			const schema = c.Enum(ROLES, { default: "admin" });
			expect(schema.anyOf).toHaveLength(2);
			expect(schema.anyOf[0].const).toBe("admin");
			expect(schema.default).toBe("admin");
		});

		it("should handle Enum with a numeric enum", () => {
			enum Status {
				Active = 1,
				Inactive = 0,
			}
			const schema = c.Enum(Status, { default: Status.Active });
			expect(schema.anyOf).toHaveLength(2);
			expect(schema.anyOf.map((item) => item.const).sort()).toEqual([0, 1]);
			expect(schema.default).toBe(1);
		});

		it("should handle Enum with a string enum", () => {
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

		it("should create IP, Email, and URL schemas with defaults", () => {
			const ipSchema = c.IP({ default: "127.0.0.1" });
			const emailSchema = c.Email({ default: "test@example.com" });
			const urlSchema = c.URL({ default: "https://example.com" });

			expect(ipSchema.format).toBe("ipv4");
			expect(ipSchema.default).toBe("127.0.0.1");

			expect(emailSchema.format).toBe("email");
			expect(emailSchema.default).toBe("test@example.com");

			expect(urlSchema.format).toBe("uri");
			expect(urlSchema.default).toBe("https://example.com");
		});
	});

	describe("Integration with Drivers", () => {
		describe("JsonDriver", () => {
			it("should load default values when config file is missing", () => {
				const schema = {
					port: c.Number({ default: 3000 }),
					name: c.String({ default: "MyApp" }),
				};
				const config = new ConfigJS(jsonDriver, schema);
				config.load({ path: TEST_JSON_PATH });

				expect(config.get("port")).toBe(3000);
				expect(config.get("name")).toBe("MyApp");
			});

			it("should load values from the json file", () => {
				fs.writeFileSync(TEST_JSON_PATH, JSON.stringify({ port: 8080, name: "MyTestApp" }));
				const schema = {
					port: c.Number({ default: 3000 }),
					name: c.String({ default: "MyApp" }),
				};
				const config = new ConfigJS(jsonDriver, schema);
				config.load({ path: TEST_JSON_PATH });

				expect(config.get("port")).toBe(8080);
				expect(config.get("name")).toBe("MyTestApp");
			});
		});

		describe("EnvDriver", () => {
			it("should load default values when .env file is missing", () => {
				const schema = {
					PORT: c.Number({ default: 3000 }),
					APP_NAME: c.String({ default: "MyApp" }),
				};
				const config = new ConfigJS(envDriver, schema);
				config.load({ path: TEST_ENV_PATH });

				expect(config.get("PORT")).toBe(3000);
				expect(config.get("APP_NAME")).toBe("MyApp");
			});

			it("should load values from the .env file", () => {
				fs.writeFileSync(TEST_ENV_PATH, "PORT=8080\nAPP_NAME=MyTestApp");
				const schema = {
					port: c.Number({ default: 3000 }),
					app: {
						name:c.String({ default: "MyApp" })
					},
				};
				const config = new ConfigJS(envDriver, schema);
				config.load({ path: TEST_ENV_PATH });

				expect(config.get("port")).toBe(8080);
				expect(config.get("app.name")).toBe("MyTestApp");
			});
		});
	});
});
