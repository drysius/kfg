# ConfigJS - Simple, Type-Safe Configuration Management

[![npm version](https://badge.fury.io/js/%40caeljs%2Fconfig.svg)](https://badge.fury.io/js/%40caeljs%2Fconfig)

ConfigJS is a robust and 100% type-safe configuration management system for Node.js and Bun applications. It provides a structured way to define, validate, and access environment variables and other configuration sources with the power of TypeScript.

- ✅ **Fully Typed**: Autocomplete and type safety for all your configurations.
- ✅ **Flexible Drivers**: Load configurations from `.env` files, JSON, or create your own driver.
- ✅ **Built-in Validation**: Define rules and formats (email, url, etc.) directly in the schema.
- ✅ **Smart Defaults**: Define defaults that are applied automatically.
- ✅ **Nested Structures**: Organize your configurations logically.

--- 

## 📖 Documentation

- **[Full Usage Guide](./docs/usage.md)**: Learn how to install and use ConfigJS.
- **[Schema Definitions](./docs/schemas.md)**: See all available validators and options.
- **[Creating Drivers](./docs/drivers.md)**: Learn how to load configurations from any source.

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

## License

MIT