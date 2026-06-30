// Unit tests for the theme → CSS-variable pipeline.
//
// This is where every theme input is "used": `initTheme` reads the reactive
// `currentTheme` store and writes CSS custom properties onto the document root.
// Those variables are what the stylesheets reference to override element
// styling (cell borders, markdown frames/dividers, colors, spacing, etc.).
// jsdom can't compute styles from the real stylesheet, so we verify the actual
// mechanism the app uses: that each input lands on the correct CSS variable.

import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createRoot } from "solid-js";
import {
  initTheme,
  updateTheme,
  defaultTheme,
  saveThemeAppWide,
  loadAppTheme,
} from "../../lib/theme";

const root = document.documentElement;
const cssVar = (name: string) => root.style.getPropertyValue(name).trim();

// Solid effects flush asynchronously; a macrotask runs after the scheduler's
// microtask queue, so the effect created by initTheme has re-run by then.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let dispose: () => void;

beforeAll(async () => {
  createRoot((d) => {
    dispose = d;
    initTheme();
  });
  await tick();
});

afterAll(() => dispose?.());

// Restore the default theme after every test so cases stay independent.
afterEach(async () => {
  updateTheme(defaultTheme);
  await tick();
});

describe("color inputs map to CSS variables", () => {
  test("each color input overrides its variable", async () => {
    updateTheme({
      colors: {
        primary: "#111111",
        secondary: "#222222",
        accent: "#333333",
        background: "#444444",
        foreground: "#555555",
        success: "#666666",
        error: "#777777",
        warning: "#888888",
        info: "#999999",
      },
    });
    await tick();

    expect(cssVar("--primary")).toBe("#111111");
    expect(cssVar("--secondary")).toBe("#222222");
    expect(cssVar("--accent")).toBe("#333333");
    expect(cssVar("--background")).toBe("#444444");
    expect(cssVar("--foreground")).toBe("#555555");
    expect(cssVar("--success")).toBe("#666666");
    expect(cssVar("--error")).toBe("#777777");
    expect(cssVar("--warning")).toBe("#888888");
    expect(cssVar("--info")).toBe("#999999");
    // DaisyUI base variables are derived from background / secondary.
    expect(cssVar("--color-base-100")).toBe("#444444");
    expect(cssVar("--color-base-content")).toBe("#222222");
  });

  test("updateTheme reactively re-applies a changed color", async () => {
    updateTheme({ colors: { accent: "#abcdef" } });
    await tick();
    expect(cssVar("--accent")).toBe("#abcdef");

    updateTheme({ colors: { accent: "#0f0f0f" } });
    await tick();
    expect(cssVar("--accent")).toBe("#0f0f0f");
  });
});

describe("syntax, radii, spacing and typography inputs", () => {
  test("syntax colors map to --syntax-* variables", async () => {
    updateTheme({ syntax: { function: "#aa0000", property: "#00aa00", variable: "#0000aa" } });
    await tick();
    expect(cssVar("--syntax-function")).toBe("#aa0000");
    expect(cssVar("--syntax-property")).toBe("#00aa00");
    expect(cssVar("--syntax-variable")).toBe("#0000aa");
  });

  test("blank syntax tokens resolve from the active scheme", async () => {
    // Default scheme is duotone; blank overrides fall back to its palette.
    updateTheme({ syntaxScheme: "duotone", syntax: { keyword: "", string: "" } });
    await tick();
    expect(cssVar("--syntax-keyword")).toBe("#ffcc99");
    expect(cssVar("--syntax-string")).toBe("#ffb870");
  });

  test("switching scheme repaints all blank tokens", async () => {
    updateTheme({ syntaxScheme: "dracula", syntax: { keyword: "", function: "", comment: "" } });
    await tick();
    expect(cssVar("--syntax-keyword")).toBe("#ff79c6");
    expect(cssVar("--syntax-function")).toBe("#50fa7b");
    expect(cssVar("--syntax-comment")).toBe("#6272a4");
  });

  test("per-token override wins over the active scheme", async () => {
    updateTheme({ syntaxScheme: "dracula", syntax: { keyword: "#123456", function: "" } });
    await tick();
    expect(cssVar("--syntax-keyword")).toBe("#123456");
    // Other tokens still follow the scheme.
    expect(cssVar("--syntax-function")).toBe("#50fa7b");
  });

  test("radii map to --radius-* variables", async () => {
    updateTheme({ radii: { lg: "20px", sm: "6px" } });
    await tick();
    expect(cssVar("--radius-lg")).toBe("20px");
    expect(cssVar("--radius-sm")).toBe("6px");
  });

  test("spacing maps to line/cell/block variables", async () => {
    updateTheme({ spacing: { line: "1.8", cell: "12px", block: "24px" } });
    await tick();
    expect(cssVar("--line-spacing")).toBe("1.8");
    expect(cssVar("--cell-margin")).toBe("12px");
    expect(cssVar("--block-margin")).toBe("24px");
  });

  test("typography maps to font-size and header variables", async () => {
    updateTheme({
      typography: { fontSize: "18px", headerDelta: "4px", headerMarginBottom: "10px" },
    });
    await tick();
    expect(cssVar("--font-size-base")).toBe("18px");
    expect(cssVar("--font-size-delta")).toBe("4px");
    expect(cssVar("--header-margin-bottom")).toBe("10px");
  });

  test("header colors cascade: missing levels inherit the previous one", async () => {
    updateTheme({ typography: { headerColors: ["#aa1111"] } });
    await tick();
    expect(cssVar("--header-color-1")).toBe("#aa1111");
    expect(cssVar("--header-color-2")).toBe("#aa1111");
    expect(cssVar("--header-color-3")).toBe("#aa1111");
    expect(cssVar("--header-color-4")).toBe("#aa1111");

    updateTheme({ typography: { headerColors: ["#a1", "#b2", "#c3", "#d4"] } });
    await tick();
    expect(cssVar("--header-color-1")).toBe("#a1");
    expect(cssVar("--header-color-2")).toBe("#b2");
    expect(cssVar("--header-color-3")).toBe("#c3");
    expect(cssVar("--header-color-4")).toBe("#d4");
  });

  test("code typography and editor inputs map to their variables", async () => {
    updateTheme({
      codeTypography: {
        fontFamily: "monospace",
        fontWeight: "500",
        baseFontSize: "15px",
        inlineFontSize: "13px",
        editorFontSize: "14px",
      },
      editor: { maxCodeHeight: "420px" },
    });
    await tick();
    expect(cssVar("--code-font-family")).toBe("monospace");
    expect(cssVar("--code-font-weight")).toBe("500");
    expect(cssVar("--code-base-font-size")).toBe("15px");
    expect(cssVar("--code-inline-font-size")).toBe("13px");
    expect(cssVar("--code-editor-font-size")).toBe("14px");
    expect(cssVar("--editor-max-code-height")).toBe("420px");
  });

  test("font input maps to --font-mono", async () => {
    updateTheme({ font: '"Test Mono", monospace' });
    await tick();
    expect(cssVar("--font-mono")).toBe('"Test Mono", monospace');
  });
});

describe("layout inputs", () => {
  test("table overflow maps to --table-overflow", async () => {
    updateTheme({ tableOverflow: "wrap" });
    await tick();
    expect(cssVar("--table-overflow")).toBe("wrap");
  });

  test("page width selects the matching header/content widths", async () => {
    updateTheme({ pageWidth: "wide" });
    await tick();
    expect(cssVar("--page-max-width-header")).toBe("62.5rem");
    expect(cssVar("--page-max-width-content")).toBe("64rem");

    updateTheme({ pageWidth: "full" });
    await tick();
    expect(cssVar("--page-max-width-header")).toBe("100%");
    expect(cssVar("--page-margin-x-header")).toBe("2.5rem");

    updateTheme({ pageWidth: "normal" });
    await tick();
    expect(cssVar("--page-max-width-header")).toBe("50.5rem");
    expect(cssVar("--page-max-width-content")).toBe("52rem");
  });
});

describe("UI element border inputs", () => {
  test("blank uiBorder falls back to 1px solid foreground for frame and divider", async () => {
    updateTheme({ uiBorder: { color: "", border: "", divider: "" } });
    await tick();
    expect(cssVar("--ui-border-width")).toBe("1px");
    expect(cssVar("--ui-border-style")).toBe("solid");
    expect(cssVar("--ui-border-color")).toBe("var(--foreground)");
    expect(cssVar("--ui-divider-width")).toBe("1px");
    expect(cssVar("--ui-divider-style")).toBe("solid");
    expect(cssVar("--ui-divider-color")).toBe("var(--foreground)");
  });

  test("shared color applies to both frame and divider when their color is omitted", async () => {
    updateTheme({ uiBorder: { color: "#89b4fa", border: "2px", divider: "3px" } });
    await tick();
    expect(cssVar("--ui-border-width")).toBe("2px");
    expect(cssVar("--ui-border-color")).toBe("#89b4fa");
    expect(cssVar("--ui-divider-width")).toBe("3px");
    expect(cssVar("--ui-divider-color")).toBe("#89b4fa");
  });

  test("a full border value sets width, style and color independently", async () => {
    updateTheme({ uiBorder: { color: "#000000", border: "2px dashed #ff0000", divider: "dotted" } });
    await tick();
    expect(cssVar("--ui-border-width")).toBe("2px");
    expect(cssVar("--ui-border-style")).toBe("dashed");
    expect(cssVar("--ui-border-color")).toBe("#ff0000");
    // Divider gives only a style, so width falls back to 1px and color to shared.
    expect(cssVar("--ui-divider-width")).toBe("1px");
    expect(cssVar("--ui-divider-style")).toBe("dotted");
    expect(cssVar("--ui-divider-color")).toBe("#000000");
  });

  test("blank menu border falls back to 2px solid primary", async () => {
    updateTheme({ uiBorder: { menu: "" } });
    await tick();
    expect(cssVar("--menu-border-width")).toBe("2px");
    expect(cssVar("--menu-border-style")).toBe("solid");
    expect(cssVar("--menu-border-color")).toBe("var(--primary)");
  });

  test("menu border accepts a full independent value", async () => {
    updateTheme({ uiBorder: { menu: "3px dashed #ff0000" } });
    await tick();
    expect(cssVar("--menu-border-width")).toBe("3px");
    expect(cssVar("--menu-border-style")).toBe("dashed");
    expect(cssVar("--menu-border-color")).toBe("#ff0000");
  });

  test("blank UI typography falls back to app font and base weight", async () => {
    updateTheme({ uiTypography: { fontFamily: "", fontWeight: "" } });
    await tick();
    expect(cssVar("--ui-font-family")).toBe("var(--font-mono)");
    expect(cssVar("--ui-font-weight")).toBe("var(--font-weight-base)");
  });

  test("base font weight applies and UI weight can override it", async () => {
    updateTheme({ fontWeight: "500", uiTypography: { fontWeight: "" } });
    await tick();
    expect(cssVar("--font-weight-base")).toBe("500");
    expect(cssVar("--ui-font-weight")).toBe("var(--font-weight-base)");
    updateTheme({ uiTypography: { fontWeight: "700" } });
    await tick();
    expect(cssVar("--ui-font-weight")).toBe("700");
  });

  test("menu font weight defaults to 600 and can be overridden", async () => {
    updateTheme({ uiTypography: { menuFontWeight: "" } });
    await tick();
    expect(cssVar("--menu-font-weight")).toBe("600");
    updateTheme({ uiTypography: { menuFontWeight: "800" } });
    await tick();
    expect(cssVar("--menu-font-weight")).toBe("800");
  });

  test("UI typography overrides family and weight when set", async () => {
    updateTheme({ uiTypography: { fontFamily: "Inter, sans-serif", fontWeight: "600" } });
    await tick();
    expect(cssVar("--ui-font-family")).toBe("Inter, sans-serif");
    expect(cssVar("--ui-font-weight")).toBe("600");
  });
});

describe("markdown border inputs", () => {
  test("blank mdBorder keeps the current look (2px, per-group colors)", async () => {
    updateTheme({ mdBorder: { color: "", border: "", divider: "" } });
    await tick();
    expect(cssVar("--md-border-width")).toBe("2px");
    expect(cssVar("--md-border-style")).toBe("solid");
    expect(cssVar("--md-border-color")).toBe(
      "color-mix(in srgb, var(--secondary) 40%, transparent)"
    );
    expect(cssVar("--md-divider-width")).toBe("2px");
    expect(cssVar("--md-divider-style")).toBe("solid");
    expect(cssVar("--md-divider-color")).toBe(
      "color-mix(in srgb, var(--accent) 10%, transparent)"
    );
  });

  test("shared color overrides both the frame and divider fallbacks", async () => {
    updateTheme({ mdBorder: { color: "#abcabc", border: "", divider: "" } });
    await tick();
    expect(cssVar("--md-border-color")).toBe("#abcabc");
    expect(cssVar("--md-divider-color")).toBe("#abcabc");
  });

  test("border applies to frames and divider to table cells independently", async () => {
    updateTheme({
      mdBorder: { color: "", border: "4px dashed #123456", divider: "1px dotted #654321" },
    });
    await tick();
    expect(cssVar("--md-border-width")).toBe("4px");
    expect(cssVar("--md-border-style")).toBe("dashed");
    expect(cssVar("--md-border-color")).toBe("#123456");
    expect(cssVar("--md-divider-width")).toBe("1px");
    expect(cssVar("--md-divider-style")).toBe("dotted");
    expect(cssVar("--md-divider-color")).toBe("#654321");
  });

  test("thickness-only divider keeps solid style and group fallback color", async () => {
    updateTheme({ mdBorder: { color: "", border: "", divider: "5px" } });
    await tick();
    expect(cssVar("--md-divider-width")).toBe("5px");
    expect(cssVar("--md-divider-style")).toBe("solid");
    expect(cssVar("--md-divider-color")).toBe(
      "color-mix(in srgb, var(--accent) 10%, transparent)"
    );
  });

  test("blank shadow falls back to none, a value overrides it", async () => {
    updateTheme({ mdShadow: "" });
    await tick();
    expect(cssVar("--md-shadow")).toBe("none");

    updateTheme({ mdShadow: "0 2px 8px rgba(0,0,0,0.3)" });
    await tick();
    expect(cssVar("--md-shadow")).toBe("0 2px 8px rgba(0,0,0,0.3)");
  });
});

describe("save to app-wide localStorage", () => {
  afterEach(() => {
    localStorage.removeItem("pynote-theme");
    localStorage.removeItem("theme_bg");
    localStorage.removeItem("theme_text");
  });

  test("saveThemeAppWide persists the theme without the saveToExport flag", async () => {
    updateTheme({
      colors: { background: "#0a0a0a", secondary: "#fafafa" },
      saveToExport: true,
    });
    await tick();

    saveThemeAppWide();

    const stored = JSON.parse(localStorage.getItem("pynote-theme") || "{}");
    expect(stored).not.toHaveProperty("saveToExport");
    expect(stored.colors.background).toBe("#0a0a0a");
    // Preloader colors are mirrored for the no-flash startup path.
    expect(localStorage.getItem("theme_bg")).toBe("#0a0a0a");
    expect(localStorage.getItem("theme_text")).toBe("#fafafa");

    updateTheme({ saveToExport: false });
    await tick();
  });
});

describe("load app-wide localStorage backfills nested defaults", () => {
  afterEach(() => {
    localStorage.removeItem("pynote-theme");
  });

  // Every top-level nested object in the theme. Computed from defaultTheme so a
  // newly added nested object is automatically covered: if loadAppTheme forgets
  // to deep-merge it, the "partial save" case below loses its defaults and fails.
  const nestedKeys = (Object.keys(defaultTheme) as (keyof typeof defaultTheme)[])
    .filter((k) => {
      const v = defaultTheme[k];
      return v !== null && typeof v === "object" && !Array.isArray(v);
    });

  test("a save missing every nested sub-field is backfilled to defaults", () => {
    // Simulate an older save: each nested object present but emptied of its
    // sub-fields (the wholesale-spread bug would leave these as {}).
    const partial: Record<string, unknown> = {};
    for (const k of nestedKeys) partial[k as string] = {};
    localStorage.setItem("pynote-theme", JSON.stringify(partial));

    const loaded = loadAppTheme();
    for (const k of nestedKeys) {
      expect(loaded[k]).toEqual(defaultTheme[k]);
    }
  });

  test("a save with one overridden sub-field keeps it while backfilling siblings", () => {
    localStorage.setItem(
      "pynote-theme",
      JSON.stringify({ colors: { background: "#123456" } })
    );

    const loaded = loadAppTheme();
    expect(loaded.colors.background).toBe("#123456");
    expect(loaded.colors.primary).toBe(defaultTheme.colors.primary);
  });
});

