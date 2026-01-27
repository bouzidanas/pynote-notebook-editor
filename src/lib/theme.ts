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
  editor: {
    maxCodeHeight: string;
  };
  sectionScoping: boolean;
  outputLayout: "above" | "below";
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
  },
  radii: {
    lg: "9999px",
    sm: "0.75rem",
  },
  spacing: {
    line: "1.75",
    cell: "0.90rem",
    block: "1.25rem",
  },
  typography: {
    fontSize: "1rem",
    headerDelta: "0.225rem",
    headerColors: ["#f38ba8", "#fab387", "#f9e2af", "#a6e3a1"],
    headerMarginBottom: "1.5rem",
  },
  editor: {
    maxCodeHeight: "none",
  },
  sectionScoping: true,
  outputLayout: "above",
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
  if (newTheme.radii) setTheme("radii", (r) => ({ ...r, ...newTheme.radii }));
  if (newTheme.spacing) setTheme("spacing", (s) => ({ ...s, ...newTheme.spacing }));
  if (newTheme.typography) setTheme("typography", (t) => ({ ...t, ...newTheme.typography }));
  if (newTheme.editor) setTheme("editor", (e) => ({ ...e, ...newTheme.editor }));
  if (newTheme.sectionScoping !== undefined) setTheme("sectionScoping", newTheme.sectionScoping);
  if (newTheme.outputLayout) setTheme("outputLayout", newTheme.outputLayout);
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

    root.style.setProperty("--radius-lg", theme.radii.lg);
    root.style.setProperty("--radius-sm", theme.radii.sm);

    root.style.setProperty("--line-spacing", theme.spacing.line);
    root.style.setProperty("--cell-margin", theme.spacing.cell);
    root.style.setProperty("--block-margin", theme.spacing.block);

    root.style.setProperty("--font-size-base", theme.typography.fontSize);
    root.style.setProperty("--font-size-delta", theme.typography.headerDelta);
    root.style.setProperty("--header-margin-bottom", theme.typography.headerMarginBottom);

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

    // Update meta theme color for browser UI (avoids white flash in new tabs)
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', theme.colors.background);
  });
}