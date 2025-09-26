# Documentation: Schema Definitions

The power of ConfigJS comes from its ability to define a clear, typed schema for your configuration. This is done using the `c` helper.

## Basic Types

The most common types for configuration values.

### `c.string(options?)`

Defines a property of type `string`.

```typescript
{
  host: c.string({ default: "localhost" })
}
```

### `c.number(options?)`

Defines a property of type `number`. The `envDriver` will automatically coerce strings to numbers.

```typescript
{
  port: c.number({ default: 3000 })
}
```

### `c.boolean(options?)`

Defines a property of type `boolean`. The `envDriver` will coerce the string `"true"` (case-insensitive) to `true` and any other value to `false`.

```typescript
{
  enable_tls: c.boolean({ default: false })
}
```

## Structured Types

### `c.object(properties, options?)`

Defines a nested object. The first argument is an object containing the definition of the sub-properties.

```typescript
{
  server: c.object({
    host: c.string({ default: "localhost" }),
    port: c.number({ default: 80 })
  })
}
```

### `c.array(items, options?)`

Defines an array of a specific type.

```typescript
{
  admins: c.array(c.string(), { default: [] })
}
```

### `c.enum(values, options?)`

Defines a property that must be one of the values from a list.

```typescript
{
  env: c.enum(["development", "production"], { default: "development" })
}
```

## Common Options

All `c` helper functions accept an options object to add metadata.

### `default: <value>`

Defines a default value to be used if no value is provided by the driver's source.

```typescript
{
  port: c.number({ default: 3000 })
}
```

### `prop: <string>`

Specifies a custom name for the environment variable. By default, the `envDriver` converts the object path (e.g., `database.connectionString`) to `DATABASE_CONNECTION_STRING`.

```typescript
{
  // Will read the `DB_URL` environment variable instead of `DATABASE_URL`
  database: {
      url: c.string({ prop: "DB_URL" })
  }
}
```

## Special Formats

ConfigJS includes helpers for common string formats, which are automatically validated.

- `c.ip()`
- `c.ipv6()`
- `c.email()`
- `c.url()`

```typescript
{
  admin_email: c.email()
}
```