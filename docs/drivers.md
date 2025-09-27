# Documentation: Creating Drivers

A **Driver** is the heart of ConfigJS, acting as the bridge between your schema definition and the actual source of your configuration data (e.g., `.env` files, JSON, databases, remote services, etc.).

Creating a custom driver allows you to load configurations from any source you need.

## The `ConfigJSDriver` Class

To create a new driver, you instantiate the `ConfigJSDriver` class, passing a configuration object with the following properties:

- `identify`: A unique name for your driver (used for debugging).
- `async`: A boolean (`true` or `false`) that tells ConfigJS if your driver's methods are asynchronous.
- `config`: An object to store driver-specific settings (e.g., a file path).
- `onLoad`: The main function that reads data from the source and returns it as an object.
- `onSet` (optional): A function that persists a value back to the source.

## Example: A Simple Driver for YAML Files

Let's create a driver that reads configurations from a `config.yaml` file.

```typescript
import { ConfigJSDriver } from "@caeljs/config";
import * as fs from "fs";
import * as yaml from "js-yaml"; // Example, requires a YAML library to be installed

export const yamlDriver = new ConfigJSDriver({
  identify: "yaml-driver",
  async: false, // Our driver will be synchronous
  config: { path: "config.yaml" }, // Default driver configuration

  /**
   * Called when config.load() is executed.
   *
   * @param schema The user's schema definition.
   * @param opts Options passed to `load()`, merged with `this.config`.
   * @returns An object representing the loaded data.
   */
  onLoad(schema, opts) {
    const filePath = opts.path || this.config.path;

    // Build an object with all the defaults defined in the schema
    const defaultData = this.buildDefaultObject(schema);

    let loadedData = {};
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      loadedData = yaml.load(fileContent) as object;
    } catch (e) {
      // If the file doesn't exist or is invalid, we proceed with only the defaults.
    }

    // Merge the defaults with the loaded data (loaded data takes priority)
    const finalData = this.deepMerge(defaultData, loadedData);
    
    return finalData;
  },

  /**
   * Called when config.set() is executed.
   *
   * @param key The property path (e.g., "server.port").
   * @param value The new value.
   */
  onSet(key, value) {
    const filePath = this.config.path;
    // `this.data` in the base class has already been updated.
    // We just need to persist the entire data object.
    const dataToSave = this.data;
    fs.writeFileSync(filePath, yaml.dump(dataToSave));
  },
});
```

### Key Points in `onLoad`

1.  **Defaults First**: It is crucial to first build an object with all the default values defined in your schema. The base driver class provides a helper method for this: `this.buildDefaultObject(schema)`.
2.  **Load Data**: Next, load the data from your source (file, API, etc.).
3.  **Merge**: Perform a deep merge of the defaults with the loaded data. The base class also provides `this.deepMerge(defaults, loaded)`. This ensures that values from your file override the defaults, but the defaults still exist if the file doesn't specify them.
4.  **Return**: Return the final merged object. ConfigJS will then validate and coerce the types of this object.

### Using the Custom Driver

Once defined, using your custom driver is simple:

```typescript
import { ConfigJS } from "@caeljs/config";
import { yamlDriver } from "./my-yaml-driver";

const schema = { /* ... your schema ... */ };

const config = new ConfigJS(yamlDriver, schema);

// You can override the default file path in load
config.load({ path: 'another-config.yaml' });

const myValue = config.get("some.property");
```

## Built-in Drivers

ConfigJS comes with two pre-built drivers for common use cases: `jsonDriver` and `envDriver`.

### `jsonDriver`

The `jsonDriver` loads and saves configuration from a JSON file.

**Default Behavior**

By default, the driver maintains the nested structure of your schema in the JSON file. If you provide a description when using `config.set()`, it will be stored as a sibling property with a `:comment` suffix.

*Example `config.json` output:*
```json
{
  "app": {
    "port:comment": "The application port",
    "port": 3000
  }
}
```

**`keyroot` Option**

The `jsonDriver` has a special configuration option called `keyroot`. When set to `true`, the driver will "flatten" the JSON structure, using dot notation for keys. This can make the configuration file easier to read and edit by hand for complex, deeply nested schemas.

To enable it, pass `{ keyroot: true }` to the `load()` method:
```typescript
config.load({ path: 'my-config.json', keyroot: true });
```

When `keyroot` is enabled, both the configuration keys and their corresponding comments are flattened.

*Example `config.json` output with `keyroot: true`:*
```json
{
  "app.port:comment": "The application port",
  "app.port": 3000
}
```