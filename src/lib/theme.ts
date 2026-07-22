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
  // Syntax highlighting palette. 
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
    // Added to the default top/bottom padding of code and markdown cells.
    // "0px" leaves the defaults untouched; negative values shrink them.
    cellPadAdjust: string;
  };
  typography: {
    fontSize: string;
    headerDelta: string;
    headerColors?: string[];
    headerMarginBottom: string;
    // Added per level on top of headerMarginBottom, with the same multiples
    // as the header font-size scale (h4 gets 1x, h1 gets 4x). "0rem" keeps
    // every header at the base margin.
    headerMarginDelta: string;
    letterSpacing: string;
  };
  codeTypography: {
    fontFamily: string;
    fontWeight: string;
    baseFontSize: string;
    inlineFontSize: string;
    editorFontSize: string;
    outputFontSize: string;
    letterSpacing: string;
  };
  editor: {
    maxCodeHeight: string;
  };
  // App UI chrome typography (dialogs, dropdowns, menus, toolbars).
  uiTypography: {
    fontFamily: string;
    fontWeight: string;
    menuFontWeight: string;
    baseFontSize: string;
    letterSpacing: string;
  };
  // Shared border for UI element frames (dialogs, dropdowns, menus, toggles, inputs).
  uiBorder: {
    color: string;
    border: string;
    divider: string;
    menu: string;
  };
  // Markdown element borders. 
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
  // Border radius for embedded pynote_ui component boxes. Empty string = the
  // app's small radius (var(--radius-sm)).
  componentRadius: string;
  // Per size preset padding shift for pynote_ui components. 
  componentPadding: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
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
    cellPadAdjust: "0px",
  },
  typography: {
    fontSize: "1rem",
    headerDelta: "0.225rem",
    headerColors: ["#f38ba8", "#fab387", "#f9e2af", "#a6e3a1"],
    headerMarginBottom: "1.75rem",
    headerMarginDelta: "0rem",
    letterSpacing: "",
  },
  codeTypography: {
    fontFamily: '"JetBrains Mono Variable", monospace',
    fontWeight: "400",
    baseFontSize: "0.875rem",
    inlineFontSize: "0.875rem",
    editorFontSize: "1rem",
    outputFontSize: "",
    letterSpacing: "",
  },
  editor: {
    maxCodeHeight: "none",
  },
  uiTypography: {
    fontFamily: "",
    fontWeight: "",
    menuFontWeight: "",
    baseFontSize: "",
    letterSpacing: "",
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
  componentRadius: "",
  componentPadding: {
    xs: "",
    sm: "",
    md: "",
    lg: "",
    xl: "",
  },
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
        componentPadding: { ...defaultTheme.componentPadding, ...parsed.componentPadding },
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
  if (newTheme.componentRadius !== undefined) setTheme("componentRadius", newTheme.componentRadius);
  if (newTheme.componentPadding) setTheme("componentPadding", (cp) => ({ ...cp, ...newTheme.componentPadding }));
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

// The matching-bracket highlight brightens the glyph, which is wrong on light
// code backgrounds (it should darken instead). Any number of containers can
// paint translucent layers behind the editor, so instead of modeling that
// stack we sample it: walk up from a mounted editor compositing each
// element's computed background-color (the browser has already resolved
// var()/color-mix() to rgba) until the result is opaque, then pick the filter
// from its luminance. Background images are invisible to this (they are not
// background-color); with no editor mounted we fall back to the page
// background color.
type RGBA = { r: number; g: number; b: number; a: number };

const parseCssColor = (value: string): RGBA | null => {
  const v = (value || "").trim();
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([a-f\d]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgb) {
    const parts = rgb[1].replace(/\//g, " ").split(/[,\s]+/).filter(Boolean).map(parseFloat);
    if (parts.length >= 3 && parts.slice(0, 3).every((p) => !isNaN(p))) {
      return { r: parts[0], g: parts[1], b: parts[2], a: isNaN(parts[3]) ? 1 : parts[3] };
    }
  }
  return null;
};

// Standard "top over bottom" alpha compositing.
const compositeOver = (top: RGBA, bottom: RGBA): RGBA => {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
};

export const refreshBracketHighlightFilter = () => {
  let acc: RGBA = { r: 0, g: 0, b: 0, a: 0 };
  let el: Element | null = document.querySelector(".cm-editor .cm-scroller");
  while (el && acc.a < 0.999) {
    const layer = parseCssColor(getComputedStyle(el).backgroundColor);
    if (layer && layer.a > 0) acc = compositeOver(acc, layer);
    el = el.parentElement;
  }
  if (acc.a < 0.999) {
    const fallback = parseCssColor(theme.colors.background);
    if (fallback) acc = compositeOver(acc, { ...fallback, a: 1 });
  }
  const luminance = (0.2126 * acc.r + 0.7152 * acc.g + 0.0722 * acc.b) / 255;
  document.documentElement.style.setProperty(
    "--bracket-highlight-filter",
    luminance > 0.5 ? "brightness(0.55)" : "brightness(1.8)",
  );
};

// The filter is interaction feedback, not part of the theme paint, so sample
// lazily. Running at idle (after the theme's own style recalc has landed)
// means the computed-style reads hit a clean cache and force nothing.
// Repeated calls before the sample runs coalesce into one.
let bracketRefreshPending = false;
export const scheduleBracketHighlightRefresh = () => {
  if (bracketRefreshPending) return;
  bracketRefreshPending = true;
  const run = () => {
    bracketRefreshPending = false;
    refreshBracketHighlightFilter();
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 200 });
  else setTimeout(run, 0);
};

export const initTheme = () => {
  createEffect(() => {
    const root = document.documentElement;
    const body = document.body;    root.style.setProperty("--font-mono", theme.font);
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
    root.style.setProperty("--cell-pad-adjust", theme.spacing.cellPadAdjust || "0px");

    root.style.setProperty("--font-size-base", theme.typography.fontSize);
    root.style.setProperty("--font-size-delta", theme.typography.headerDelta);
    root.style.setProperty("--header-margin-bottom", theme.typography.headerMarginBottom);
    root.style.setProperty("--header-margin-delta", theme.typography.headerMarginDelta || "0rem");
    root.style.setProperty("--letter-spacing-base", theme.typography.letterSpacing || "normal");

    root.style.setProperty("--code-font-family", theme.codeTypography.fontFamily);
    root.style.setProperty("--code-font-weight", theme.codeTypography.fontWeight);
    root.style.setProperty("--code-base-font-size", theme.codeTypography.baseFontSize);
    root.style.setProperty("--code-inline-font-size", theme.codeTypography.inlineFontSize);
    root.style.setProperty("--code-editor-font-size", theme.codeTypography.editorFontSize);
    // Cell output text. Empty means follow the markdown base font size.
    root.style.setProperty("--code-output-font-size", theme.codeTypography.outputFontSize || "var(--font-size-base)");
    root.style.setProperty("--code-letter-spacing", theme.codeTypography.letterSpacing || "normal");

    root.style.setProperty("--editor-max-code-height", theme.editor.maxCodeHeight);

    // UI chrome typography. Default to the shared app font and normal weight;
    // only applied through the `ui-font` utility on dialogs/dropdowns/menus.
    root.style.setProperty("--ui-font-family", theme.uiTypography.fontFamily || "var(--font-mono)");
    root.style.setProperty("--ui-font-weight", theme.uiTypography.fontWeight || "var(--font-weight-base)");
    root.style.setProperty("--menu-font-weight", theme.uiTypography.menuFontWeight || "600");
    // Base for UI chrome text sizes. Replaces text-xs (the smallest Tailwind
    // preset the UI uses); the larger presets derive from it in index.css
    // with the same ratios Tailwind uses, so 0.75rem reproduces the defaults.
    root.style.setProperty("--ui-font-size-base", theme.uiTypography.baseFontSize || "0.75rem");
    root.style.setProperty("--ui-letter-spacing", theme.uiTypography.letterSpacing || "var(--letter-spacing-base)");

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

    // pynote_ui component sizing. Radius falls back to the app's small radius;
    // the padding shifts land in calc() next to each component's hardcoded
    // padding, so blank means 0px (no shift).
    root.style.setProperty("--component-radius", theme.componentRadius.trim() || "var(--radius-sm)");
    const cp = theme.componentPadding;
    root.style.setProperty("--component-pad-xs", cp.xs.trim() || "0px");
    root.style.setProperty("--component-pad-sm", cp.sm.trim() || "0px");
    root.style.setProperty("--component-pad-md", cp.md.trim() || "0px");
    root.style.setProperty("--component-pad-lg", cp.lg.trim() || "0px");
    root.style.setProperty("--component-pad-xl", cp.xl.trim() || "0px");

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

    // Re-sample the code background for the bracket highlight (lazily, off
    // the theme-apply path).
    scheduleBracketHighlightRefresh();
  });
}