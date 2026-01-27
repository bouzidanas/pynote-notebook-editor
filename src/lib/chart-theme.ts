/**
 * Unified Chart Theme System
 * 
 * Provides consistent theming for all three charting libraries:
 * - Observable Plot (general purpose)
 * - uPlot (high-performance time-series)
 * - Frappe Charts (pie, donut, heatmap)
 * 
 * All theme generators derive from the pynote currentTheme store,
 * ensuring visual consistency across the application.
 */

import { currentTheme } from "./theme";

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Convert hex color to HSL components
 */
export const hexToHSL = (hex: string): { h: number; s: number; l: number } => {
    // Remove # if present
    hex = hex.replace(/^#/, '');

    // Parse hex
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
};

/**
 * Convert HSL to hex color
 */
export const hslToHex = ({ h, s, l }: { h: number; s: number; l: number }): string => {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    return '#' + [r + m, g + m, b + m]
        .map(v => Math.round(v * 255).toString(16).padStart(2, '0'))
        .join('');
};

/**
 * Generate a harmonious color palette from the accent color
 * Uses golden ratio distribution for visually pleasing separation
 */
export const generateColorPalette = (baseColor: string, count: number): string[] => {
    const colors: string[] = [baseColor];
    const hsl = hexToHSL(baseColor);

    // Golden ratio for optimal color distribution
    const goldenRatio = 0.618033988749895;

    for (let i = 1; i < count; i++) {
        const newHue = (hsl.h + (i * goldenRatio * 360)) % 360;
        // Slightly vary saturation and lightness for depth
        const newSat = Math.max(30, Math.min(90, hsl.s + (i % 2 === 0 ? 5 : -5)));
        const newLight = Math.max(35, Math.min(65, hsl.l + (i % 3 === 0 ? 5 : -3)));
        colors.push(hslToHex({ h: newHue, s: newSat, l: newLight }));
    }

    return colors;
};

/**
 * Add alpha (transparency) to a hex color
 */
export const withAlpha = (hex: string, alpha: number): string => {
    const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return hex + alphaHex;
};

// ============================================================================
// Observable Plot Theme
// ============================================================================

export interface ObservablePlotTheme {
    style: {
        background: string;
        color: string;
        fontFamily: string;
        fontSize: string;
        overflow: string;
    };
    marks: {
        stroke: string;
        fill: string;
        strokeWidth: number;
    };
    axes: {
        stroke: string;
        tickColor: string;
        labelColor: string;
        labelFontSize: string;
        labelFontWeight: number;
    };
    grid: {
        stroke: string;
        strokeOpacity: number;
    };
    colorPalette: string[];
}

/**
 * Generate Observable Plot theme from current pynote theme
 */
export const getObservablePlotTheme = (): ObservablePlotTheme => ({
    style: {
        background: currentTheme.colors.background,
        // Text: secondary at 40% opacity, mono font
        color: `color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent)`,
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        overflow: "visible",
    },
    marks: {
        stroke: currentTheme.colors.accent,
        fill: withAlpha(currentTheme.colors.accent, 0.3),
        strokeWidth: 2,
    },
    axes: {
        // Match markdown table border style: 2px solid, 40% secondary opacity
        stroke: `color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent)`,
        // Tick labels: secondary at 40% opacity
        tickColor: `color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent)`,
        // Axis labels (x/y): secondary at 70% opacity (same as title), semi-bold, xs size
        labelColor: `color-mix(in srgb, ${currentTheme.colors.secondary} 70%, transparent)`,
        labelFontSize: "0.75rem",
        labelFontWeight: 600,
    },
    grid: {
        // Grid lines: subtle, using same color as table cell borders
        stroke: `color-mix(in srgb, ${currentTheme.colors.accent} 10%, transparent)`,
        strokeOpacity: 1,
    },
    colorPalette: generateColorPalette(currentTheme.colors.accent, 8),
});

// ============================================================================
// uPlot Theme
// ============================================================================

export interface UPlotTheme {
    background: string;
    axes: {
        stroke: string;
        grid: string;
        ticks: string;
        font: string;
        labelFont: string;
        labelSize: number;
        tickSize: number;
        gap: number;
    };
    series: {
        stroke: string;
        fill: string;
        width: number;
        points: {
            show: boolean;
            size: number;
            fill: string;
        };
    };
    cursor: {
        stroke: string;
        fill: string;
    };
    legend: {
        show: boolean;
        font: string;
        color: string;
    };
    colorPalette: string[];
}

/**
 * Generate uPlot theme from current pynote theme
 */
export const getUPlotTheme = (): UPlotTheme => ({
    background: currentTheme.colors.background,
    axes: {
        // Match markdown table border: 40% secondary opacity
        stroke: `color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent)`,
        // Grid: subtle, matches table cell borders (10% accent)
        grid: `color-mix(in srgb, ${currentTheme.colors.accent} 10%, transparent)`,
        // Ticks: same as axis stroke
        ticks: `color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent)`,
        // Numbers/labels: secondary at 40%, mono font
        font: `12px var(--font-mono)`,
        labelFont: `600 13px var(--font-mono)`,
        labelSize: 13,
        tickSize: 5,
        gap: 5,
    },
    series: {
        stroke: currentTheme.colors.accent,
        fill: withAlpha(currentTheme.colors.accent, 0.15),
        width: 2,
        points: {
            show: false,
            size: 5,
            fill: currentTheme.colors.accent,
        },
    },
    cursor: {
        stroke: currentTheme.colors.primary,
        fill: currentTheme.colors.accent,
    },
    legend: {
        show: true,
        font: `12px var(--font-mono)`,
        color: `color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent)`,
    },
    colorPalette: generateColorPalette(currentTheme.colors.accent, 8),
});

// ============================================================================
// Frappe Charts Theme
// ============================================================================

export interface FrappeTheme {
    colors: string[];
    axisOptions: {
        xAxisMode: string;
        yAxisMode: string;
        xIsSeries: number;
    };
    tooltipOptions: {
        formatTooltipX: (d: string) => string;
        formatTooltipY: (d: number) => string;
    };
    barOptions: {
        spaceRatio: number;
        stacked: number;
    };
    lineOptions: {
        dotSize: number;
        regionFill: number;
        hideDots: number;
        hideLine: number;
        heatline: number;
        spline: number;
    };
}

/**
 * Generate Frappe Charts theme from current pynote theme
 */
export const getFrappeTheme = (): FrappeTheme => ({
    colors: generateColorPalette(currentTheme.colors.accent, 8),
    axisOptions: {
        xAxisMode: "span",
        yAxisMode: "span",
        xIsSeries: 1,
    },
    tooltipOptions: {
        formatTooltipX: (d: string) => d ?? '',
        formatTooltipY: (d: number) => d != null ? d.toLocaleString() : '',
    },
    barOptions: {
        spaceRatio: 0.4,
        stacked: 0,
    },
    lineOptions: {
        dotSize: 4,
        regionFill: 1,
        hideDots: 0,
        hideLine: 0,
        heatline: 0,
        spline: 0,
    },
});

/**
 * Generate CSS for Frappe Charts that can't be styled via JS
 * This should be injected into the component wrapper
 */
export const getFrappeCSS = (): string => `
  .frappe-chart .axis text,
  .frappe-chart .chart-label {
    fill: color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  /* Axis labels (x/y titles): same as title color, xs size, semi-bold */
  .frappe-chart .y-axis-title,
  .frappe-chart .x-axis-title {
    fill: color-mix(in srgb, ${currentTheme.colors.secondary} 70%, transparent) !important;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 600;
  }
  .frappe-chart .axis line,
  .frappe-chart .axis path {
    stroke: color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent);
    stroke-width: 2px;
  }
  /* Grid lines: dim, matching Observable Plot (10% accent) */
  .frappe-chart .chart-strokes line {
    stroke: color-mix(in srgb, ${currentTheme.colors.accent} 10%, transparent) !important;
  }
  .frappe-chart .data-point-list,
  .frappe-chart .dataset-units circle {
    stroke-width: 2;
  }
  .frappe-chart .title {
    fill: color-mix(in srgb, ${currentTheme.colors.secondary} 70%, transparent);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 15px;
  }
  .frappe-chart .legend-dataset-text {
    fill: color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .graph-svg-tip {
    background: ${currentTheme.colors.background};
    border: 2px solid ${currentTheme.colors.foreground};
    border-radius: ${currentTheme.radii.sm};
    padding: 8px 12px;
    font-family: var(--font-mono);
    color: color-mix(in srgb, ${currentTheme.colors.secondary} 40%, transparent);
  }
  .graph-svg-tip .title {
    font-weight: 600;
    color: ${currentTheme.colors.primary};
  }
`;

// ============================================================================
// Shared Chart Container Styles
// ============================================================================

/**
 * Get consistent container styles for all chart types
 * Matches Slider/Text UI component styling (2px border, foreground color, same border-radius)
 */
export const getChartContainerStyles = () => ({
    background: currentTheme.colors.background,
    // Match Slider border-radius: rounded-sm = var(--radius-sm)
    "border-radius": "var(--radius-sm)",
    // Match Slider border: 2px solid foreground
    border: `2px solid ${currentTheme.colors.foreground}`,
    padding: currentTheme.spacing.cell,
    "font-family": "var(--font-mono)",
    // Add vertical margin for visual separation
    "margin-top": "0.5rem",
    "margin-bottom": "0.5rem",
});

/**
 * Get title styles for chart headers
 * Larger than axis labels, secondary at 70% opacity, semi-bold
 */
export const getChartTitleStyles = () => ({
    // Title: secondary at 70% opacity, semi-bold
    color: `color-mix(in srgb, ${currentTheme.colors.secondary} 70%, transparent)`,
    "font-family": "var(--font-mono)",
    "font-weight": "600",
    "font-size": "15px",  // Larger than axis labels (12px)
    "margin-bottom": "8px",
});

/**
 * Get axis label styles (x/y axis labels)
 * Same color as title (70%), xs font size, semi-bold
 */
export const getAxisLabelStyles = () => ({
    color: `color-mix(in srgb, ${currentTheme.colors.secondary} 70%, transparent)`,
    "font-family": "var(--font-mono)",
    "font-weight": "600",
    "font-size": "0.75rem",  // xs = 12px
});
