import { type Locator, type Page, expect, test as base } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import type { PyNoteConfig } from "../../src/embed/types";
import { PYODIDE_CDN_URL, PYODIDE_VERSION } from "../../src/lib/pyodide-config";
import { TESTID } from "../../src/lib/testids";
import { BUILTIN_THEMES } from "../../src/lib/themes";
import config from "../../test/consumers/html/pynote.config.json" with { type: "json" };

// Shared by the consumer specs: the network rules every page runs under, and
// how to reach a cell's parts (each cell lives in its element's shadow root;
// Playwright's locators pierce it).

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const MIRROR = path.join(ROOT, ".cache/pyodide", PYODIDE_VERSION);
const CDN_NPM = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/;

export interface Watched {
  errors: string[];
  warnings: string[];
  external: string[];
  /** Requests for jsDelivr's Pyodide, served from the local mirror. */
  pyodideFromCdn: string[];
}

// Pyodide from the local mirror, jsDelivr's npm files (font stylesheets,
// KaTeX's fonts) from node_modules (cdn.test.ts keeps their versions equal);
// anything else off the page's own origin is a failure, and so is a console
// error.
export const test = base.extend<{ watched: Watched }>({
  watched: async ({ page, context }, use) => {
    const watched: Watched = { errors: [], warnings: [], external: [], pyodideFromCdn: [] };
    page.on("console", (message) => {
      if (message.type() === "error") watched.errors.push(message.text());
      if (message.type() === "warning") watched.warnings.push(message.text());
    });
    page.on("pageerror", (error) => watched.errors.push(`${error.name}: ${error.message}`));
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
      const url = route.request().url();
      let file: string | null = null;
      if (url.startsWith(PYODIDE_CDN_URL)) {
        watched.pyodideFromCdn.push(url);
        file = path.join(MIRROR, decodeURIComponent(url.slice(PYODIDE_CDN_URL.length)));
      }
      const npm = CDN_NPM.exec(url);
      if (npm) file = path.join(ROOT, "node_modules", npm[1], decodeURIComponent(npm[2]));
      if (file && existsSync(file)) {
        await route.fulfill({ path: file, headers: { "Access-Control-Allow-Origin": "*" } });
        return;
      }
      watched.external.push(url);
      await route.abort();
    });
    await use(watched);
    expect(watched.external, "requests that left the machine").toEqual([]);
    expect(watched.errors, "console errors").toEqual([]);
  },
});

export { expect };

/** Where a consumer project is served (playwright.consumers.config.ts). */
export const consumerUrl = (name: string, page = "") => `${process.env[`PYNOTE_CONSUMER_${name.toUpperCase().replace(/-/g, "_")}`]}/${page}`;

export const cell = (page: Page, id: string) => page.locator(`[data-pynote-cell="${id}"]`);
export const output = (page: Page, id: string) => cell(page, id).getByTestId(TESTID.cellOutput);
export const editor = (page: Page, id: string) => cell(page, id).locator(".cm-content");
export const runButton = (page: Page, id: string) => cell(page, id).getByRole("button", { name: "Run Cell" });
/** The run button and menu in the cell's corner. */
export const toolbar = (page: Page, id: string) => runButton(page, id).locator("..");

export const openMenu = async (page: Page, id: string): Promise<Locator> => {
  await cell(page, id).getByRole("button", { name: "Cell menu" }).click();
  return cell(page, id).getByRole("menu");
};

/** Whether `target` is drawn over `other` where they overlap (they must): a click there reaches `target`. */
export const drawnOver = async (target: Locator, other: Locator) => {
  const beneath = await other.elementHandle();
  return target.evaluate((element, below) => {
    const box = element.getBoundingClientRect();
    const under = (below as Element).getBoundingClientRect();
    const top = Math.max(box.top, under.top);
    const bottom = Math.min(box.bottom, under.bottom);
    const left = Math.max(box.left, under.left);
    const right = Math.min(box.right, under.right);
    if (bottom - top < 8 || right - left < 8) return false;
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    let hit = document.elementFromPoint(x, y);
    while (hit?.shadowRoot) {
      const inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) break;
      hit = inner;
    }
    return hit !== null && element.contains(hit);
  }, beneath);
};

/** Whether a click at the right end of `target` reaches it (not something drawn over it). */
export const receivesClicksAtRightEnd = (target: Locator) =>
  target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = box.right - 8;
    const y = box.top + box.height / 2;
    let hit = document.elementFromPoint(x, y);
    while (hit?.shadowRoot) {
      const inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) break;
      hit = inner;
    }
    return hit !== null && element.contains(hit);
  });

/**
 * The consumer projects' pynote.config.json, the same in all four: what
 * PyNote's Export dialog writes for a notebook with the theme preset below
 * (src/embed/consumer-configs.test.ts). Imported as TypeScript projects
 * import it, it is a config the package's types accept (configure(config)
 * type-checks).
 */
export const CONFIG = config satisfies PyNoteConfig;
export const THEME = BUILTIN_THEMES.neobrutal_light;

/** A hex color as computed styles give it. */
export const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** A length in rem, in pixels (the pages keep the browser's 16px root size). */
export const px = (rem: string) => `${Number.parseFloat(rem) * 16}px`;

/**
 * A docs site's keyboard shortcuts, as DocSearch and slide decks have them,
 * for page.addInitScript: "/" or "s" opens the search and the arrows turn the
 * page, unless the reader is typing in a field; Ctrl+K or Cmd+K opens the
 * search from anywhere. What the site did goes into window.shortcuts.
 */
export function docsShortcuts() {
  const site = window as unknown as { shortcuts: string[] };
  site.shortcuts = [];
  const typing = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
  };
  window.addEventListener("keydown", (event) => {
    const search = (event.ctrlKey || event.metaKey) && event.key === "k";
    if (search || (["/", "s", "ArrowLeft", "ArrowRight"].includes(event.key) && !typing(event))) {
      event.preventDefault();
      site.shortcuts.push(search ? "search" : event.key);
    }
  });
}

/** What the page's shortcuts did (docsShortcuts). */
export const pageShortcuts = (page: Page) => page.evaluate(() => (window as unknown as { shortcuts: string[] }).shortcuts);

/** Every cell on the page in the theme's colors, fonts and radii: its frame, and its code in the code font. */
export async function expectThemedCells(page: Page) {
  const frames = page.locator(".pynote-cell");
  expect(await frames.count()).toBeGreaterThan(1);
  for (const frame of await frames.all()) {
    await expect(frame).toHaveCSS("background-color", rgb(THEME.colors.background));
    await expect(frame).toHaveCSS("color", rgb(THEME.colors.secondary));
    await expect(frame).toHaveCSS("font-family", THEME.font);
    await expect(frame).toHaveCSS("font-weight", THEME.fontWeight);
    await expect(frame).toHaveCSS("border-radius", px(THEME.radii.sm));
  }
  for (const code of await page.locator(".cm-content").all()) {
    await expect(code).toHaveCSS("font-family", THEME.codeTypography.fontFamily);
    await expect(code).toHaveCSS("font-size", px(THEME.codeTypography.editorFontSize));
  }
}
