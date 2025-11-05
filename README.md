# ConfigJS - Simple, Type-Safe Configuration Management

[![npm version](https://badge.fury.io/js/%40caeljs%2Fconfig.svg)](https://badge.fury.io/js/%40caeljs%2Fconfig)
[![Documentation](https://github.com/drylian/configjs/actions/workflows/docs.yml/badge.svg)](https://drylian.github.io/configjs/)

ConfigJS is a robust and 100% type-safe configuration management system for Node.js and Bun applications. It provides a structured way to define, validate, and access environment variables and other configuration sources with the power of TypeScript.

- ✅ **Fully Typed**: Autocomplete and type safety for all your configurations.
- ✅ **Flexible Drivers**: Load configurations from `.env` files, JSON, or create your own driver.
- ✅ **Built-in Validation**: Define rules and formats (email, url, etc.) directly in the schema.
- ✅ **Smart Defaults**: Define defaults that are applied automatically.
- ✅ **Nested Structures**: Organize your configurations logically.
- ✅ **File-based Configuration**: Manage configurations across multiple files with `ConfigFS`.
- ✅ **Relations**: Create one-to-one and one-to-many relations between configurations.

--- 

## 📖 Documentation

- **[Full Usage Guide](https://drylian.github.io/configjs/)**: Learn how to install and use ConfigJS.

## Installation

```bash
npm install @caeljs/config
# or
yarn add @caeljs/config
# or
bun add @caeljs/config
```

## Quick Example

**1. Define your schema (`schema.ts`):**

```typescript
import { c } from "@caeljs/config";

export const AppSchema = {
  server: {
    host: c.string({ default: "0.0.0.0" }),
    port: c.number({ default: 3000 }),
  },
  database: {
    url: c.string({ prop: "DATABASE_URL" }), // Reads from the DATABASE_URL environment variable
  },
};
```

**2. Create and load your instance (`config.ts`):**

```typescript
import { ConfigJS } from "@caeljs/config";
import { envDriver } from "@caeljs/config/drivers";
import { AppSchema } from "./schema";

const config = new ConfigJS(envDriver, AppSchema);
config.load(); // Loads values from .env and process.env

export default config;
```

**3. Use it anywhere (`index.ts`):**

```typescript
import config from "./config";

const port = config.get("server.port"); // Inferred as `number`
const dbUrl = config.get("database.url"); // Inferred as `string`

console.log(`Server running on port ${port}`);

// Type Error! TypeScript prevents incorrect assignments.
// config.set("server.port", "not-a-number");
```

## File-based Configuration with `ConfigFS`

`ConfigFS` allows you to manage configurations across multiple files, which is useful for managing configurations for different users, tenants, or environments.

**1. Define your schemas:**

```typescript
import { ConfigFS, c, cfs, jsonDriver } from "@caeljs/config";

const inventory = new ConfigFS(jsonDriver, {
    items: c.array(c.string()),
});

const user = new ConfigFS(jsonDriver, {
    name: c.string(),
    inventory_ids: cfs.many(inventory),
});
```

**2. Initialize `ConfigFS`:**

```typescript
inventory.init((id) => `resources/inventory/${id}.json`);
user.init((id) => `resources/users/${id}.json`);
```

**3. Use it:**

```typescript
const user1 = user.file("user-1");
user1.set("name", "Alice");

const inv1 = inventory.file("inv-1");
inv1.set("items", ["sword", "shield"]);

user1.set("inventory_ids", [inv1]);

const user1Inventories = await user1.getMany("inventory_ids");
```

## License

MIT