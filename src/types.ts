import type { TSchema, Static } from '@sinclair/typebox';

// Helper type for conditional types
export type If<Condition extends boolean, TrueType, FalseType> = Condition extends true ? TrueType : FalseType;

// Generic type for a configuration schema, which can be any TypeBox schema
export type ConfigSchema = TSchema;

// Type for the inferred static type of a ConfigSchema
export type ConfigType<T extends ConfigSchema> = Static<T>;

// Interface for a configuration driver
export interface ConfigDriver<IsAsync extends boolean, TConfig extends object = {}> {
  readonly async: IsAsync;
  // Loads configuration data based on a schema
  load<T extends ConfigSchema>(schema: T, config: TConfig): If<IsAsync, Promise<ConfigType<T>>, ConfigType<T>>;
  // Saves configuration data
  save<T extends ConfigSchema>(data: ConfigType<T>, schema: T, config: TConfig): If<IsAsync, Promise<void>, void>;
}