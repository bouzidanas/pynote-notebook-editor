import { describe, test, expect } from 'vitest';
import { getLastHeaderLevel } from '../../components/CellWrapper';

describe('getLastHeaderLevel', () => {
  test('returns 0 when no headers present', () => {
    expect(getLastHeaderLevel('just text\nno headers here')).toBe(0);
    expect(getLastHeaderLevel('')).toBe(0);
  });

  test('returns last header level, capped at 4', () => {
    expect(getLastHeaderLevel('# H1\n## H2\n### H3')).toBe(3);
    expect(getLastHeaderLevel('## H2\n# H1')).toBe(1);
    // H5 and H6 are capped at 4
    expect(getLastHeaderLevel('##### H5')).toBe(4);
    expect(getLastHeaderLevel('###### H6')).toBe(4);
    expect(getLastHeaderLevel('#### H4')).toBe(4);
  });

  test('ignores lines where # is not at the start or lacks trailing space', () => {
    // Not at start of line
    expect(getLastHeaderLevel('text ## not a header')).toBe(0);
    // No space after # — not a valid ATX header
    expect(getLastHeaderLevel('#nospace')).toBe(0);
    // Mix: one valid, one invalid
    expect(getLastHeaderLevel('## Valid\n#invalid')).toBe(2);
  });
});
