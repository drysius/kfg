import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { Config } from '../src';
import { EnvDriver } from '../src/drivers/env-driver';
import fs from 'node:fs'; // Added fs import
import { setTimeout } from 'node:timers/promises';

// Helper to clear environment variables set during tests
const clearEnvVars = () => {
  // Clear specific process.env vars that might be set by tests
  delete process.env.APPNAME;
  delete process.env.ENVIRONMENT;
  delete process.env.DATABASE_HOST;
  delete process.env.DATABASE_PORT;
  delete process.env.DATABASE_USER;
  delete process.env.DATABASE_PASSWORD;
  delete process.env.APIKEYS_GOOGLE;
  delete process.env.APIKEYS_STRIPE;

  // Delete test .env file
  if (fs.existsSync('.test.env')) fs.unlinkSync('.test.env');
};

const AppConfigSchema = Type.Object({
  appName: Type.String({ default: 'My Awesome App' }),
  environment: Type.Union([Type.Literal('development'), Type.Literal('production')], { default: 'development' }),
  database: Type.Object({
    host: Type.String({ default: 'localhost' }),
    port: Type.Number({ default: 5432 }),
    user: Type.String({ default: '' }),
    password: Type.String({ default: '' }),
  }),
  apiKeys: Type.Object({
    google: Type.Optional(Type.String()),
    stripe: Type.Optional(Type.String()),
  }),
});

const getTestConfig = () => {
  return new Config(
    new EnvDriver(),
    { filepath: '.test.env' }, // Set filepath for EnvDriver
    AppConfigSchema
  );
};

const delayBetweenTests = async () => {
  await setTimeout(100); // 100ms delay
};

describe('Config with EnvDriver', () => {
  beforeEach(() => {
    clearEnvVars();
  });

  afterEach(async () => {
    clearEnvVars();
    await delayBetweenTests();
  });

  describe('Initialization', () => {
    test('should create a new instance with schema', () => {
      const config = getTestConfig();
      expect(config).toBeInstanceOf(Config);
    });
  });

  describe('load()', () => {
    test('should load values from environment variables file', () => {
      fs.writeFileSync('.test.env', 'APPNAME=Loaded App\nDATABASE_HOST=loaded.db.com\nDATABASE_PORT=1234');
      const config = getTestConfig();
      config.load();
      
      expect(config.get('appName')).toBe('Loaded App');
      expect(config.get('database.host')).toBe('loaded.db.com');
      expect(config.get('database.port')).toBe(1234);
    });

    test('should use default values when env var file is not set or empty', () => {
      // File not created, so it should use defaults
      const config = getTestConfig();
      config.load();
      
      expect(config.get('appName')).toBe('My Awesome App');
      expect(config.get('database.port')).toBe(5432);
    });

    test('should handle boolean env vars', () => {
      fs.writeFileSync('.test.env', 'ENVIRONMENT=production');
      const config = getTestConfig();
      config.load();
      expect(config.get('environment')).toBe('production');
    });

    test('should handle optional env vars not set', () => {
      const config = getTestConfig();
      config.load();
      expect(config.get('apiKeys.google')).toBeUndefined();
    });
  });

  describe('get()', () => {
    test('should get string value', () => {
      fs.writeFileSync('.test.env', 'APPNAME=Test App');
      const config = getTestConfig();
      config.load();
      expect(config.get('appName')).toBe('Test App');
    });

    test('should get nested value', () => {
      fs.writeFileSync('.test.env', 'DATABASE_HOST=nested.db');
      const config = getTestConfig();
      config.load();
      expect(config.get('database.host')).toBe('nested.db');
    });

    test('should get number value', () => {
      fs.writeFileSync('.test.env', 'DATABASE_PORT=9999');
      const config = getTestConfig();
      config.load();
      expect(config.get('database.port')).toBe(9999);
    });

    test('should return undefined for non-existent key', () => {
      const config = getTestConfig();
      config.load();
      expect(config.get('nonExistentKey')).toBeUndefined();
    });
  });

  describe('set() and save()', () => {
    test('should set string value and update file', () => {
      fs.writeFileSync('.test.env', 'APPNAME=Old App Name');
      const config = getTestConfig();
      config.load();
      config.set('appName', 'New App Name');
      config.save();
      
      expect(config.get('appName')).toBe('New App Name');
      expect(fs.readFileSync('.test.env', 'utf8')).toContain('APPNAME=New App Name');
    });

    test('should set nested value and update file', () => {
      fs.writeFileSync('.test.env', 'DATABASE_HOST=old.host.com');
      const config = getTestConfig();
      config.load();
      config.set('database.host', 'new.host.com');
      config.save();
      
      expect(config.get('database.host')).toBe('new.host.com');
      expect(fs.readFileSync('.test.env', 'utf8')).toContain('DATABASE_HOST=new.host.com');
    });

    test('should set number value and update file', () => {
      fs.writeFileSync('.test.env', 'DATABASE_PORT=1111');
      const config = getTestConfig();
      config.load();
      config.set('database.port', 8888);
      config.save();
      
      expect(config.get('database.port')).toBe(8888);
      expect(fs.readFileSync('.test.env', 'utf8')).toContain('DATABASE_PORT=8888'); // Env vars are always strings
    });

    test('should set boolean value and update file', () => {
      fs.writeFileSync('.test.env', 'ENVIRONMENT=false');
      const config = getTestConfig();
      config.load();
      config.set('environment', 'production');
      config.save();
      
      expect(config.get('environment')).toBe('production');
      expect(fs.readFileSync('.test.env', 'utf8')).toContain('ENVIRONMENT=production');
    });

    test('should handle setting optional values', () => {
      const config = getTestConfig();
      config.load();
      config.set('apiKeys.google', 'my_new_google_key');
      config.save();
      
      expect(config.get('apiKeys.google')).toBe('my_new_google_key');
      expect(fs.readFileSync('.test.env', 'utf8')).toContain('APIKEYS_GOOGLE=my_new_google_key');
    });

    test('should add new keys to the file', () => {
      fs.writeFileSync('.test.env', '# Existing comment\nEXISTING_KEY=old_value');
      const config = getTestConfig();
      config.load();
      config.set('apiKeys.stripe', 'new_stripe_key'); // Assuming stripe is not in initial file
      config.save();

      const fileContent = fs.readFileSync('.test.env', 'utf8');
      expect(fileContent).toContain('APIKEYS_STRIPE=new_stripe_key');
      expect(fileContent).toContain('EXISTING_KEY=old_value');
    });

    test('should preserve comments and blank lines', () => {
      const initialContent = `
# This is a comment
APPNAME=InitialApp

DATABASE_HOST=initial.db # Inline comment
`;
      fs.writeFileSync('.test.env', initialContent);
      const config = getTestConfig();
      config.load();
      
      config.set('appName', 'UpdatedApp');
      config.set('database.host', 'updated.db');
      config.save();

      const finalContent = fs.readFileSync('.test.env', 'utf8');
      expect(finalContent).toContain('# This is a comment');
      expect(finalContent).toContain('APPNAME=UpdatedApp');
      expect(finalContent).toContain('DATABASE_HOST=updated.db # Inline comment');
      expect(finalContent).toContain('\n\n'); // Check for blank line preservation
    });
  });

  describe('all()', () => {
    test('should get all values including defaults', () => {
      fs.writeFileSync('.test.env', 'APPNAME=Env All App\nDATABASE_USER=env_all_user');
      const config = getTestConfig();
      config.load();
      
      const all = config.all();
      expect(all).toEqual({
        appName: 'Env All App',
        environment: 'development', // Default
        database: {
          host: 'localhost', // Default
          port: 5432, // Default
          user: 'env_all_user',
          password: '', // Default
        },
        apiKeys: {}, // Default
      });
    });
  });
});