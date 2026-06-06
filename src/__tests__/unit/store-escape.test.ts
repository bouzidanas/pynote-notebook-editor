import { describe, test, expect } from 'vitest';
import { escapeContent, unescapeContent, parseUpdateEntry } from '../../lib/store';

describe('escapeContent / unescapeContent', () => {
  test('roundtrip preserves pipes, backslashes, and their combinations', () => {
    const cases = [
      'hello world',
      'pipe|in|content',
      'back\\slash',
      'combo\\|mixed\\\\|end',
      '',
    ];
    for (const input of cases) {
      expect(unescapeContent(escapeContent(input))).toBe(input);
    }
  });

  test('escapeContent encodes pipes and backslashes', () => {
    expect(escapeContent('a|b')).toBe('a\\|b');
    expect(escapeContent('a\\b')).toBe('a\\\\b');
    expect(escapeContent('a\\|b')).toBe('a\\\\\\|b');
  });

  test('unescapeContent decodes in correct order (pipes before backslashes)', () => {
    expect(unescapeContent('a\\|b')).toBe('a|b');
    expect(unescapeContent('a\\\\b')).toBe('a\\b');
  });
});

describe('parseUpdateEntry', () => {
  test('extracts id, oldContent, newContent from normal entry', () => {
    const old = escapeContent('hello');
    const now = escapeContent('world');
    const entry = `u|cell-1|${old}|${now}`;
    const result = parseUpdateEntry(entry);
    expect(result).toEqual({ id: 'cell-1', oldContent: 'hello', newContent: 'world' });
  });

  test('handles escaped pipes inside content fields', () => {
    const old = escapeContent('a|b');
    const now = escapeContent('c|d');
    const entry = `u|cell-2|${old}|${now}`;
    const result = parseUpdateEntry(entry);
    expect(result).toEqual({ id: 'cell-2', oldContent: 'a|b', newContent: 'c|d' });
  });

  test('handles double-backslash before separator pipe', () => {
    // Content ends with a literal backslash: "end\\"
    // Escaped: "end\\\\" — the separator pipe follows an even number of backslashes
    const old = escapeContent('end\\');
    const now = escapeContent('start');
    const entry = `u|cell-3|${old}|${now}`;
    const result = parseUpdateEntry(entry);
    expect(result).toEqual({ id: 'cell-3', oldContent: 'end\\', newContent: 'start' });
  });

  test('returns null for malformed entries', () => {
    expect(parseUpdateEntry('u')).toBeNull();
    expect(parseUpdateEntry('u|id')).toBeNull();
    // No unescaped separator between old and new content
    expect(parseUpdateEntry('u|id|only-one-field')).toBeNull();
  });
});
