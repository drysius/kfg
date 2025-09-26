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

		// `app` object should contain the value from the .env file and a default value
		const app = config.root("app");
		expect(app).toEqual({ port: 8080, name: "MyApp" });

		// `db` object should be fully constructed from default values
		const db = config.root("db");
		expect(db).toEqual({ host: "localhost" });
	});

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

    it('should throw an error if get() is called before load()', () => {
        const config = new ConfigJS(envDriver, {});
        expect(() => config.get('any.path')).toThrow('[ConfigJS] Config not loaded. Call load() first.');
    });
});
