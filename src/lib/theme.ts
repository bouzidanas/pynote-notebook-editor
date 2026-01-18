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
  };
  typography: {
    fontSize: string;
    headerDelta: string;
    headerColors?: string[];
  };
  editor: {
    maxCodeHeight: string;
  };
  sectionScoping: boolean;
}

const defaultTheme: Theme = {
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
  },
  typography: {
    fontSize: "1rem",
    headerDelta: "0.225rem",
    headerColors: ["#f38ba8", "#fab387", "#f9e2af", "#a6e3a1"],
  },
  editor: {
    maxCodeHeight: "none",
  },
  sectionScoping: true,
};

const [theme, setTheme] = createStore<Theme>(defaultTheme);

export const currentTheme = theme;

export const updateTheme = (newTheme: any) => {
  if (newTheme.font) setTheme("font", newTheme.font);
  if (newTheme.colors) setTheme("colors", (c) => ({ ...c, ...newTheme.colors }));
  if (newTheme.radii) setTheme("radii", (r) => ({ ...r, ...newTheme.radii }));
  if (newTheme.spacing) setTheme("spacing", (s) => ({ ...s, ...newTheme.spacing }));
  if (newTheme.typography) setTheme("typography", (t) => ({ ...t, ...newTheme.typography }));
  if (newTheme.editor) setTheme("editor", (e) => ({ ...e, ...newTheme.editor }));
  if (newTheme.sectionScoping !== undefined) setTheme("sectionScoping", newTheme.sectionScoping);
};

export const initTheme = () => {
  createEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--font-mono", theme.font);

    root.style.setProperty("--primary", theme.colors.primary);
    root.style.setProperty("--secondary", theme.colors.secondary);
    root.style.setProperty("--accent", theme.colors.accent);
    root.style.setProperty("--background", theme.colors.background);
    root.style.setProperty("--foreground", theme.colors.foreground);

    // Persist critical colors for index.html pre-loader
    try {
        localStorage.setItem("theme_bg", theme.colors.background);
        localStorage.setItem("theme_text", theme.colors.secondary);
    } catch (e) { /* ignore */ }

    root.style.setProperty("--radius-lg", theme.radii.lg);
    root.style.setProperty("--radius-sm", theme.radii.sm);

    root.style.setProperty("--line-spacing", theme.spacing.line);

    root.style.setProperty("--font-size-base", theme.typography.fontSize);
    root.style.setProperty("--font-size-delta", theme.typography.headerDelta);

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
  });
}