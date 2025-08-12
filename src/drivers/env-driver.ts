import { readFileSync, writeFileSync, existsSync } from 'fs';
import { type Static, type TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ConfigDriver } from '../types';

// Helper functions for parsing/stringifying values from/to environment variables
const parseEnvValue = (value: string): any => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!isNaN(Number(value)) && !isNaN(parseFloat(value))) return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const stringifyEnvValue = (value: any): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

// Regex to match key=value pairs, optionally capturing inline comments
const ENV_VAR_REGEX = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*?)(?:\s*#.*)?\s*$/;
const COMMENT_REGEX = /^\s*#.*$/;

// Define types for different kinds of lines in an .env file
interface BlankLine { type: 'blank'; content: string; }
interface CommentLine { type: 'comment'; content: string; }
interface KeyValuePairLine { type: 'kv'; key: string; value: string; originalContent: string; }

type EnvFileContent = (BlankLine | CommentLine | KeyValuePairLine)[];

export interface EnvDriverConfig {
  filepath: string;
}

export class EnvDriver implements ConfigDriver<false, EnvDriverConfig> {
  readonly async = false;
  private _envFileContent: EnvFileContent = [];

  load<T extends TSchema>(schema: T, config: EnvDriverConfig): Static<T> {
    const flatEnvVars: Record<string, any> = {}; // This will store flat ENV_VAR_NAME: value
    this._envFileContent = [];

    if (!existsSync(config.filepath)) {
      writeFileSync(config.filepath, '', 'utf8');
    }

    const fileContent = readFileSync(config.filepath, 'utf8');
    const lines = fileContent.split(/\r?\n/);

    lines.forEach(line => {
      const kvMatch = line.match(ENV_VAR_REGEX);
      const commentMatch = line.match(COMMENT_REGEX);

      if (kvMatch) {
        const key = kvMatch[1]; // e.g., APPNAME, DATABASE_HOST
        const rawValue = kvMatch[2];
        this._envFileContent.push({ type: 'kv', key, value: rawValue, originalContent: line });
        flatEnvVars[key] = parseEnvValue(rawValue); // Populate flat map
      } else if (commentMatch) {
        this._envFileContent.push({ type: 'comment', content: line });
      } else {
        this._envFileContent.push({ type: 'blank', content: line });
      }
    });

    // Now, map flatEnvVars to the nested schema structure
    const finalLoadedData: Record<string, any> = {};
    const mapFlatToNested = (flatData: Record<string, any>, currentSchema: TSchema, currentNestedData: Record<string, any>, currentPath: string[] = []) => {
      if (currentSchema.type === 'object' && currentSchema.properties) {
        for (const propName in currentSchema.properties) {
          const propSchema = currentSchema.properties[propName];
          const fullPath = [...currentPath, propName];
          const envVarName = fullPath.map(p => p.toUpperCase()).join('_');

          if (propSchema.type === 'object') {
            currentNestedData[propName] = currentNestedData[propName] || {};
            mapFlatToNested(flatData, propSchema, currentNestedData[propName], fullPath);
          } else {
            if (flatData[envVarName] !== undefined) {
              currentNestedData[propName] = flatData[envVarName];
            }
          }
        }
      }
    };
    mapFlatToNested(flatEnvVars, schema, finalLoadedData);

    return Value.Cast(Type.Partial(schema), finalLoadedData) as Static<T>;
  }

  save<T extends TSchema>(data: Static<T>, schema: T, config: EnvDriverConfig): void {
    const updatedLines: string[] = [];
    const newKeysAdded: Set<string> = new Set();

    // Create a flat map of data to be saved for easy lookup
    const dataToSaveFlat: Record<string, any> = {};
    const flattenData = (currentData: any, currentSchema: TSchema, currentPath: string[] = []) => {
      if (currentSchema.type === 'object' && currentSchema.properties) {
        for (const propName in currentSchema.properties) {
          const propSchema = currentSchema.properties[propName];
          const fullPath = [...currentPath, propName];
          const envVarName = fullPath.map(p => p.toUpperCase()).join('_');

          if (typeof currentData === 'object' && currentData !== null && propName in currentData) {
            if (propSchema.type === 'object') {
              flattenData(currentData[propName], propSchema, fullPath);
            } else {
              dataToSaveFlat[envVarName] = stringifyEnvValue(currentData[propName]);
            }
          }
        }
      }
    };
    flattenData(data, schema);

    this._envFileContent.forEach(line => {
      if (line.type === 'kv') {
        if (dataToSaveFlat[line.key] !== undefined) {
          // Update existing key-value pair
          const newValue = dataToSaveFlat[line.key];
          const originalCommentMatch = line.originalContent.match(/(\s*#.*)?\s*$/); // Capture trailing comment
          const originalComment = originalCommentMatch ? originalCommentMatch[1] || '' : '';
          updatedLines.push(`${line.key}=${newValue}${originalComment}`);
          newKeysAdded.add(line.key);
        } else {
          // Key removed from data, keep original line
          updatedLines.push(line.originalContent);
        }
      } else {
        // Preserve comments and blank lines
        updatedLines.push(line.content);
      }
    });

    // Add new keys that were not in the original file content
    for (const envVarName in dataToSaveFlat) {
      if (!newKeysAdded.has(envVarName)) {
        updatedLines.push(`${envVarName}=${dataToSaveFlat[envVarName]}`);
      }
    }

    writeFileSync(config.filepath, updatedLines.join('\n'), 'utf8');
  }
}