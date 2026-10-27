import { describe, expect, it } from "vitest";
import { containsMath, exportFontNeeds, parseUnicodeRange, primaryFamily, selectFonts } from "./fonts";

const face = (family: string, range: string | null, extra = "") =>
  `@font-face{font-family:"${family}";font-style:normal;font-weight:400;${range ? `unicode-range:${range};` : ""}src:url(data:font/woff2;base64,AAAA) format("woff2"),url(data:font/woff;base64,BBBB) format("woff")${extra}}`;

const css = [
  ".a{color:red}",
  face("JetBrains Mono Variable", "U+0000-00FF,U+0131"),
  face("JetBrains Mono Variable", "U+0400-045F"), // cyrillic
  face("KaTeX_Main", null),
  face("KaTeX_Size2", null),
  face("Roboto Mono Variable", "U+0000-00FF"),
  ".b{color:blue}",
].join("");

const jetbrains = new Set(["JetBrains Mono Variable"]);

describe("selectFonts", () => {
  it("keeps only the theme's families and the subsets the text uses, woff2 only", () => {
    const out = selectFonts(css, { families: jetbrains, text: "hello", math: false });
    expect(out).toContain(".a{color:red}");
    expect(out).toContain(".b{color:blue}");
    expect(out.match(/@font-face/g)).toHaveLength(1);
    expect(out).toContain("U+0000-00FF");
    expect(out).not.toContain("font/woff;");
    expect(out).not.toContain("Roboto");
    expect(out).not.toContain("KaTeX");
  });

  it("adds a subset when the notebook's text needs it", () => {
    const out = selectFonts(css, { families: jetbrains, text: "Привет", math: false });
    expect(out.match(/@font-face/g)).toHaveLength(2);
  });

  it("keeps faces without a unicode-range when their family is needed", () => {
    const out = selectFonts(css, { families: new Set(["KaTeX_Main"]), text: "", math: false });
    expect(out).toContain('font-family:"KaTeX_Main"');
  });

  it("keeps every KaTeX face when the pages can show math", () => {
    const out = selectFonts(css, { families: jetbrains, text: "hello", math: true });
    expect(out).toContain('font-family:"KaTeX_Main"');
    expect(out).toContain('font-family:"KaTeX_Size2"');
    expect(out).not.toContain("Roboto");
  });
});

describe("exportFontNeeds", () => {
  const fonts = ['"JetBrains Mono Variable", monospace', undefined, ""];
  const prose = { cells: [{ type: "markdown", source: "# Plain prose" }] };
  const math = { cells: [{ type: "markdown", source: "Energy:\n\n$$\n\\sum_i E_i\n$$" }] };

  it("names the theme's primary families", () => {
    expect([...exportFontNeeds({ fonts, content: prose, interactive: false }).families]).toEqual(["JetBrains Mono Variable"]);
  });

  it("keeps KaTeX for read-only content with math, and drops it without", () => {
    expect(exportFontNeeds({ fonts, content: math, interactive: false }).math).toBe(true);
    expect(exportFontNeeds({ fonts, content: [prose, { out: { stdout: ["$x^2$"] } }], interactive: false }).math).toBe(true);
    expect(exportFontNeeds({ fonts, content: prose, interactive: false }).math).toBe(false);
  });

  it("always keeps KaTeX in interactive exports: readers can add math", () => {
    expect(exportFontNeeds({ fonts, content: prose, interactive: true }).math).toBe(true);
  });

  it("subsets by every character the content shows", () => {
    expect(exportFontNeeds({ fonts, content: { text: "Привет" }, interactive: false }).text).toContain("Привет");
  });
});

describe("helpers", () => {
  it("parses unicode ranges, including wildcards", () => {
    expect(parseUnicodeRange("U+0000-00FF, U+0131, U+04??")).toEqual([[0, 255], [0x131, 0x131], [0x400, 0x4ff]]);
  });

  it("finds the primary family of a stack", () => {
    expect(primaryFamily('"JetBrains Mono Variable", monospace')).toBe("JetBrains Mono Variable");
    expect(primaryFamily("")).toBeNull();
  });

  it("detects math the way markdown and outputs carry it", () => {
    expect(containsMath("Energy $E = mc^2$ here")).toBe(true);
    expect(containsMath("$$\\int x$$")).toBe(true);
    expect(containsMath("$\nx^2\n$")).toBe(true); // block math with single dollars
    expect(containsMath(JSON.stringify("$\nx^2\n$"))).toBe(true);
    expect(containsMath('<span class="katex">')).toBe(true);
    expect(containsMath(JSON.stringify('<span class="katex">'))).toBe(true);
    expect(containsMath("costs $5 and $10")).toBe(true); // conservative: may include KaTeX unnecessarily
    expect(containsMath("costs $5")).toBe(false);
    expect(containsMath("no math")).toBe(false);
  });
});
