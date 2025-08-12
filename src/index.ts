import { type TSchema, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ConfigDriver, If } from './types';

export class Config<T extends TSchema, IsAsync extends boolean, TConfig extends object = {}> {
  private _data: Static<T>;
  private driver: ConfigDriver<IsAsync, TConfig>;
  private driverConfig: TConfig;
  private schema: T;

  constructor(driver: ConfigDriver<IsAsync, TConfig>, driverConfig: TConfig, schema: T) {
    this.driver = driver;
    this.driverConfig = driverConfig;
    this.schema = schema;
    this._data = Value.Create(this.schema); // Use Value.Create for initial data
  }

  /**
   * Loads the configuration data using the configured driver.
   * @returns The loaded configuration data.
   */
  public load(): If<IsAsync, Promise<Static<T>>, Static<T>> {
    const loadedData = this.driver.load(this.schema, this.driverConfig);
    if (this.driver.async) {
      return (loadedData as Promise<Static<T>>).then(data => {
        this._data = Value.Cast(this.schema, data);
        return this._data;
      }) as If<IsAsync, Promise<Static<T>>, Static<T>>;
    } else {
      this._data = Value.Cast(this.schema, loadedData as Static<T>);
      return this._data as If<IsAsync, Promise<Static<T>>, Static<T>>;
    }
  }

  /**
   * Saves the current configuration data using the configured driver.
   */
  public save(): If<IsAsync, Promise<void>, void> {
    const saveOperation = this.driver.save(this._data, this.schema, this.driverConfig);
    if (this.driver.async) {
      return saveOperation as If<IsAsync, Promise<void>, void>;
    } else {
      return saveOperation as If<IsAsync, Promise<void>, void>;
    }
  }

  /**
   * Gets a configuration value by path.
   * Supports dot-notation for nested properties (e.g., 'app.name').
   * @param path The dot-notation path to the configuration property.
   * @returns The value at the specified path, or undefined if not found.
   */
  public get<P extends string>(path: P): (P extends keyof Static<T> ? Static<T>[P] : any) | undefined {
    const parts = path.split('.');
    let current: any = this._data;
    for (const part of parts) {
      if (current === undefined || typeof current !== 'object' || current === null || !(part in current)) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  /**
   * Sets a configuration value by path.
   * Supports dot-notation for nested properties (e.g., 'app.name').
   * @param path The dot-notation path to the configuration property.
   * @param value The value to set.
   */
  public set<P extends string>(path: P, value: any): void {
    const parts = path.split('.');
    let current: any = this._data;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = value;
      } else {
        if (current[part] === undefined || typeof current[part] !== 'object' || current[part] === null) {
          current[part] = {};
        }
        current = current[part];
      }
    }
    // Re-validate the entire data after setting to ensure it still conforms to the schema
    // If it doesn't conform, Value.Cast will attempt to coerce or apply defaults.
    // To make the test pass, we need to explicitly check and throw.
    if (!Value.Check(this.schema, this._data)) {
        throw new Error(`Invalid value for path '${path}'. Value does not conform to schema.`);
    }
    this._data = Value.Cast(this.schema, this._data);
  }

  /**
   * Gets all configuration data.
   * @returns The complete configuration object.
   */
  public all(): Static<T> {
    return this._data;
  }
}