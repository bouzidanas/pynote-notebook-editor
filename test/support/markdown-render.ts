import { Marked } from "marked";
import { katexMathExtensions } from "../../src/lib/markdown-katex";

// Markdown rendered the way PyNote renders a markdown cell: GFM, and math with
// the rules and KaTeX options the app uses (src/lib/markdown-katex.ts). Tests
// compare renderings to check that a transformation produced equivalent
// Markdown.

const pynoteMarked = new Marked();
// strict: "ignore" only silences KaTeX's console warnings for LaTeX-incompatible
// input (the app warns); the HTML is the same.
pynoteMarked.use({ extensions: katexMathExtensions({ strict: "ignore" }) });

const BLOCK_TAGS = "p|li|ul|ol|blockquote|h[1-6]|table|thead|tbody|tr|th|td|pre|hr|div|br|input|span class=\"katex-display\"";

/**
 * HTML for `markdown`, with whitespace normalized the way a browser lays it
 * out: runs collapse to one space, and space next to block-level tags goes.
 */
export function renderNormalized(markdown: string): string {
  const html = pynoteMarked.parse(markdown, { async: false });
  return html
    .replace(/\s+/g, " ")
    .replace(new RegExp(` ?(</?(?:${BLOCK_TAGS})\\b[^>]*>) ?`, "g"), "$1")
    .trim();
}

/** The Markdown inside comment lines written by markdownToComment. */
export const uncomment = (lines: string[]): string => lines.map((line) => (line === "#" ? "" : line.slice(2))).join("\n");
