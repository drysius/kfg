import { readFileSync, writeFileSync, existsSync } from 'fs';
import { type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ConfigDriver } from '../types';

export interface JsonDriverConfig {
  filepath: string;
  pretty?: boolean | number;
}

export class JsonDriver implements ConfigDriver<false, JsonDriverConfig> {
  readonly async = false;

  load<T extends TSchema>(schema: T, config: JsonDriverConfig): Static<T> {
    let data: any = {};
    const fileExists = existsSync(config.filepath);

    if (!fileExists) {
      // If file doesn't exist, create it with an empty JSON object
      writeFileSync(config.filepath, '{}', 'utf8');
      data = {};
    } else {
      try {
        const content = readFileSync(config.filepath, 'utf8');
        if (content.trim() === '') { // Handle empty file content
          data = {};
          // Write back empty object to file for consistency
          writeFileSync(config.filepath, '{}', 'utf8');
        } else {
          data = JSON.parse(content);
        }
      } catch (error) {
        console.error(`[JsonDriver] Error parsing JSON from ${config.filepath}:`, error);
        data = {}; // Fallback to empty object on parse error
        // Write back empty object to file on parse error for consistency
        writeFileSync(config.filepath, '{}', 'utf8');
      }
    }

    // Validate and return the data, applying defaults if necessary
    if (!Value.Check(schema, data)) {
      console.warn(`[JsonDriver] Loaded data from ${config.filepath} does not match schema. Attempting to cast.`);
    }
    return Value.Cast(schema, data);
  }

  save<T extends TSchema>(data: Static<T>, schema: T, config: JsonDriverConfig): void {
    const spaces = typeof config.pretty === 'number' ? config.pretty : config.pretty ? 2 : undefined;
    const content = JSON.stringify(data, null, spaces);
    writeFileSync(config.filepath, content, 'utf8');
  }
}
