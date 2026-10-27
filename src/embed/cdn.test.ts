import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FONT_OPTIONS } from "../components/theme-dialog/constants";
import { primaryFamily } from "../lib/font-loader";
import { FONT_PACKAGE_SPECS, KATEX_FONTS, KATEX_PACKAGE, fontStylesheet, katexFontFaces } from "./cdn";

const NODE_MODULES = path.resolve(import.meta.dirname, "../../node_modules");
const installed = (name: string) => JSON.parse(readFileSync(path.join(NODE_MODULES, name, "package.json"), "utf8")).version as string;

describe("CDN files for embedded cells", () => {
  test("cover every font family the app bundles", () => {
    for (const option of FONT_OPTIONS) {
      const family = primaryFamily(option.value)!;
      expect(fontStylesheet(family), family).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource/);
    }
  });

  test("use the versions installed with the app", () => {
    for (const spec of Object.values(FONT_PACKAGE_SPECS)) {
      const at = spec.lastIndexOf("@");
      expect(spec).toBe(`${spec.slice(0, at)}@${installed(spec.slice(0, at))}`);
    }
    expect(KATEX_PACKAGE).toBe(`katex@${installed("katex")}`);
    expect(KATEX_FONTS).toBe(`https://cdn.jsdelivr.net/npm/katex@${installed("katex")}/dist/fonts/`);
  });

  test("the page gets KaTeX's font faces and nothing else of its stylesheet", () => {
    const stylesheet = readFileSync(path.join(NODE_MODULES, "katex/dist/katex.min.css"), "utf8");
    const faces = katexFontFaces(stylesheet);
    const rules = faces.split("\n");
    expect(rules.length).toBe(stylesheet.match(/@font-face/g)!.length);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).toMatch(/^@font-face\s*\{[^{}]*\}$/);
    // No class rules (.katex{font:normal 1.21em ...}) that would restyle the page's own math.
    expect(faces).not.toContain(".katex");
    // Every font file is the installed one, on the CDN.
    const urls = [...faces.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(KATEX_FONTS), url).toBe(true);
      expect(existsSync(path.join(NODE_MODULES, "katex/dist/fonts", url.slice(KATEX_FONTS.length))), url).toBe(true);
    }
  });
});
