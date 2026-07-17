import { createStore } from "solid-js/store";
import { createEffect } from "solid-js";
import { resolveBorder } from "../components/ui-renderer/colorUtils";
import { scheduleThemeFontLoad } from "./font-loader";

export interface Theme {
  font: string;
  fontWeight: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
    success: string;
    error: string;
    warning: string;
    info: string;
  };
  // Syntax highlighting palette. `syntaxScheme` selects a built-in token
  // palette (see SYNTAX_SCHEMES); each field in `syntax` is an optional override
  // that wins when non-empty, otherwise the scheme's value is used. The same
  // palette drives all three highlighters: the CodeMirror editor (code cells),
  // the Lezer-based markdown Python highlighter, and highlight.js (other langs).
  syntaxScheme: string;
  syntax: {
    keyword: string;
    function: string;
    variable: string;
    type: string;
    string: string;
    number: string;
    comment: string;
    operator: string;
    property: string;
    punctuation: string;
  };
  radii: {
    lg: string;
    sm: string;
  };
  spacing: {
    line: string;
    cell: string;
    block: string;
  };
  typography: {
    fontSize: string;
    headerDelta: string;
    headerColors?: string[];
    headerMarginBottom: string;
  };
  codeTypography: {
    fontFamily: string;
    fontWeight: string;
    baseFontSize: string;
    inlineFontSize: string;
    editorFontSize: string;
  };
  editor: {
    maxCodeHeight: string;
  };
  // App UI chrome typography (dialogs, dropdowns, menus, toolbars). Empty
  // string = inherit the shared app font (theme.font) and normal weight. Only
  // applies to UI chrome via the `ui-font` utility, never markdown/code/widgets.
  uiTypography: {
    fontFamily: string;
    fontWeight: string;
    menuFontWeight: string;
  };
  // Shared border for UI element frames (dialogs, dropdowns, menus, toggles, inputs).
  // Empty string = inherit current behavior (1px solid, foreground color).
  // `color` is the shared default color for both frames and dividers.
  // `border`/`divider` accept either a thickness alone (e.g. "2px") or a full
  // CSS border value (thickness + style + color, e.g. "2px dashed #89b4fa").
  // Any part omitted falls back to: 1px width, solid style, the shared `color`.
  // `menu` is a separate border for menu/toolbar buttons, which are branded
  // (default 2px solid primary) and may need different styling from frames.
  uiBorder: {
    color: string;
    border: string;
    divider: string;
    menu: string;
  };
  // Markdown element borders. Empty string = inherit the current look.
  // `color` is the shared default color for both frames and cell dividers.
  // `border` applies to fully bordered elements (tables, images, videos, code
  // blocks); `divider` applies to the dividers inside table cells. Each accepts
  // a thickness alone ("3px") or a full CSS border value ("3px dashed #89b4fa");
  // any omitted part falls back to 2px width, solid style and the group's color.
  mdBorder: {
    color: string;
    border: string;
    divider: string;
  };
  // Box-shadow for bordered markdown elements (tables, images, videos, code
  // blocks). Empty string = no shadow (current look); accepts full CSS
  // box-shadow shorthand (e.g. "0 2px 8px rgba(0,0,0,0.3)").
  mdShadow: string;
  // Default border for embedded pynote_ui components (Button, Input, Slider,
  // Group, ...). Empty string = the current default (2px solid foreground).
  // Accepts exactly what a component's `border=` argument accepts: a preset
  // ("primary"), a color ("#89b4fa"), a full CSS border ("3px dashed #89b4fa"),
  // or "none". Only changes the *default*: components given an explicit
  // `border=` argument in Python keep their own.
  componentBorder: string;
  cellBorder: {
    radius: string;
    default: string;
    hover: string;
    select: string;
    edit: string;
  };
  // Advanced cell box-shadow overrides. Empty string = inherit current theme behavior.
  // Each value accepts full CSS box-shadow shorthand (e.g. "0 0 5px #89b4fa").
  cellShadow: {
    default: string;
    hover: string;
    select: string;
    edit: string;
  };
  // Advanced code-cell block overrides. Empty string = inherit current styling.
  // border/shadow accept full CSS shorthand; background accepts any CSS color/background.
  codeBlock: {
    outerBorder: string;
    outerRadius: string;
    outerBackground: string;
    outerShadow: string;
    outerMargin: string;
    outerPadding: string;
    innerBorder: string;
    innerRadius: string;
    innerBackground: string;
    innerShadow: string;
    gutterBorderRightOn: boolean;
    gutterBorderRight: string;
    gutterRadius: string;
    gutterBackground: string;
  };
  sectionScoping: boolean;
  tableOverflow: "scroll" | "wrap";
  outputLayout: "above" | "below";
  pageWidth: "normal" | "wide" | "full";
  // Last preset chosen in the theme dialog ("" = none). Persisted with the
  // theme so the dialog re-shows the active preset when reopened.
  preset: string;
  saveToExport: boolean;
}

// The token set shared by all three highlighters.
export type SyntaxToken =
  | "keyword"
  | "function"
  | "variable"
  | "type"
  | "string"
  | "number"
  | "comment"
  | "operator"
  | "property"
  | "punctuation";

export type SyntaxPalette = Record<SyntaxToken, string>;

// Built-in syntax color schemes. Each is a full token palette; the active
// scheme's values are used wherever a per-token override is left blank.
// "duotone" reproduces the editor/markdown look that shipped before schemes
// existed. The rest are extracted from the canonical palettes of popular
// editor/web themes.
export const SYNTAX_SCHEMES: Record<string, SyntaxPalette> = {
  duotone: {
    keyword: "#ffcc99",
    function: "#a6e3a1",
    variable: "#eeebff",
    type: "#7a63ee",
    string: "#ffb870",
    number: "#ffcc99",
    comment: "#6c6783",
    operator: "#ffad5c",
    property: "#9a86fd",
    punctuation: "#e09142",
  },
  dracula: {
    keyword: "#ff79c6",
    function: "#50fa7b",
    variable: "#f8f8f2",
    type: "#8be9fd",
    string: "#f1fa8c",
    number: "#bd93f9",
    comment: "#6272a4",
    operator: "#ff79c6",
    property: "#66d9ef",
    punctuation: "#f8f8f2",
  },
  "one-dark": {
    keyword: "#c678dd",
    function: "#61afef",
    variable: "#e06c75",
    type: "#e5c07b",
    string: "#98c379",
    number: "#d19a66",
    comment: "#5c6370",
    operator: "#56b6c2",
    property: "#e06c75",
    punctuation: "#abb2bf",
  },
  "github-dark": {
    keyword: "#ff7b72",
    function: "#d2a8ff",
    variable: "#c9d1d9",
    type: "#ffa657",
    string: "#a5d6ff",
    number: "#79c0ff",
    comment: "#8b949e",
    operator: "#ff7b72",
    property: "#79c0ff",
    punctuation: "#c9d1d9",
  },
  "github-light": {
    keyword: "#cf222e",
    function: "#8250df",
    variable: "#24292f",
    type: "#953800",
    string: "#0a3069",
    number: "#0550ae",
    comment: "#6e7781",
    operator: "#cf222e",
    property: "#0550ae",
    punctuation: "#24292f",
  },
  monokai: {
    keyword: "#f92672",
    function: "#a6e22e",
    variable: "#f8f8f2",
    type: "#66d9ef",
    string: "#e6db74",
    number: "#ae81ff",
    comment: "#75715e",
    operator: "#f92672",
    property: "#fd971f",
    punctuation: "#f8f8f2",
  },
  nord: {
    keyword: "#81a1c1",
    function: "#88c0d0",
    variable: "#d8dee9",
    type: "#8fbcbb",
    string: "#a3be8c",
    number: "#b48ead",
    comment: "#616e88",
    operator: "#81a1c1",
    property: "#8fbcbb",
    punctuation: "#eceff4",
  },
  "solarized-dark": {
    keyword: "#859900",
    function: "#268bd2",
    variable: "#839496",
    type: "#b58900",
    string: "#2aa198",
    number: "#d33682",
    comment: "#586e75",
    operator: "#859900",
    property: "#6c71c4",
    punctuation: "#93a1a1",
  },
  "solarized-light": {
    keyword: "#859900",
    function: "#268bd2",
    variable: "#657b83",
    type: "#b58900",
    string: "#2aa198",
    number: "#d33682",
    comment: "#93a1a1",
    operator: "#859900",
    property: "#6c71c4",
    punctuation: "#586e75",
  },
  "one-light": {
    keyword: "#a626a4",
    function: "#4078f2",
    variable: "#383a42",
    type: "#c18401",
    string: "#50a14f",
    number: "#986801",
    comment: "#a0a1a7",
    operator: "#0184bc",
    property: "#e45649",
    punctuation: "#383a42",
  },
  "ayu-light": {
    keyword: "#fa8d3e",
    function: "#399ee6",
    variable: "#5c6166",
    type: "#f2ae49",
    string: "#86b300",
    number: "#a37acc",
    comment: "#abb0b6",
    operator: "#ed9366",
    property: "#55b4d4",
    punctuation: "#5c6166",
  },
  "gruvbox-light": {
    keyword: "#9d0006",
    function: "#076678",
    variable: "#3c3836",
    type: "#b57614",
    string: "#79740e",
    number: "#8f3f71",
    comment: "#928374",
    operator: "#af3a03",
    property: "#427b58",
    punctuation: "#3c3836",
  },
};

// Human-readable labels + ordering for the scheme select.
export const SYNTAX_SCHEME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "duotone", label: "Duotone (default)" },
  { value: "dracula", label: "Dracula" },
  { value: "one-dark", label: "One Dark" },
  { value: "github-dark", label: "GitHub Dark" },
  { value: "github-light", label: "GitHub Light" },
  { value: "monokai", label: "Monokai" },
  { value: "nord", label: "Nord" },
  { value: "solarized-dark", label: "Solarized Dark" },
  { value: "solarized-light", label: "Solarized Light" },
  { value: "one-light", label: "One Light" },
  { value: "ayu-light", label: "Ayu Light" },
  { value: "gruvbox-light", label: "Gruvbox Light" },
];

// Order tokens for the advanced override UI.
export const SYNTAX_TOKENS: SyntaxToken[] = [
  "keyword",
  "function",
  "variable",
  "type",
  "string",
  "number",
  "comment",
  "operator",
  "property",
  "punctuation",
];

// Resolve the effective color for a token: a non-empty per-token override wins,
// otherwise the active scheme's value, falling back to the duotone default.
export const resolveSyntaxColor = (theme: Theme, token: SyntaxToken): string => {
  const override = theme.syntax[token];
  if (override) return override;
  const scheme = SYNTAX_SCHEMES[theme.syntaxScheme] || SYNTAX_SCHEMES.duotone;
  return scheme[token] || SYNTAX_SCHEMES.duotone[token];
};

export const defaultTheme: Theme = {
  font: '"JetBrains Mono Variable", monospace',
  fontWeight: "",
  colors: {
    primary: "#f38ba8",
    secondary: "#cdd6f4",
    accent: "#89b4fa",
    background: "#1e1e2e",
    foreground: "rgba(205, 214, 244, 0.2)",
    success: "#22c55e",
    error: "#dc2626",
    warning: "#eab308",
    info: "#89dceb",
  },
  syntaxScheme: "duotone",
  syntax: {
    keyword: "",
    function: "",
    variable: "",
    type: "",
    string: "",
    number: "",
    comment: "",
    operator: "",
    property: "",
    punctuation: "",
  },
  radii: {
    lg: "9999px",
    sm: "0.75rem",
  },
  spacing: {
    line: "1.75",
    cell: "1rem",
    block: "1.5rem",
  },
  typography: {
    fontSize: "1rem",
    headerDelta: "0.225rem",
    headerColors: ["#f38ba8", "#fab387", "#f9e2af", "#a6e3a1"],
    headerMarginBottom: "1.75rem",
  },
  codeTypography: {
    fontFamily: '"JetBrains Mono Variable", monospace',
    fontWeight: "400",
    baseFontSize: "0.875rem",
    inlineFontSize: "0.875rem",
    editorFontSize: "1rem",
  },
  editor: {
    maxCodeHeight: "none",
  },
  uiTypography: {
    fontFamily: "",
    fontWeight: "",
    menuFontWeight: "",
  },
  uiBorder: {
    color: "",
    border: "",
    divider: "",
    menu: "",
  },
  mdBorder: {
    color: "",
    border: "",
    divider: "",
  },
  mdShadow: "",
  componentBorder: "",
  cellBorder: {
    radius: "",
    default: "",
    hover: "",
    select: "",
    edit: "",
  },
  cellShadow: {
    default: "",
    hover: "",
    select: "",
    edit: "",
  },
  codeBlock: {
    outerBorder: "",
    outerRadius: "",
    outerBackground: "",
    outerShadow: "",
    outerMargin: "",
    outerPadding: "",
    innerBorder: "",
    innerRadius: "",
    innerBackground: "",
    innerShadow: "",
    gutterBorderRightOn: true,
    gutterBorderRight: "",
    gutterRadius: "",
    gutterBackground: "",
  },
  sectionScoping: true,
  tableOverflow: "scroll",
  outputLayout: "below",
  pageWidth: "normal",
  preset: "",
  saveToExport: false,
};

const STORAGE_KEY = "pynote-theme";

// Load app-wide theme from localStorage
export const loadAppTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Shallow spread, but deep-merge every nested object so sub-fields added
      // after the theme was last saved (e.g. uiBorder.menu) keep their defaults.
      return {
        ...defaultTheme,
        ...parsed,
        colors: { ...defaultTheme.colors, ...parsed.colors },
        syntax: { ...defaultTheme.syntax, ...parsed.syntax },
        radii: { ...defaultTheme.radii, ...parsed.radii },
        spacing: { ...defaultTheme.spacing, ...parsed.spacing },
        typography: { ...defaultTheme.typography, ...parsed.typography },
        codeTypography: { ...defaultTheme.codeTypography, ...parsed.codeTypography },
        editor: { ...defaultTheme.editor, ...parsed.editor },
        uiTypography: { ...defaultTheme.uiTypography, ...parsed.uiTypography },
        uiBorder: { ...defaultTheme.uiBorder, ...parsed.uiBorder },
        mdBorder: { ...defaultTheme.mdBorder, ...parsed.mdBorder },
        cellBorder: { ...defaultTheme.cellBorder, ...parsed.cellBorder },
        cellShadow: { ...defaultTheme.cellShadow, ...parsed.cellShadow },
        codeBlock: { ...defaultTheme.codeBlock, ...parsed.codeBlock },
      };
    }
  } catch (e) {
    console.warn("Failed to load theme:", e);
  }
  return defaultTheme;
};

// Initialize store - always start with app theme (session theme overrides later if exists)
const [theme, setTheme] = createStore<Theme>(loadAppTheme());

export const currentTheme = theme;

export const updateTheme = (newTheme: any) => {
  if (newTheme.font) setTheme("font", newTheme.font);
  if (newTheme.fontWeight !== undefined) setTheme("fontWeight", newTheme.fontWeight);
  if (newTheme.colors) setTheme("colors", (c) => ({ ...c, ...newTheme.colors }));
  if (newTheme.syntaxScheme !== undefined) setTheme("syntaxScheme", newTheme.syntaxScheme);
  if (newTheme.syntax) setTheme("syntax", (s) => ({ ...s, ...newTheme.syntax }));
  if (newTheme.radii) setTheme("radii", (r) => ({ ...r, ...newTheme.radii }));
  if (newTheme.spacing) setTheme("spacing", (s) => ({ ...s, ...newTheme.spacing }));
  if (newTheme.typography) setTheme("typography", (t) => ({ ...t, ...newTheme.typography }));
  if (newTheme.codeTypography) setTheme("codeTypography", (ct) => ({ ...ct, ...newTheme.codeTypography }));
  if (newTheme.editor) setTheme("editor", (e) => ({ ...e, ...newTheme.editor }));
  if (newTheme.uiTypography) setTheme("uiTypography", (ut) => ({ ...ut, ...newTheme.uiTypography }));
  if (newTheme.uiBorder) setTheme("uiBorder", (ub) => ({ ...ub, ...newTheme.uiBorder }));
  if (newTheme.mdBorder) setTheme("mdBorder", (mb) => ({ ...mb, ...newTheme.mdBorder }));
  if (newTheme.mdShadow !== undefined) setTheme("mdShadow", newTheme.mdShadow);
  if (newTheme.componentBorder !== undefined) setTheme("componentBorder", newTheme.componentBorder);
  if (newTheme.cellBorder) setTheme("cellBorder", (cb) => ({ ...cb, ...newTheme.cellBorder }));
  if (newTheme.cellShadow) setTheme("cellShadow", (cs) => ({ ...cs, ...newTheme.cellShadow }));
  if (newTheme.codeBlock) setTheme("codeBlock", (cb) => ({ ...cb, ...newTheme.codeBlock }));
  if (newTheme.sectionScoping !== undefined) setTheme("sectionScoping", newTheme.sectionScoping);
  if (newTheme.tableOverflow) setTheme("tableOverflow", newTheme.tableOverflow);
  if (newTheme.outputLayout) setTheme("outputLayout", newTheme.outputLayout);
  if (newTheme.pageWidth) setTheme("pageWidth", newTheme.pageWidth);
  if (newTheme.preset !== undefined) setTheme("preset", newTheme.preset);
  if (newTheme.saveToExport !== undefined) setTheme("saveToExport", newTheme.saveToExport);
};

// Save theme to localStorage (app-wide)
export const saveThemeAppWide = () => {
  try {
    const { saveToExport, ...themeToSave } = theme;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themeToSave));
    // Update preloader colors immediately
    localStorage.setItem("theme_bg", theme.colors.background);
    localStorage.setItem("theme_text", theme.colors.secondary);

    const root = document.documentElement;
    const body = document.body;
    root.style.setProperty("--background", theme.colors.background);
    root.style.setProperty("--secondary", theme.colors.secondary);
    root.style.backgroundColor = theme.colors.background;
    body.style.backgroundColor = theme.colors.background;
    const metaTheme = document.getElementById("meta-theme-color");
    if (metaTheme) metaTheme.setAttribute("content", theme.colors.background);
  } catch (e) {
    console.warn("Failed to save theme:", e);
  }
};

// Legacy export
export const saveTheme = saveThemeAppWide;

// Parse a UI border/divider value into width/style/color parts. The value may be
// just a thickness ("2px"), or a full CSS border value ("2px dashed #89b4fa").
// Missing parts fall back to 1px width, solid style and the shared color.
const UI_BORDER_STYLES = [
  "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset", "none", "hidden",
];
export const parseUiBorder = (value: string, fallbackColor: string, fallbackWidth = "1px") => {
  const tokens = (value || "").trim().split(/\s+/).filter(Boolean);
  let width = "", style = "", color = "";
  for (const t of tokens) {
    if (!style && UI_BORDER_STYLES.includes(t.toLowerCase())) { style = t; continue; }
    if (!width && /^[\d.]/.test(t)) { width = t; continue; }
    color = color ? `${color} ${t}` : t;
  }
  return {
    width: width || fallbackWidth,
    style: style || "solid",
    color: color || fallbackColor,
  };
};

export const initTheme = () => {
  createEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.style.setProperty("--font-mono", theme.font);
    root.style.setProperty("--font-weight-base", theme.fontWeight || "normal");

    // Catch-all for live edits (theme dialog font inputs): fetch any Google
    // font the theme now references. Debounced since inputs fire per
    // keystroke; the font swaps in when ready. Whole-theme loads (file open,
    // session restore, boot) await loadThemeFonts before applying instead.
    scheduleThemeFontLoad(theme);

    // Set base theme variables (--primary, --secondary, etc.)
    // The @theme inline block in index.css will map these to --color-* for Tailwind utilities
    root.style.setProperty("--primary", theme.colors.primary);
    root.style.setProperty("--secondary", theme.colors.secondary);
    root.style.setProperty("--accent", theme.colors.accent);
    root.style.setProperty("--background", theme.colors.background);
    root.style.setProperty("--foreground", theme.colors.foreground);
    root.style.setProperty("--success", theme.colors.success);
    root.style.setProperty("--error", theme.colors.error);
    root.style.setProperty("--warning", theme.colors.warning);
    root.style.setProperty("--info", theme.colors.info);
    root.style.backgroundColor = theme.colors.background;
    body.style.backgroundColor = theme.colors.background;

    // DaisyUI variables (not using @theme inline, set directly)
    root.style.setProperty("--color-base-100", theme.colors.background);
    root.style.setProperty("--color-base-content", theme.colors.secondary);

    // Syntax highlighting palette (scheme + per-token overrides). The same vars
    // drive the CodeMirror editor, the markdown Python highlighter and
    // highlight.js, so code cells and rendered markdown stay consistent.
    for (const token of SYNTAX_TOKENS) {
      root.style.setProperty(`--syntax-${token}`, resolveSyntaxColor(theme, token));
    }
    root.style.setProperty("--radius-lg", theme.radii.lg);
    root.style.setProperty("--radius-sm", theme.radii.sm);

    root.style.setProperty("--line-spacing", theme.spacing.line);
    root.style.setProperty("--cell-margin", theme.spacing.cell);
    root.style.setProperty("--block-margin", theme.spacing.block);

    root.style.setProperty("--font-size-base", theme.typography.fontSize);
    root.style.setProperty("--font-size-delta", theme.typography.headerDelta);
    root.style.setProperty("--header-margin-bottom", theme.typography.headerMarginBottom);

    root.style.setProperty("--code-font-family", theme.codeTypography.fontFamily);
    root.style.setProperty("--code-font-weight", theme.codeTypography.fontWeight);
    root.style.setProperty("--code-base-font-size", theme.codeTypography.baseFontSize);
    root.style.setProperty("--code-inline-font-size", theme.codeTypography.inlineFontSize);
    root.style.setProperty("--code-editor-font-size", theme.codeTypography.editorFontSize);

    root.style.setProperty("--editor-max-code-height", theme.editor.maxCodeHeight);

    // UI chrome typography. Default to the shared app font and normal weight;
    // only applied through the `ui-font` utility on dialogs/dropdowns/menus.
    root.style.setProperty("--ui-font-family", theme.uiTypography.fontFamily || "var(--font-mono)");
    root.style.setProperty("--ui-font-weight", theme.uiTypography.fontWeight || "var(--font-weight-base)");
    root.style.setProperty("--menu-font-weight", theme.uiTypography.menuFontWeight || "600");

    // Shared UI element border (frames + dividers). Each of `border`/`divider`
    // may carry its own width, style and color; anything omitted falls back to
    // 1px solid and the shared color (or the foreground color when unset).
    const uiSharedColor = theme.uiBorder.color || "var(--foreground)";
    const uiBorderParts = parseUiBorder(theme.uiBorder.border, uiSharedColor);
    const uiDividerParts = parseUiBorder(theme.uiBorder.divider, uiSharedColor);
    root.style.setProperty("--ui-border-width", uiBorderParts.width);
    root.style.setProperty("--ui-border-style", uiBorderParts.style);
    root.style.setProperty("--ui-border-color", uiBorderParts.color);
    root.style.setProperty("--ui-divider-width", uiDividerParts.width);
    root.style.setProperty("--ui-divider-style", uiDividerParts.style);
    root.style.setProperty("--ui-divider-color", uiDividerParts.color);
    // Menu/toolbar buttons are branded: default to 2px solid primary.
    const uiMenuParts = parseUiBorder(theme.uiBorder.menu, "var(--primary)", "2px");
    root.style.setProperty("--menu-border-width", uiMenuParts.width);
    root.style.setProperty("--menu-border-style", uiMenuParts.style);
    root.style.setProperty("--menu-border-color", uiMenuParts.color);

    // Markdown element borders. Frames (tables, images, videos, code blocks) and
    // table-cell dividers each keep their own current color when unset: frames
    // default to secondary @ 40%, dividers to accent @ 10%. A shared `color`
    // overrides both. Widths default to 2px (the current look).
    const mdSharedColor = theme.mdBorder.color;
    const mdFrameFallback = mdSharedColor || "color-mix(in srgb, var(--secondary) 40%, transparent)";
    const mdDividerFallback = mdSharedColor || "color-mix(in srgb, var(--accent) 10%, transparent)";
    const mdBorderParts = parseUiBorder(theme.mdBorder.border, mdFrameFallback, "2px");
    const mdDividerParts = parseUiBorder(theme.mdBorder.divider, mdDividerFallback, "2px");
    root.style.setProperty("--md-border-width", mdBorderParts.width);
    root.style.setProperty("--md-border-style", mdBorderParts.style);
    root.style.setProperty("--md-border-color", mdBorderParts.color);
    root.style.setProperty("--md-divider-width", mdDividerParts.width);
    root.style.setProperty("--md-divider-style", mdDividerParts.style);
    root.style.setProperty("--md-divider-color", mdDividerParts.color);
    root.style.setProperty("--md-shadow", theme.mdShadow || "none");

    // Default border for embedded pynote_ui components. The stored value is the
    // same string a component's `border=` argument accepts, so resolve it with
    // the very same helper. Blank falls back to the per-component default.
    const cbInput = theme.componentBorder.trim();
    const cbResolved = cbInput ? resolveBorder(cbInput).border : undefined;
    root.style.setProperty("--component-border", cbResolved || "2px solid var(--foreground)");

    // Header Colors Logic
    const colors = theme.typography.headerColors || [];
    const h1Color = colors[0] || theme.colors.primary;
    const h2Color = colors[1] || h1Color;
    const h3Color = colors[2] || h2Color;
    const h4Color = colors[3] || h3Color;

    root.style.setProperty("--header-color-1", h1Color);
    root.style.setProperty("--header-color-2", h2Color);
    root.style.setProperty("--header-color-3", h3Color);
    root.style.setProperty("--header-color-4", h4Color);

    root.style.setProperty("--table-overflow", theme.tableOverflow);

    // Page width variables (header and content have slightly different widths)
    if (theme.pageWidth === "wide") {
      root.style.setProperty("--page-max-width-header", "62.5rem"); // max-w-250
      root.style.setProperty("--page-margin-x-header", "auto");
      root.style.setProperty("--page-max-width-content", "64rem"); // max-w-256
      root.style.setProperty("--page-margin-x-content", "auto");
    } else if (theme.pageWidth === "full") {
      root.style.setProperty("--page-max-width-header", "100%");
      root.style.setProperty("--page-margin-x-header", "2.5rem"); // mx-10
      root.style.setProperty("--page-max-width-content", "100%");
      root.style.setProperty("--page-margin-x-content", "2rem"); // mx-8
    } else { // normal
      root.style.setProperty("--page-max-width-header", "50.5rem"); // max-w-202
      root.style.setProperty("--page-margin-x-header", "auto");
      root.style.setProperty("--page-max-width-content", "52rem"); // max-w-208
      root.style.setProperty("--page-margin-x-content", "auto");
    }

    // Update meta theme color for browser UI (avoids white flash in new tabs)
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', theme.colors.background);
  });
}