import * as fs from "node:fs";
import { Kfg } from "./src/kfg";
import { JsonDriver } from "./src/drivers/json-driver";
import { EnvDriver } from "./src/drivers/env-driver";
import { c } from "./src/factory";

const schema = {
    server: {
        host: c.string({ default: "localhost", description: "The server host" }),
        port: c.number({ default: 3000, description: "The server port" }),
        ssl: c.boolean({ default: false })
    },
    database: {
        url: c.string({ description: "Database connection URL" }),
        pool: {
            min: c.number({ default: 1 }),
            max: c.number({ default: 10 })
        }
    },
    apiKey: c.string({ default: "default-key" }),
    features: c.array(c.string(), { default: ["api"] })
};

const exampleJsonPath = "config.example.json";
const exampleEnvPath = ".env.example";
const requiredEnvKey = "KFG_EXAMPLE_REQUIRED_SECRET_9F2A";
delete process.env[requiredEnvKey];

// Force an invalid JSON file to demonstrate friendly validation errors.
fs.writeFileSync(
    exampleJsonPath,
    JSON.stringify({ server: { host: "localhost", port: 3000, ssl: false } }, null, 2),
);

// Initialize Kfg with a JSON driver
const config = new Kfg(new JsonDriver({ path: exampleJsonPath, keyroot:true }), schema);

try {
    // 1. Load configuration
    console.log("Loading configuration...");
    config.load();config.has('features', 'database')

    // 2. Access data (Type-safe!)
    console.log(`Server running on ${config.config.server.host}:${config.config.server.port}`);
    console.log("Features:", config.get('features'));

    // 3. Modify and Save
    console.log("Updating port to 8080...");
    config.set("server.port", 8080, "Updated port for production");
    // 4. Verify update
    console.log("New port:", config.config.server.port);

} catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
}

// Example with Env Driver for .env files
// Force an env file without a required variable to demonstrate env validation errors.
fs.writeFileSync(exampleEnvPath, "DEBUG=false\nAPP_NAME=MyApp\n");

const envConfig = new Kfg(new EnvDriver({ path: exampleEnvPath }), {
    app_name: c.string({ default: "MyApp" }),
    debug: c.boolean({ default: true }),
    required_secret: c.string({ prop: requiredEnvKey }),
});

try {
    console.log("\nLoading Env config...");
    envConfig.load();
    console.log("App Name:", envConfig.get('app_name'));
    console.log("Debug Mode:", envConfig.config.debug);
    
    // Updating .env
    envConfig.set("debug", false);
    console.log("Debug Mode updated to:", envConfig.config.debug);
} catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
}
