/**
 * Utility functions for handling color and border presets in UI components
 * 
 * These utilities allow components to accept both:
 * 1. Preset names (e.g., "primary", "secondary", "accent") that map to theme colors
 * 2. Custom CSS color values (e.g., "#ff0000", "rgb(255, 0, 0)", "rgba(255, 0, 0, 0.5)")
 * 
 * Examples:
 * 
 * Color usage:
 * - Slider(color="primary")          // Uses theme primary color
 * - Slider(color="#ff6b6b")          // Custom hex color
 * - Slider(color="rgb(100, 200, 50)") // Custom RGB color
 * 
 * Border usage:
 * - Button(border=True)              // Default border (2px solid foreground)
 * - Button(border=False)             // No border
 * - Button(border="primary")         // 2px solid border with primary theme color
 * - Button(border="#00ff00")         // 2px solid border with custom color
 * - Button(border="3px dashed red")  // Fully custom CSS border
 */

/**
 * List of valid theme color presets
 */
const COLOR_PRESETS = [
    "neutral",
    "primary",
    "secondary",
    "accent",
    "info",
    "success",
    "warning",
    "error"
] as const;

/**
 * Checks if a color string is a custom CSS color (not a preset)
 * @param color - Color string to check
 * @returns true if it's a custom CSS color
 */
function isCustomColor(color: string): boolean {
    // Check if it's one of our presets
    if (COLOR_PRESETS.includes(color as any)) {
        return false;
    }

    // Check if it's a CSS color value
    // Hex colors: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
    if (color.startsWith('#')) return true;

    // RGB/RGBA colors: rgb(...), rgba(...)
    if (color.startsWith('rgb')) return true;

    // HSL/HSLA colors: hsl(...), hsla(...)
    if (color.startsWith('hsl')) return true;

    // CSS named colors (basic check - not exhaustive)
    const cssNamedColors = [
        'transparent', 'currentcolor', 'inherit', 'initial', 'unset',
        'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
        'orange', 'purple', 'pink', 'brown', 'gray', 'grey'
    ];
    if (cssNamedColors.includes(color.toLowerCase())) return true;

    return false;
}

/**
 * Resolves a color value to CSS color string
 * @param color - Preset name or custom CSS color
 * @param defaultPreset - Default preset to use if color is null/undefined (default: "primary")
 * @returns CSS color string
 */
export function resolveColor(color: string | null | undefined, defaultPreset: string = "primary"): string {
    if (!color) {
        // No color specified, use default preset
        return color === "neutral" ? "var(--foreground)" : `var(--${defaultPreset})`;
    }

    // Special case: neutral maps to foreground
    if (color === "neutral") {
        return "var(--foreground)";
    }

    // Check if it's a custom CSS color
    if (isCustomColor(color)) {
        return color;
    }

    // It's a preset, wrap in CSS variable
    return `var(--${color})`;
}

/**
 * Resolves a border value to CSS border string
 * @param border - Boolean, preset name, or custom CSS border string
 * @returns CSS border string or empty object for inline styles
 */
export function resolveBorder(border: boolean | string | null | undefined): { border?: string } {
    // false or "none" = no border
    if (border === false || border === "none") {
        return { border: "none" };
    }

    // true, null, or undefined = use default border from classes (no inline style)
    if (border === true || border == null) {
        return {};
    }

    // String value - check if it's a preset or custom CSS
    if (typeof border === 'string') {
        // Check if it's a color preset (convert to border with that color)
        if (COLOR_PRESETS.includes(border as any) || border === "neutral") {
            const color = resolveColor(border);
            return { border: `2px solid ${color}` };
        }

        // Check if it's a custom color (convert to border with that color)
        if (isCustomColor(border)) {
            return { border: `2px solid ${border}` };
        }

        // Otherwise, treat as full CSS border value
        return { border };
    }

    return {};
}

/**
 * Resolves a background value to CSS background string
 * @param background - Boolean, preset name, custom CSS color/gradient/image string
 * @returns CSS background style object
 */
export function resolveBackground(background: boolean | string | null | undefined): { background?: string; "background-color"?: string } {
    // false or "transparent" = transparent background
    if (background === false || background === "transparent") {
        return { background: "transparent" };
    }

    // true = use default --background CSS variable (no inline style)
    if (background === true || background == null) {
        return {};
    }

    // String value - check if it's a preset, custom color, or full CSS background value
    if (typeof background === 'string') {
        // Check if it's a color preset
        if (COLOR_PRESETS.includes(background as any) || background === "neutral") {
            const color = resolveColor(background);
            return { "background-color": color };
        }

        // Check if it's a custom color (hex, rgb, hsl, named)
        if (isCustomColor(background)) {
            return { "background-color": background };
        }

        // Otherwise, treat as full CSS background value (gradients, images, etc.)
        return { background };
    }

    return {};
}
