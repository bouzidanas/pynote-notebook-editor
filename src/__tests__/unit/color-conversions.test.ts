import { describe, test, expect } from 'vitest';
import { hexToHSL, hslToHex, generateColorPalette, withAlpha } from '../../lib/chart-theme';

describe('hexToHSL', () => {
  test('known values: pure red, green, blue, white, black', () => {
    const red = hexToHSL('#ff0000');
    expect(red.h).toBeCloseTo(0, 0);
    expect(red.s).toBeCloseTo(100, 0);
    expect(red.l).toBeCloseTo(50, 0);

    const green = hexToHSL('#00ff00');
    expect(green.h).toBeCloseTo(120, 0);
    expect(green.s).toBeCloseTo(100, 0);
    expect(green.l).toBeCloseTo(50, 0);

    const blue = hexToHSL('#0000ff');
    expect(blue.h).toBeCloseTo(240, 0);
    expect(blue.s).toBeCloseTo(100, 0);
    expect(blue.l).toBeCloseTo(50, 0);

    const white = hexToHSL('#ffffff');
    expect(white.s).toBeCloseTo(0);
    expect(white.l).toBeCloseTo(100);

    const black = hexToHSL('#000000');
    expect(black.s).toBeCloseTo(0);
    expect(black.l).toBeCloseTo(0);
  });

  test('accepts hex without # prefix', () => {
    const hsl = hexToHSL('ff0000');
    expect(hsl.h).toBeCloseTo(0, 0);
    expect(hsl.l).toBeCloseTo(50, 0);
  });
});

describe('hslToHex', () => {
  test('known values produce correct hex', () => {
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe('#ff0000');
    expect(hslToHex({ h: 120, s: 100, l: 50 })).toBe('#00ff00');
    expect(hslToHex({ h: 240, s: 100, l: 50 })).toBe('#0000ff');
  });

  test('hexToHSL → hslToHex roundtrip is stable', () => {
    const inputs = ['#f38ba8', '#89b4fa', '#1e1e2e', '#cdd6f4'];
    for (const hex of inputs) {
      const hsl = hexToHSL(hex);
      const back = hslToHex(hsl);
      expect(back).toBe(hex);
    }
  });
});

describe('generateColorPalette', () => {
  test('returns requested count with base color first', () => {
    const palette = generateColorPalette('#ff0000', 5);
    expect(palette).toHaveLength(5);
    expect(palette[0]).toBe('#ff0000');
  });

  test('all generated colors are unique', () => {
    const palette = generateColorPalette('#89b4fa', 8);
    const unique = new Set(palette);
    expect(unique.size).toBe(8);
  });
});

describe('withAlpha', () => {
  test('appends correct hex alpha values', () => {
    expect(withAlpha('#ff0000', 1)).toBe('#ff0000ff');
    expect(withAlpha('#ff0000', 0)).toBe('#ff000000');
    expect(withAlpha('#ff0000', 0.5)).toBe('#ff000080');
  });
});
