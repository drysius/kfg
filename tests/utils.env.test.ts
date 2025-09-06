import { describe, it, expect } from 'bun:test';
import { parse, updateEnvContent } from '../src/utils/env';

describe('Utils: env.ts', () => {
  describe('parse()', () => {
    it('should parse basic key-value pairs', () => {
      const content = 'KEY=VALUE\nANOTHER_KEY=ANOTHER_VALUE';
      const result = parse(content);
      expect(result).toEqual({
        KEY: 'VALUE',
        ANOTHER_KEY: 'ANOTHER_VALUE',
      });
    });

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

    it('should handle values with spaces when quoted', () => {
      const content = 'KEY="VALUE WITH SPACES"';
      const result = parse(content);
      expect(result).toEqual({ KEY: 'VALUE WITH SPACES' });
    });

    it('should handle values with special characters like =', () => {
      const content = 'KEY=my==value';
      const result = parse(content);
      expect(result).toEqual({ KEY: 'my==value' });
    });

    it('should handle single and double quotes', () => {
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

    it('should trim whitespace from keys and values', () => {
      const content = '  KEY  =  VALUE  ';
      const result = parse(content);
      expect(result).toEqual({ KEY: 'VALUE' });
    });

    it('should ignore lines without an = sign', () => {
        const content = 'JUST_A_KEY';
        const result = parse(content);
        expect(result).toEqual({});
    });

    it('should handle empty values', () => {
        const content = 'EMPTY_KEY=';
        const result = parse(content);
        expect(result).toEqual({ EMPTY_KEY: '' });
    });
  });

  describe('updateEnvContent()', () => {
    it('should update an existing key', () => {
      const content = 'KEY=VALUE\nOLD_KEY=OLD_VALUE';
      const newContent = updateEnvContent(content, 'KEY', 'NEW_VALUE');
      expect(newContent).toBe('KEY=NEW_VALUE\nOLD_KEY=OLD_VALUE');
    });

    it('should add a new key if it does not exist', () => {
      const content = 'KEY=VALUE';
      const newContent = updateEnvContent(content, 'NEW_KEY', 'NEW_VALUE');
      expect(newContent).toBe('KEY=VALUE\n\nNEW_KEY=NEW_VALUE');
    });

    it('should add a description for a new key', () => {
      const content = 'KEY=VALUE';
      const newContent = updateEnvContent(content, 'NEW_KEY', 'NEW_VALUE', 'This is a new key');
      expect(newContent).toBe('KEY=VALUE\n\n# This is a new key\nNEW_KEY=NEW_VALUE');
    });

    it('should add a description for an existing key', () => {
      const content = 'KEY=VALUE\nANOTHER_KEY=ANOTHER_VALUE';
      const newContent = updateEnvContent(content, 'ANOTHER_KEY', 'NEW', 'My Key');
      expect(newContent).toBe('KEY=VALUE\n# My Key\nANOTHER_KEY=NEW');
    });

    it('should not duplicate an existing description', () => {
        const content = '# My Key\nKEY=VALUE';
        const newContent = updateEnvContent(content, 'KEY', 'NEW_VALUE', 'My Key');
        expect(newContent).toBe('# My Key\nKEY=NEW_VALUE');
    });

    it('should quote values containing spaces or special characters', () => {
        const content = '';
        const newContent = updateEnvContent(content, 'KEY', 'value with spaces');
        expect(newContent).toBe('\nKEY="value with spaces"');
    });
  });
});
