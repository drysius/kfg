import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import { envDriver } from '../src/drivers/env-driver';
import * as fs from 'fs';
import * as path from 'path';
import { c } from '../src/factory';
import { ConfigJS } from '../src/ConfigJS';

const TEST_ENV_PATH = path.join(__dirname, '.env.driver.test');

describe('ENV Driver Integration', () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    afterAll(() => {
        if (fs.existsSync(TEST_ENV_PATH)) fs.unlinkSync(TEST_ENV_PATH);
    });

    // Tests that the driver correctly loads values from a .env file and
    // coerces them into the proper types (string, number) defined in the schema.
    it('should load and coerce values from a .env file', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'KEY=VALUE\nNUM=123');
        const config = new ConfigJS(envDriver, {
            key: c.string(),
            num: c.number(),
        });
        config.load({ path: TEST_ENV_PATH });
        expect(config.get('key')).toBe('VALUE');
        expect(config.get('num')).toBe(123);
    });

    // Verifies that schema defaults are applied correctly when the specified
    // .env file does not exist.
    it('should apply defaults when loading a non-existent file', () => {
        const config = new ConfigJS(envDriver, { key: c.string({default: 'abc'}) });
        config.load({ path: TEST_ENV_PATH });
        expect(config.get('key')).toBe('abc');
    });

    // Ensures that if a .env file doesn't exist, the driver creates one
    // when `set()` is called to persist a new value.
    it('should create a file and save a value on set()', () => {
        const config = new ConfigJS(envDriver, { new_key: c.string({default: ''}) });
        config.load({ path: TEST_ENV_PATH });
        
        config.set('new_key', 'NEW_VALUE');
        
        expect(fs.existsSync(TEST_ENV_PATH)).toBe(true);
        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('NEW_KEY=NEW_VALUE');
    });

    // Tests that providing a description via `set()` results in a
    // properly formatted comment being added to the .env file.
    it('should add a comment description when setting a value', () => {
        const config = new ConfigJS(envDriver, { api_key: c.string({default: ''}) });
        config.load({ path: TEST_ENV_PATH });

        config.set('api_key', '12345', { description: 'My API Key' });

        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('# My API Key');
        expect(fileContent).toContain('API_KEY=12345');
    });

    // Verifies that values containing spaces are automatically enclosed
    // in quotes when persisted to the .env file.
    it('should automatically quote values containing spaces during set()', () => {
        const config = new ConfigJS(envDriver, { app_name: c.string({default: ''}) });
        config.load({ path: TEST_ENV_PATH });

        config.set('app_name', 'My Awesome App');

        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('APP_NAME="My Awesome App"');
    });

    // Checks that array values are correctly serialized into a JSON string
    // format before being written to the .env file.
    it('should serialize array values to JSON strings on set()', () => {
        const config = new ConfigJS(envDriver, { my_array: c.array(c.string(), {default: []}) });
        config.load({ path: TEST_ENV_PATH });

        const anArray = ['item1', 'item with space', 'item,with,comma'];
        config.set('my_array', anArray);

        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('MY_ARRAY=["item1","item with space","item,with,comma"]');
    });

    // Confirms that string values of "true" and "false" are correctly
    // coerced to boolean types during the loading process.
    it('should load and coerce boolean values', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'ENABLED=true\nDISABLED=false');
        const config = new ConfigJS(envDriver, {
            enabled: c.boolean(),
            disabled: c.boolean(),
        });
        config.load({ path: TEST_ENV_PATH });
        expect(config.get('enabled')).toBe(true);
        expect(config.get('disabled')).toBe(false);
    });

    // Tests that a value formatted as a JSON array string in the .env file
    // is correctly parsed and loaded as a JavaScript array.
    it('should load and coerce array values from JSON string', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'MY_ARRAY=["one","two"]');
        const config = new ConfigJS(envDriver, {
            my_array: c.array(c.string()),
        });
        config.load({ path: TEST_ENV_PATH });
        expect(config.get('my_array')).toEqual(['one', 'two']);
    });

    // Verifies that the driver uses environment variables from `process.env`
    // when a value is not present in the .env file.
    it('should use process.env as a fallback for .env file', () => {
        process.env.FROM_PROCESS = 'process_value';
        fs.writeFileSync(TEST_ENV_PATH, 'FROM_FILE=file_value');
        const config = new ConfigJS(envDriver, {
            from_process: c.string(),
            from_file: c.string(),
        });
        config.load({ path: TEST_ENV_PATH });
        expect(config.get('from_process')).toBe('process_value');
        expect(config.get('from_file')).toBe('file_value');
        delete process.env.FROM_PROCESS; // cleanup
    });

    // Ensures that updating a single value in the .env file does not
    // inadvertently remove or alter other existing values.
    it('should update an existing value without removing others', () => {
        fs.writeFileSync(TEST_ENV_PATH, 'FIRST=one\nSECOND=two');
        const config = new ConfigJS(envDriver, {
            first: c.string(),
            second: c.string(),
        });
        config.load({ path: TEST_ENV_PATH });
        
        config.set('first', 'new_one');

        const fileContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
        expect(fileContent).toContain('FIRST=new_one');
        expect(fileContent).toContain('SECOND=two');
    });
});