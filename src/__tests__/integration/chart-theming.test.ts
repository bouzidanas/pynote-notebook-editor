import { describe, test, expect } from 'vitest';
import { updateTheme, currentTheme, defaultTheme } from '../../lib/theme';
import {
  getObservablePlotTheme,
  getUPlotTheme,
  getFrappeTheme,
  generateColorPalette,
  withAlpha,
} from '../../lib/chart-theme';

describe('theme-to-CSS-variables pipeline', () => {
  test('updateTheme updates the reactive store which initTheme would read', () => {
    // updateTheme modifies currentTheme (the reactive store).
    // initTheme creates a createEffect that reads from currentTheme and sets CSS vars.
    // We verify the store side: that updateTheme correctly merges partial updates.
    updateTheme({ colors: { primary: '#abcdef', accent: '#123456' } });

    // currentTheme should reflect the updates
    expect(currentTheme.colors.primary).toBe('#abcdef');
    expect(currentTheme.colors.accent).toBe('#123456');
    // Non-updated fields should retain defaults
    expect(currentTheme.colors.background).toBe(defaultTheme.colors.background);

    // Restore
    updateTheme(defaultTheme);
  });
});

describe('chart theme generators use current theme colors', () => {
  test('getObservablePlotTheme derives from currentTheme', () => {
    // Set a known accent/secondary so assertions are deterministic
    updateTheme({
      colors: {
        accent: '#aabbcc',
        secondary: '#112233',
        background: '#000000',
        primary: '#ff0000',
      },
    });

    const theme = getObservablePlotTheme();
    expect(theme.style.background).toBe('#000000');
    expect(theme.marks.stroke).toBe('#aabbcc');
    expect(theme.marks.fill).toBe(withAlpha('#aabbcc', 0.3));
    expect(theme.colorPalette).toEqual(generateColorPalette('#aabbcc', 8));
    // Axes use color-mix with secondary
    expect(theme.axes.stroke).toContain('#112233');
  });

  test('getUPlotTheme and getFrappeTheme have correct structure', () => {
    updateTheme({ colors: { accent: '#ff5500', primary: '#00ff00' } });

    const uplot = getUPlotTheme();
    expect(uplot.series.stroke).toBe('#ff5500');
    expect(uplot.cursor.stroke).toBe('#00ff00');
    expect(uplot.colorPalette).toHaveLength(8);
    expect(uplot.axes.tickSize).toBe(5);

    const frappe = getFrappeTheme();
    expect(frappe.colors).toHaveLength(8);
    expect(frappe.colors[0]).toBe('#ff5500');
    // Tooltip formatters work
    expect(frappe.tooltipOptions.formatTooltipX('Jan')).toBe('Jan');
    expect(frappe.tooltipOptions.formatTooltipY(1234)).toBe('1,234');
    expect(frappe.tooltipOptions.formatTooltipY(null as any)).toBe('');
    expect(frappe.tooltipOptions.formatTooltipX(null as any)).toBe('');

    // Restore defaults
    updateTheme(defaultTheme);
  });
});
