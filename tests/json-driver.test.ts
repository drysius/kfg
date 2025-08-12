import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { Config } from '../src';
import { JsonDriver } from '../src/drivers/json-driver';
import fs from 'node:fs';
import { setTimeout } from 'node:timers/promises';

// Helper functions for test files
const cleanupTestFiles = () => {
  if (fs.existsSync('test.json')) fs.unlinkSync('test.json');
  if (fs.existsSync('test2.json')) fs.unlinkSync('test2.json');
};

const createTestFile = (content: object = {}, filename: string = 'test.json') => {
  fs.writeFileSync(filename, JSON.stringify(content));
};

// 1. Define your configuration schema using TypeBox (matching example.ts)
const AppConfigSchema = Type.Object({
  appName: Type.String({ default: 'My Awesome App' }),
  environment: Type.Union([Type.Literal('development'), Type.Literal('production')], { default: 'development' }),
  database: Type.Object({
    host: Type.String({ default: 'localhost' }),
    port: Type.Number({ default: 5432 }),
    user: Type.String({ default: '' }), // Added default for user
    password: Type.String({ default: '' }), // Added default for password
  }),
  apiKeys: Type.Object({
    google: Type.Optional(Type.String()),
    stripe: Type.Optional(Type.String()),
  }),
});

const getTestConfig = () => {
  return new Config(
    new JsonDriver(),
    { filepath: 'test.json' },
    AppConfigSchema
  );
};

const delayBetweenTests = async () => {
  await setTimeout(100); // 100ms delay
};

describe('Config with JsonDriver', () => {
  afterEach(async () => {
    cleanupTestFiles();
    await delayBetweenTests();
  });

  describe('Initialization', () => {
    test('should create a new instance with schema', () => {
      const config = getTestConfig();
      expect(config).toBeInstanceOf(Config);
    });
  });

  describe('load()', () => {
    test('should load values from JSON file', () => {
      createTestFile({ appName: "loaded", database: { host: "loaded.db" } });
      const config = getTestConfig();
      config.load();
      
      expect(config.get('appName')).toBe('loaded');
      expect(config.get('database.host')).toBe('loaded.db');
    });

    test('should use default values when JSON file is empty', () => {
      const config = getTestConfig();
      config.load();
      
      expect(config.get('appName')).toBe('My Awesome App');
    });

    test('should handle empty file by creating it with empty object', () => {
      fs.writeFileSync('test.json', '');
      const config = getTestConfig();
      config.load();
      
      // Expect default values to be applied
      expect(config.get('appName')).toBe('My Awesome App');
      expect(fs.readFileSync('test.json', 'utf8')).toBe('{}');
    });

    test('should create file if it doesnt exist', () => {
      const config = getTestConfig();
      config.load();
      
      expect(fs.existsSync('test.json')).toBe(true);
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8'))).toEqual({});
    });
  });

  describe('get()', () => {
    test('should get string value', () => {
      createTestFile({ appName: "example" });
      const config = getTestConfig();
      config.load();
      
      expect(config.get('appName')).toBe('example');
    });

    test('should get nested value', () => {
      createTestFile({ database: { host: "nested.db" } });
      const config = getTestConfig();
      config.load();
      
      expect(config.get('database.host')).toBe('nested.db');
    });

    test('should get boolean value', () => {
      createTestFile({ environment: "production" });
      const config = getTestConfig();
      config.load();
      
      expect(config.get('environment')).toBe('production');
    });

    test('should get array value (not directly in schema, but for completeness)', () => {
      // This schema doesn't have a direct array, but we can test a property that might be an array if schema allowed
      // For now, this test is less relevant given the current schema.
      // If you add an array type to AppConfigSchema, uncomment and adjust this test.
      // createTestFile({ someArray: ["a", "b", "c"] });
      // const config = getTestConfig();
      // config.load();
      // expect(config.get('someArray')).toEqual(['a', 'b', 'c']);
    });

    test('should return undefined for non-existent key', () => {
      createTestFile({ appName: "value" });
      const config = getTestConfig();
      config.load();
      
      expect(config.get('nonExistentKey')).toBeUndefined();
    });

    test('should return undefined for optional fields not present', () => {
      createTestFile({ appName: "value" });
      const config = getTestConfig();
      config.load();
      
      expect(config.get('apiKeys.google')).toBeUndefined();
    });
  });

  describe('set()', () => {
    test('should set string value', () => {
      createTestFile({});
      const config = getTestConfig();
      config.load();
      config.set('appName', 'new_value');
      config.save();
      
      expect(config.get('appName')).toBe('new_value');
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8'))).toHaveProperty('appName', 'new_value');
    });

    test('should set nested value', () => {
      createTestFile({});
      const config = getTestConfig();
      config.load();
      config.set('database.host', 'new.nested.db');
      config.save();
      
      expect(config.get('database.host')).toBe('new.nested.db');
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8')).database).toHaveProperty('host', 'new.nested.db');
    });

    test('should set boolean value', () => {
      createTestFile({});
      const config = getTestConfig();
      config.load();
      config.set('environment', 'production');
      config.save();
      
      expect(config.get('environment')).toBe('production');
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8'))).toHaveProperty('environment', 'production');
    });

    test('should throw when setting invalid value (TypeBox validation)', () => {
      const config = getTestConfig();
      config.load();
      
      // Attempt to set a string where a number is expected
      expect(() => config.set('database.port', "not_a_number" as any)).toThrow();
    });
  });

  describe('all()', () => {
    test('should get all values including defaults', () => {
      createTestFile({ appName: "all_test", database: { user: "test_user" } });
      const config = getTestConfig();
      config.load();
      
      const all = config.all();
      expect(all).toEqual({
        appName: 'all_test',
        environment: 'development',
        database: {
          host: 'localhost',
          port: 5432,
          user: 'test_user',
          password: '',
        },
        apiKeys: {},
      });
    });

    test('should return structure with defaults for empty config', () => {
      createTestFile({});
      const config = getTestConfig();
      config.load();
      
      const all = config.all();
      expect(all).toEqual({
        appName: 'My Awesome App',
        environment: 'development',
        database: {
          host: 'localhost',
          port: 5432,
          user: '',
          password: '',
        },
        apiKeys: {},
      });
    });
  });

  describe('pretty print', () => {
    test('should format JSON with indentation when pretty is true', () => {
      const config = new Config(
        new JsonDriver(),
        { filepath: 'test.json', pretty: true },
        AppConfigSchema
      );
      config.load();
      config.set('appName', 'pretty_value');
      config.save();
      
      const fileContent = fs.readFileSync('test.json', 'utf8');
      expect(fileContent).toMatch(/^\{\n  "appName": "pretty_value"/);
    });

    test('should write compact JSON when pretty is false', () => {
      const config = new Config(
        new JsonDriver(),
        { filepath: 'test.json', pretty: false },
        AppConfigSchema
      );
      config.load();
      config.set('appName', 'compact_value');
      config.save();
      
      const fileContent = fs.readFileSync('test.json', 'utf8');
      // Use JSON.parse and toEqual for robust comparison
      expect(JSON.parse(fileContent)).toEqual({
        appName: 'compact_value',
        environment: 'development',
        database: {
          host: 'localhost',
          port: 5432,
          user: '',
          password: '',
        },
        apiKeys: {},
      });
    });

    test('should use custom indentation when pretty is a number', () => {
      const config = new Config(
        new JsonDriver(),
        { filepath: 'test.json', pretty: 4 },
        AppConfigSchema
      );
      config.load();
      config.set('appName', 'indented_value');
      config.save();
      
      const fileContent = fs.readFileSync('test.json', 'utf8');
      expect(fileContent).toMatch(/^\{\n    "appName": "indented_value"/);
    });
  });
});