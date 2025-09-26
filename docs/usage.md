# Documentation: Using ConfigJS

This page covers how to install, configure, and use ConfigJS in your project.

## Installation

To get started, add the package to your project:

```bash
npm install @caeljs/config
# or using yarn
yarn add @caeljs/config
# or using bun
bun add @caeljs/config
```

## Step 1: Define Your Schema

The centerpiece of ConfigJS is the **schema**. You define it using a plain object, where the keys represent your configuration structure and the values are type validators from `c` (an exported helper).

```typescript
// config/schema.ts
import { c } from "@caeljs/config";

export const AppSchema = {
  env: c.enum(["development", "production", "staging"], {
    prop: "NODE_ENV", // Reads from the NODE_ENV environment variable
    default: "development",
  }),
  server: {
    host: c.string({ default: "0.0.0.0" }),
    port: c.number({ default: 3000 }),
  },
  database: {
    url: c.string({ prop: "DATABASE_URL" }), // Required, no default
  },
};
```

> 💡 **Tip:** For more details on all available schema types, see the [Schema Definitions](./schemas.md) guide.

## Step 2: Choose a Driver

A **driver** is responsible for reading and writing your configuration from/to a specific source (e.g., `.env` files, JSON files, etc.).

ConfigJS comes with two drivers ready to use:

- `envDriver`: Reads from environment variables (`process.env`) and a `.env` file.
- `jsonDriver`: Reads from a `config.json` file.

## Step 3: Create and Load Your Instance

Now, combine the schema and driver to create an instance of `ConfigJS`. It is good practice to create a single file to export your already-loaded configuration instance.

```typescript
// config/index.ts
import { ConfigJS } from "@caeljs/config";
import { envDriver } from "@caeljs/config/drivers"; // Import the desired driver
import { AppSchema } from "./schema";

// Create the instance
const config = new ConfigJS(envDriver, AppSchema);

// Load the values
// For async drivers, use `await config.load()`
config.load();

export default config;
```

The `.load()` method instructs the driver to read values from its source (e.g., `.env` file), validate them against the schema, apply defaults and type coercion, and prepare the configuration for use.

## Step 4: Use Your Configuration

With the exported instance, you can import it anywhere in your application to safely access your values.

```typescript
// server.ts
import config from "./config";

const port = config.get("server.port");
const dbUrl = config.get("database.url");

console.log(`Server running on http://${config.get("server.host")}:${port}`);

if (config.get("env") === "production") {
  console.log("Running in production mode!");
}
```

### Main API

- `config.get(path)`: Returns the value of a property. The path uses dot notation to access nested values (e.g., `"server.port"`).
- `config.has(path)`: Returns `true` if the property exists.
- `config.root(path)`: Returns an entire object from the specified path.
- `config.set(path, value)`: Changes a value at runtime and persists it (if the driver supports it).
- `config.insert(path, object)`: Merges an object into an existing property.

> 💡 **Tip:** To learn how to create your own loading logic, see the [Creating Drivers](./drivers.md) guide.