// AUTO-GENERATED FILE — do not edit by hand.
// Regenerate with: npm run gen:presets
//
// Built-in theme presets, extracted from themed-notebooks/*.ipynb
// (metadata.PyNote.theme). Used by the Presets section of the theme dialog and
// the ?theme= query parameter.

import type { Theme } from "./theme";

// Deep partial — allows omitting nested keys. updateTheme() merges each
// sub-object independently, so missing keys keep their current/default values.
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Theme data without saveToExport (added at application time).
type ThemePreset = DeepPartial<Omit<Theme, "saveToExport">>;

const PRESETS = {
    "lucide_dark": {
        "font": "\"JetBrains Mono Variable\", monospace",
        "colors": {
            "primary": "#d37373",
            "secondary": "#dfdfd6",
            "accent": "#818b8d",
            "background": "#161618",
            "foreground": "#242429"
        },
        "syntax": {
            "function": "#a6e3a1",
            "property": "#9a86fd",
            "variable": "#eeebff"
        },
        "radii": {
            "lg": "9999px",
            "sm": "0.75rem"
        },
        "spacing": {
            "line": "1.75",
            "cell": "0.90rem",
            "block": "1.25rem"
        },
        "typography": {
            "fontSize": "1rem",
            "headerDelta": "0.225rem",
            "headerColors": [
                "#ae88bf",
                "#db9366",
                "#5ea19b",
                "#7abe74"
            ],
            "headerMarginBottom": "1.5rem"
        },
        "codeTypography": {
            "fontFamily": "\"JetBrains Mono Variable\", monospace",
            "fontWeight": "400",
            "baseFontSize": "0.875rem",
            "inlineFontSize": "0.875rem",
            "editorFontSize": "1rem"
        },
        "editor": {
            "maxCodeHeight": "none"
        },
        "sectionScoping": true,
        "tableOverflow": "scroll",
        "outputLayout": "above",
        "pageWidth": "normal"
    },
    "magic_dark": {
        "font": "\"JetBrains Mono Variable\", monospace",
        "colors": {
            "primary": "#b9bbfe",
            "secondary": "#c8b1bc",
            "accent": "#b9bbfe",
            "background": "#0b0a0f",
            "foreground": "#242429",
            "success": "#22c55e",
            "error": "#dc2626",
            "warning": "#eab308",
            "info": "#89dceb"
        },
        "syntax": {
            "function": "#a6e3a1",
            "property": "#9a86fd",
            "variable": "#eeebff"
        },
        "radii": {
            "lg": "9999px",
            "sm": "0.75rem"
        },
        "spacing": {
            "line": "1.75",
            "cell": "0.90rem",
            "block": "1.25rem"
        },
        "typography": {
            "fontSize": "1rem",
            "headerDelta": "0.225rem",
            "headerColors": [
                "#d482f8",
                "#feba71",
                "#02de7b",
                "#86b4fe"
            ],
            "headerMarginBottom": "1.5rem"
        },
        "codeTypography": {
            "fontFamily": "\"JetBrains Mono Variable\", monospace",
            "fontWeight": "400",
            "baseFontSize": "0.875rem",
            "inlineFontSize": "0.875rem",
            "editorFontSize": "1rem"
        },
        "editor": {
            "maxCodeHeight": "none"
        },
        "sectionScoping": true,
        "tableOverflow": "scroll",
        "outputLayout": "above",
        "pageWidth": "normal"
    },
    "neobrutal_light": {
        "font": "\"JetBrains Mono Variable\", monospace",
        "fontWeight": "600",
        "colors": {
            "primary": "#ec225c",
            "secondary": "#525252",
            "accent": "#4d4d4d",
            "background": "#f6f0e5",
            "foreground": "#e4ddcf",
            "success": "#22c55e",
            "error": "#dc2626",
            "warning": "#eab308",
            "info": "#89dceb"
        },
        "syntaxScheme": "one-light",
        "radii": {
            "lg": "9999px",
            "sm": "0.75rem"
        },
        "spacing": {
            "line": "1.75",
            "cell": "1rem",
            "block": "1.5rem"
        },
        "typography": {
            "fontSize": "1rem",
            "headerDelta": "0.225rem",
            "headerColors": [
                "#ee2f65",
                "#de124c",
                "#af0e3c",
                "#780827"
            ],
            "headerMarginBottom": "1.75rem"
        },
        "codeTypography": {
            "fontFamily": "\"JetBrains Mono Variable\", monospace",
            "fontWeight": "400",
            "baseFontSize": "0.875rem",
            "inlineFontSize": "0.875rem",
            "editorFontSize": "1rem"
        },
        "editor": {
            "maxCodeHeight": "none"
        },
        "uiTypography": {
            "menuFontWeight": "900"
        },
        "uiBorder": {
            "color": "#171717",
            "border": "2px",
            "divider": "2px"
        },
        "mdBorder": {
            "color": "#171717",
            "divider": "2px solid var(--foreground)"
        },
        "componentBorder": "2px solid var(--secondary)",
        "cellBorder": {
            "select": "2px solid #171717",
            "edit": "2px solid #171717"
        },
        "cellShadow": {
            "edit": "6px 6px 0px #171717"
        },
        "codeBlock": {
            "gutterBorderRightOn": true
        },
        "sectionScoping": false,
        "tableOverflow": "scroll",
        "outputLayout": "above",
        "pageWidth": "normal"
    },
} satisfies Record<string, ThemePreset>;

export const BUILTIN_THEMES = PRESETS;

/** A built-in preset key (derived from the themed-notebook filename). */
export type BuiltinThemeType = keyof typeof PRESETS;

/** Ordered list of presets for the theme dialog's Presets dropdown. */
export const THEME_PRESETS: { type: BuiltinThemeType; label: string }[] = [
    { type: "lucide_dark", label: "Lucide Dark" },
    { type: "magic_dark", label: "Magic Dark" },
    { type: "neobrutal_light", label: "Neobrutal Light" },
];

/** Check if a string is a valid built-in theme type. */
export function isBuiltinTheme(value: string | null): value is BuiltinThemeType {
    return value !== null && value in PRESETS;
}

/** Get the theme data for a built-in theme. */
export function getBuiltinTheme(type: BuiltinThemeType): ThemePreset {
    return PRESETS[type];
}
