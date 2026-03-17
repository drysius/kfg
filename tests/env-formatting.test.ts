import { describe, it, expect } from 'bun:test';
import { updateEnvContent, parse } from '../src/utils/env';

describe('Env Formatting and Comments', () => {
  it('should maintain clean formatting without extra spaces around equals', () => {
    const content = 'OLD_KEY=value';
    const updated = updateEnvContent(content, 'NEW_KEY', 'new_value');
    
    // Should add a newline and then the new key without spaces around =
    expect(updated).toContain('NEW_KEY=new_value');
    expect(updated).not.toContain('NEW_KEY =');
    expect(updated).not.toContain('= new_value');
  });

  it('should not duplicate system comments when updating', () => {
    const description = 'Database connection string';
    const initial = updateEnvContent('', 'DB_URL', 'localhost', description);
    
    // First update should have the comment
    expect(initial).toContain('# Database connection string');
    
    // Second update with SAME description should NOT duplicate it
    const second = updateEnvContent(initial, 'DB_URL', 'remotehost', description);
    const commentOccurrences = (second.match(/# Database connection string/g) || []).length;
    expect(commentOccurrences).toBe(1);
    expect(second).toContain('DB_URL=remotehost');
  });

  it('should preserve user comments (manual edits)', () => {
    const content = '# User comment\n# Another one\nMY_KEY=val';
    const updated = updateEnvContent(content, 'MY_KEY', 'new_val', 'System comment');
    
    expect(updated).toContain('# User comment');
    expect(updated).toContain('# Another one');
    expect(updated).toContain('# System comment');
    expect(updated).toContain('MY_KEY=new_val');
  });

  it('should handle array values as JSON strings in .env', () => {
    const content = '';
    const updated = updateEnvContent(content, 'LIST', ['a', 'b', 'c']);
    
    expect(updated).toContain('LIST=["a","b","c"]');
    
    // Should be able to parse it back correctly
    const parsed = parse(updated);
    expect(parsed.LIST).toBe('["a","b","c"]');
  });

  it('should correctly quote values with spaces and NOT add extra spaces around =', () => {
    const content = '';
    const updated = updateEnvContent(content, 'SPACE_KEY', 'value with spaces');
    
    expect(updated).toContain('SPACE_KEY="value with spaces"');
    expect(updated).not.toContain('SPACE_KEY =');
  });

  it('should update existing keys that have weird spacing by cleaning them', () => {
    const content = '  WEIRD_KEY   =    old_val  ';
    const updated = updateEnvContent(content, 'WEIRD_KEY', 'clean_val');
    
    // It should preserve the indentation but clean the surroundings of =
    expect(updated).toBe('  WEIRD_KEY=clean_val');
  });
});
