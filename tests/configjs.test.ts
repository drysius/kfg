import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { ConfigJS } from "../src/ConfigJS";
import { c } from "../src/factory";
import { envDriver } from "../src/drivers/env-driver";
import * as fs from "fs";
import * as path from "path";

const TEST_ENV_PATH = path.join(__dirname, ".env.configjs.test");

describe("ConfigJS Core Functionality with EnvDriver", () => {
	beforeEach(() => {
		// Clean up the test .env file and process.env variables before each test
		if (fs.existsSync(TEST_ENV_PATH)) {
			fs.unlinkSync(TEST_ENV_PATH);
		}
		delete process.env.DC_TOKEN;
		delete process.env.DISCORD_TOKEN;
		delete process.env.APP_PORT;
	});

	afterEach(() => {
		if (fs.existsSync(TEST_ENV_PATH)) {
			fs.unlinkSync(TEST_ENV_PATH);
		}
	});

	// Verifies that the driver can correctly map an environment variable
	// to a nested property within the configuration schema.
	it("should correctly load a nested property from a .env file", () => {
		fs.writeFileSync(TEST_ENV_PATH, 'DC_TOKEN="env_token"');
		const schema = {
			dc: {
				token: c.string(),
			},
		};

		const config = new ConfigJS(envDriver, schema);
		config.load({ path: TEST_ENV_PATH });

		const token = config.get("dc.token");
		expect(token).toBe("env_token");
	});

	// Verifies that the 'prop' option can be used to map an environment
	// variable with a custom name to a schema property.
	it("should load a property using a custom name via the 'prop' option", () => {
		process.env.DISCORD_TOKEN = "custom_prop_token";
		const schema = {
			dc: {
				token: c.string({ prop: "DISCORD_TOKEN" }),
			},
		};

		const config = new ConfigJS(envDriver, schema);
		config.load({ path: TEST_ENV_PATH });

		expect(config.get("dc.token")).toBe("custom_prop_token");
	});

	// Ensures that if a value is not provided by any external source,
	// the default value specified in the schema is applied.
	it("should apply a default value if the variable is not found", () => {
		const schema = {
			dc: {
				token: c.string({ default: "default_token" }),
			},
		};

		const config = new ConfigJS(envDriver, schema);
		config.load({ path: TEST_ENV_PATH });

		expect(config.get("dc.token")).toBe("default_token");
	});

	// Tests a scenario where the final configuration is a combination of
	// values from the environment and default values from the schema.
	it("should correctly load a mix of sourced values and default values", () => {
		fs.writeFileSync(TEST_ENV_PATH, 'APP_PORT=8080');
		const schema = {
			app: {
				port: c.number({ default: 3000 }),
				name: c.string({ default: "MyApp" }),
			},
			db: {
				host: c.string({ default: "localhost" }),
			},
		};

		const config = new ConfigJS(envDriver, schema);
		config.load({ path: TEST_ENV_PATH });

		const app = config.root("app");
		expect(app).toEqual({ port: 8080, name: "MyApp" });

		const db = config.root("db");
		expect(db).toEqual({ host: "localhost" });
	});

	// Confirms that when a variable is defined in both a .env file and
	// process.env, the value from the .env file is given priority.
	it("should prioritize .env file values over process.env values", () => {
		fs.writeFileSync(TEST_ENV_PATH, 'DC_TOKEN="file_token"');
		process.env.DC_TOKEN = "process_token";
		const schema = {
			dc: {
				token: c.string({ default: "default_token" }),
			},
		};

		const config = new ConfigJS(envDriver, schema);
		config.load({ path: TEST_ENV_PATH });

		expect(config.get("dc.token")).toBe("file_token");
	});

	// Verifies that calling set() not only updates the value in memory
	// but also persists the change to the specified .env file.
	it("should persist a new value to the .env file using set()", () => {
		const schema = {
			app: {
				port: c.number({ default: 8080 }),
			},
		};
		const config = new ConfigJS(envDriver, schema);
		config.load({ path: TEST_ENV_PATH });

		config.set("app.port", 9999);
		expect(config.get("app.port")).toBe(9999);

		const fileContent = fs.readFileSync(TEST_ENV_PATH, "utf-8");
		expect(fileContent).toContain("APP_PORT=9999");
	});

	// Checks the functionality of the `has()` method for both single and
	// multiple properties, confirming it correctly identifies existing and non-existing keys.
	it("should check for single or multiple properties with has()", () => {
		fs.writeFileSync(TEST_ENV_PATH, "APP_PORT=8080");
		const schema = {
			app: {
				port: c.number(),
				name: c.string({ default: "MyApp" }),
				host: c.optional(c.string()), // No value provided
			},
		};

		const config = new ConfigJS(envDriver, schema);
		config.load({ path: TEST_ENV_PATH });

		expect(config.has("app.port")).toBe(true);
		expect(config.has("app.name")).toBe(true);
		expect(config.has("app.host")).toBe(false);
		expect(config.has("app.port", "app.name")).toBe(true);
		expect(config.has("app.port", "app.host")).toBe(false);
		expect(config.has("app.name", "app.port", "app.host")).toBe(false);
	});

	// Ensures that attempting to access configuration values before
	// the configuration has been loaded results in a thrown error.
    it('should throw an error if get() is called before load()', () => {
        const config = new ConfigJS(envDriver, {});
        expect(() => config.get('any.path' as never)).toThrow('[ConfigJS] Config not loaded. Call load() first.');
    });

	// Validates the `only_importants` feature, ensuring that validation is
	// skipped for non-important properties but still enforced for required
	// properties marked as `important: true`.
	it("should skip non-important validations when only_importants is true", () => {
		const schema = {
			app: {
				name: c.string(), // required, but not important
				version: c.string({ important: true }), // required and important
			},
			db: {
				host: c.string({ default: "localhost" }),
			}
		};

		const configFail = new ConfigJS(envDriver, schema);
		expect(() => configFail.load({ path: TEST_ENV_PATH })).toThrow();

		fs.writeFileSync(TEST_ENV_PATH, 'APP_VERSION=1.0.0');

		const configFail2 = new ConfigJS(envDriver, schema);
		expect(() => configFail2.load({ path: TEST_ENV_PATH })).toThrow();

		const configSuccess = new ConfigJS(envDriver, schema);
		configSuccess.load({ path: TEST_ENV_PATH, only_importants: true });
		expect(configSuccess.get('app.version')).toBe('1.0.0');
		expect(configSuccess.has('app.name')).toBe(false);

		if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
		const configFailImportant = new ConfigJS(envDriver, schema);
		expect(() => configFailImportant.load({ path: TEST_ENV_PATH, only_importants: true })).toThrow();
	});
});