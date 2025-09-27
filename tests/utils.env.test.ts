import { describe, it, expect } from 'bun:test';
import { parse, updateEnvContent } from '../src/utils/env';

describe('Utils: env.ts', () => {
  describe('parse()', () => {
    // Tests parsing of simple, valid key-value pairs.
    it('should parse basic key-value pairs', () => {
      const content = 'KEY=VALUE\nANOTHER_KEY=ANOTHER_VALUE';
      const result = parse(content);
      expect(result).toEqual({
        KEY: 'VALUE',
        ANOTHER_KEY: 'ANOTHER_VALUE',
      });
    });

    // Verifies that commented lines (starting with #) and empty lines are ignored.
    it('should ignore comments and empty lines', () => {
      const content = `
        # This is a comment
        KEY=VALUE

        ANOTHER_KEY=ANOTHER_VALUE # inline comment
      `;
      const result = parse(content);
      expect(result).toEqual({
        KEY: 'VALUE',
        ANOTHER_KEY: 'ANOTHER_VALUE',
      });
    });

    // Ensures that values containing spaces are correctly parsed when enclosed in quotes.
    it('should handle values with spaces when quoted', () => {
      const content = 'KEY="VALUE WITH SPACES"';
      const result = parse(content);
      expect(result).toEqual({ KEY: 'VALUE WITH SPACES' });
    });

    // Checks that values containing an equals sign (=) are parsed correctly.
    it('should handle values containing an equals sign', () => {
      const content = 'KEY=my==value';
      const result = parse(content);
      expect(result).toEqual({ KEY: 'my==value' });
    });

    // Confirms that both single and double quotes are correctly stripped from values.
    it('should correctly unquote single and double quoted values', () => {
      const content = `
        SINGLE_QUOTED='hello world'
        DOUBLE_QUOTED="hello world"
      `;
      const result = parse(content);
      expect(result).toEqual({
        SINGLE_QUOTED: 'hello world',
        DOUBLE_QUOTED: 'hello world',
      });
    });

    // Verifies that leading/trailing whitespace is trimmed from keys and unquoted values.
    it('should trim whitespace from keys and unquoted values', () => {
      const content = '  KEY  =  VALUE  ';
      const result = parse(content);
      expect(result).toEqual({ KEY: 'VALUE' });
    });

    // Ensures that lines without an equals sign are ignored, as they are not valid assignments.
    it('should ignore lines without an equals sign', () => {
        const content = 'JUST_A_KEY';
        const result = parse(content);
        expect(result).toEqual({});
    });

    // Tests that keys with no value after the equals sign are parsed as empty strings.
    it('should handle empty values correctly', () => {
        const content = 'EMPTY_KEY=';
        const result = parse(content);
        expect(result).toEqual({ EMPTY_KEY: '' });
    });
  });

  describe('updateEnvContent()', () => {
    // Tests that an existing key in the content is correctly updated with a new value.
    it('should update an existing key-value pair', () => {
      const content = 'KEY=VALUE\nOLD_KEY=OLD_VALUE';
      const newContent = updateEnvContent(content, 'KEY', 'NEW_VALUE');
      expect(newContent).toBe('KEY=NEW_VALUE\nOLD_KEY=OLD_VALUE');
    });

    // Verifies that a new key-value pair is appended to the content if it doesn't already exist.
    it('should add a new key-value pair if it does not exist', () => {
      const content = 'KEY=VALUE';
      const newContent = updateEnvContent(content, 'NEW_KEY', 'NEW_VALUE');
      expect(newContent).toBe('KEY=VALUE\n\nNEW_KEY=NEW_VALUE');
    });

    // Checks that a description is added as a comment above a newly added key.
    it('should add a description comment for a new key', () => {
      const content = 'KEY=VALUE';
      const newContent = updateEnvContent(content, 'NEW_KEY', 'NEW_VALUE', 'This is a new key');
      expect(newContent).toBe('KEY=VALUE\n\n# This is a new key\nNEW_KEY=NEW_VALUE');
    });

    // Ensures a description comment is added for an existing key if it doesn't have one.
    it('should add a description for an existing key if it does not have one', () => {
      const content = 'KEY=VALUE\nANOTHER_KEY=ANOTHER_VALUE';
      const newContent = updateEnvContent(content, 'ANOTHER_KEY', 'NEW', 'My Key');
      expect(newContent).toBe('KEY=VALUE\n# My Key\nANOTHER_KEY=NEW');
    });

    // Confirms that an existing comment is not duplicated if the same description is provided again.
    it('should not duplicate an existing description comment', () => {
        const content = '# My Key\nKEY=VALUE';
        const newContent = updateEnvContent(content, 'KEY', 'NEW_VALUE', 'My Key');
        expect(newContent).toBe('# My Key\nKEY=NEW_VALUE');
    });

    // Verifies that values containing spaces or other special characters are automatically quoted.
    it('should quote values that contain spaces or special characters', () => {
        const content = '';
        const newContent = updateEnvContent(content, 'KEY', 'value with spaces');
        expect(newContent).toBe('\nKEY="value with spaces"');
    });
  });
});
