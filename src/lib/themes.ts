// Built-in theme registry
// Theme data extracted from themed-notebooks/*.ipynb metadata
// Used by the ?theme= query parameter to inject a theme into any notebook

import type { Theme } from "./theme";

// Deep partial — allows omitting nested keys (e.g. colors.success)
// updateTheme() merges each sub-object independently, so missing keys
// simply keep their current/default values.
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Theme data without saveToExport (added at application time)
type ThemePreset = DeepPartial<Omit<Theme, "saveToExport">>;

export type BuiltinThemeType = "magic_dark" | "lucide_dark";

const BUILTIN_THEMES: Record<BuiltinThemeType, ThemePreset> = {
    magic_dark: {
        font: '"JetBrains Mono Variable", monospace',
        colors: {
            primary: "#b9bbfe",
            secondary: "#c8b1bc",
            accent: "#b9bbfe",
            background: "#0b0a0f",
            foreground: "#242429",
            success: "#22c55e",
            error: "#dc2626",
            warning: "#eab308",
            info: "#89dceb",
        },
        syntax: { function: "#a6e3a1", property: "#9a86fd", variable: "#eeebff" },
        radii: { lg: "9999px", sm: "0.75rem" },
        spacing: { line: "1.75", cell: "0.90rem", block: "1.25rem" },
        typography: {
            fontSize: "1rem",
            headerDelta: "0.225rem",
            headerColors: ["#d482f8", "#feba71", "#02de7b", "#86b4fe"],
            headerMarginBottom: "1.5rem",
        },
        codeTypography: {
            fontFamily: '"JetBrains Mono Variable", monospace',
            fontWeight: "400",
            baseFontSize: "0.875rem",
            inlineFontSize: "0.875rem",
            editorFontSize: "1rem",
        },
        editor: { maxCodeHeight: "none" },
        sectionScoping: true,
        tableOverflow: "scroll",
        outputLayout: "above",
        pageWidth: "normal",
    },

    lucide_dark: {
        font: '"JetBrains Mono Variable", monospace',
        colors: {
            primary: "#d37373",
            secondary: "#dfdfd6",
            accent: "#818b8d",
            background: "#161618",
            foreground: "#242429",
        },
        syntax: { function: "#a6e3a1", property: "#9a86fd", variable: "#eeebff" },
        radii: { lg: "9999px", sm: "0.75rem" },
        spacing: { line: "1.75", cell: "0.90rem", block: "1.25rem" },
        typography: {
            fontSize: "1rem",
            headerDelta: "0.225rem",
            headerColors: ["#ae88bf", "#db9366", "#5ea19b", "#7abe74"],
            headerMarginBottom: "1.5rem",
        },
        codeTypography: {
            fontFamily: '"JetBrains Mono Variable", monospace',
            fontWeight: "400",
            baseFontSize: "0.875rem",
            inlineFontSize: "0.875rem",
            editorFontSize: "1rem",
        },
        editor: { maxCodeHeight: "none" },
        sectionScoping: true,
        tableOverflow: "scroll",
        outputLayout: "above",
        pageWidth: "normal",
    },
};

/** Check if a string is a valid built-in theme type */
export function isBuiltinTheme(value: string | null): value is BuiltinThemeType {
    return value !== null && value in BUILTIN_THEMES;
}

/** Get the theme data for a built-in theme */
export function getBuiltinTheme(type: BuiltinThemeType): ThemePreset {
    return BUILTIN_THEMES[type];
}
