import { describe, test, expect } from 'vitest';
import {
  resolveColor,
  resolveBorder,
  isCustomColor,
  COLOR_PRESETS,
} from '../../components/ui-renderer/colorUtils';

describe('isCustomColor', () => {
  test('preset names return false', () => {
    for (const preset of COLOR_PRESETS) {
      expect(isCustomColor(preset)).toBe(false);
    }
  });

  test('hex, rgb, hsl, and named CSS colors return true', () => {
    expect(isCustomColor('#ff0000')).toBe(true);
    expect(isCustomColor('#f00')).toBe(true);
    expect(isCustomColor('rgb(255, 0, 0)')).toBe(true);
    expect(isCustomColor('rgba(255, 0, 0, 0.5)')).toBe(true);
    expect(isCustomColor('hsl(0, 100%, 50%)')).toBe(true);
    expect(isCustomColor('red')).toBe(true);
    expect(isCustomColor('transparent')).toBe(true);
  });

  test('unknown non-CSS strings return false', () => {
    expect(isCustomColor('banana')).toBe(false);
    expect(isCustomColor('foobar')).toBe(false);
  });
});

describe('resolveColor', () => {
  test('preset name wraps in CSS variable', () => {
    expect(resolveColor('primary')).toBe('var(--primary)');
    expect(resolveColor('accent')).toBe('var(--accent)');
  });

  test('neutral maps to var(--foreground)', () => {
    expect(resolveColor('neutral')).toBe('var(--foreground)');
  });

  test('custom hex passes through unchanged', () => {
    expect(resolveColor('#ff0000')).toBe('#ff0000');
    expect(resolveColor('rgb(0,0,0)')).toBe('rgb(0,0,0)');
  });

  test('null/undefined uses default preset', () => {
    expect(resolveColor(null)).toBe('var(--primary)');
    expect(resolveColor(undefined)).toBe('var(--primary)');
    expect(resolveColor(null, 'accent')).toBe('var(--accent)');
  });
});

describe('resolveBorder', () => {
  test('false and "none" return border: none', () => {
    expect(resolveBorder(false)).toEqual({ border: 'none' });
    expect(resolveBorder('none')).toEqual({ border: 'none' });
  });

  test('true, null, undefined return empty object (use default)', () => {
    expect(resolveBorder(true)).toEqual({});
    expect(resolveBorder(null)).toEqual({});
    expect(resolveBorder(undefined)).toEqual({});
  });

  test('preset string becomes 2px solid with CSS var', () => {
    expect(resolveBorder('primary')).toEqual({ border: '2px solid var(--primary)' });
    expect(resolveBorder('neutral')).toEqual({ border: '2px solid var(--foreground)' });
  });

  test('custom color becomes 2px solid border', () => {
    expect(resolveBorder('#ff0000')).toEqual({ border: '2px solid #ff0000' });
  });

  test('full CSS border value passes through', () => {
    expect(resolveBorder('3px dashed red')).toEqual({ border: '3px dashed red' });
  });
});
