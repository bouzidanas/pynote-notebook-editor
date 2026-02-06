import { createStore } from "solid-js/store";
import { createEffect } from "solid-js";

export interface Theme {
  font: string;
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
  syntax: {
    function: string;
    property: string;
    variable: string;
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
  sectionScoping: boolean;
  tableOverflow: "scroll" | "wrap";
  outputLayout: "above" | "below";
  pageWidth: "normal" | "wide" | "full";
  saveToExport: boolean;
}

export const defaultTheme: Theme = {
  font: '"JetBrains Mono Variable", monospace',
  colors: {
    primary: "#f38ba8",
    secondary: "#cdd6f4",
    accent: "#89b4fa",
    background: "#1e1e2e",
    foreground: "rgba(205, 214, 244, 0.2)",
    success: "#a6e3a1",
    error: "#f38ba8",
    warning: "#f9e2af",
    info: "#89dceb",
  },
  syntax: {
    function: "#a6e3a1",
    property: "#9a86fd",
    variable: "#eeebff",
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
  sectionScoping: true,
  tableOverflow: "scroll",
  outputLayout: "above",
  pageWidth: "normal",
  saveToExport: false,
};

const STORAGE_KEY = "pynote-theme";

// Load app-wide theme from localStorage
export const loadAppTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultTheme, ...JSON.parse(stored) };
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
  if (newTheme.colors) setTheme("colors", (c) => ({ ...c, ...newTheme.colors }));
  if (newTheme.syntax) setTheme("syntax", (s) => ({ ...s, ...newTheme.syntax }));
  if (newTheme.radii) setTheme("radii", (r) => ({ ...r, ...newTheme.radii }));
  if (newTheme.spacing) setTheme("spacing", (s) => ({ ...s, ...newTheme.spacing }));
  if (newTheme.typography) setTheme("typography", (t) => ({ ...t, ...newTheme.typography }));
  if (newTheme.codeTypography) setTheme("codeTypography", (ct) => ({ ...ct, ...newTheme.codeTypography }));
  if (newTheme.editor) setTheme("editor", (e) => ({ ...e, ...newTheme.editor }));
  if (newTheme.sectionScoping !== undefined) setTheme("sectionScoping", newTheme.sectionScoping);
  if (newTheme.tableOverflow) setTheme("tableOverflow", newTheme.tableOverflow);
  if (newTheme.outputLayout) setTheme("outputLayout", newTheme.outputLayout);
  if (newTheme.pageWidth) setTheme("pageWidth", newTheme.pageWidth);
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
  } catch (e) {
    console.warn("Failed to save theme:", e);
  }
};

// Legacy export
export const saveTheme = saveThemeAppWide;

export const initTheme = () => {
  createEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--font-mono", theme.font);

    root.style.setProperty("--primary", theme.colors.primary);
    root.style.setProperty("--secondary", theme.colors.secondary);
    root.style.setProperty("--accent", theme.colors.accent);
    root.style.setProperty("--background", theme.colors.background);
    root.style.setProperty("--foreground", theme.colors.foreground);
    root.style.setProperty("--success", theme.colors.success);
    root.style.setProperty("--error", theme.colors.error);
    root.style.setProperty("--warning", theme.colors.warning);
    root.style.setProperty("--info", theme.colors.info);

    // Also set DaisyUI's color variables to use our theme
    root.style.setProperty("--color-primary", theme.colors.primary);
    root.style.setProperty("--color-secondary", theme.colors.secondary);
    root.style.setProperty("--color-accent", theme.colors.accent);
    root.style.setProperty("--color-base-100", theme.colors.background);
    root.style.setProperty("--color-base-content", theme.colors.secondary);
    root.style.setProperty("--color-success", theme.colors.success);
    root.style.setProperty("--color-error", theme.colors.error);
    root.style.setProperty("--color-warning", theme.colors.warning);
    root.style.setProperty("--color-info", theme.colors.info);

    root.style.setProperty("--syntax-function", theme.syntax.function);
    root.style.setProperty("--syntax-property", theme.syntax.property);
    root.style.setProperty("--syntax-variable", theme.syntax.variable);

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