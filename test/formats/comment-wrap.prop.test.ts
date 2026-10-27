import { fc, test } from "@fast-check/vitest";
import { expect, vi } from "vitest";
import { markdownToComment } from "../../src/lib/formats/comment-wrap";
import { hazardText } from "../arbitraries/notebook";
import { ATOMS, markdownCell, markdownDocument, paragraph, plainWord, wrappableDocument } from "../arbitraries/markdown";
import { renderNormalized, uncomment } from "../support/markdown-render";

// Each property runs hundreds of cases, which takes seconds when the machine
// is busy (the suite runs files in parallel): more than a unit test's budget.
vi.setConfig({ testTimeout: 60_000 });

// Property tests for comment wrapping (docs/formats/exports.md, "Comment
// wrapping"). Seeds are printed on failure; replay one with
// test.prop(..., { seed, path }) while debugging.

const width = (text: string) => [...text].length;
const lineWidth = fc.integer({ min: 12, max: 100 });

test.prop([fc.oneof(fc.string({ unit: "binary", maxLength: 300 }), hazardText(300), markdownCell), fc.integer({ min: -5, max: 120 })], { numRuns: 400 })(
  "never throws and always writes comment lines",
  (md, w) => {
    const lines = markdownToComment(md, w);
    expect(markdownToComment(md, w)).toEqual(lines);
    for (const line of lines) {
      expect(line === "#" || line.startsWith("# ")).toBe(true);
      expect(line).not.toMatch(/[\r\n\0]/);
    }
    if (lines.length > 0) {
      expect(lines[0]).not.toBe("#");
      expect(lines[lines.length - 1]).not.toBe("#");
    }
  },
);

test.prop([markdownCell, lineWidth], {
  numRuns: 400,
  // A last line holding only U+FEFF: not blank to Markdown, though trim() drops it (found by this property).
  examples: [["> $$\n> x^2\n> \\\\\n$$\n\ncfncwttma jnheugrd\nvmzl g\n`x` $ | kqdjdukja averyveryverylongwordthatdoesnotfitonanylineatall\n\n\uFEFF", 46]],
})(
  "the comment is equivalent Markdown: it renders exactly like the cell",
  (md, w) => {
    // The documented normalizations: LF line endings, NUL as U+FFFD.
    const original = md.replace(/\r\n?/g, "\n").replace(/\0/g, "\uFFFD");
    expect(renderNormalized(uncomment(markdownToComment(md, w)))).toBe(renderNormalized(original));
  },
);

// Strip the prefixes that nesting adds: quote markers, list markers, task
// boxes and the indentation that hangs under them.
const content = (line: string) => {
  let rest = line.slice(2);
  for (let previous = ""; previous !== rest; ) {
    previous = rest;
    rest = rest.replace(/^ *(?:> ?|(?:[-*+]|\d{1,9}[.)]) (?:\[[ xX]\] )?)/, "");
  }
  return rest.trimStart();
};

test.prop([wrappableDocument, lineWidth], {
  numRuns: 400,
  // Deep nesting whose markers alone are wider than the width (found by this property).
  examples: [["> - > 10) > a\n>   >     >\n>   >     > a\n>   >\n>   >     a", 12]],
})(
  "no line exceeds the width unless it holds a single unbreakable word or atom, or only nesting markers",
  (md, w) => {
    for (const line of markdownToComment(md, w)) {
      if (width(line) <= w) continue;
      const rest = content(line);
      // Nesting markers are kept verbatim and never broken: a line of them alone can be wider.
      if (rest === "") continue;
      expect(ATOMS.includes(rest) || /^\S+$/.test(rest), `line ${JSON.stringify(line)} is wider than ${w}`).toBe(true);
    }
  },
);

test.prop([fc.array(paragraph(false), { minLength: 1, maxLength: 4 }), lineWidth], { numRuns: 400 })(
  "the words of every paragraph appear in order: wrapping only changes whitespace",
  (paragraphs, w) => {
    const md = paragraphs.join("\n\n");
    const words = (text: string) => text.split(/\s+/).filter((word) => word !== "");
    // The documented escapes: "\$" for a dollar that would become math and
    // "\%%" for a line that would read as a cell marker render unchanged.
    const unescaped = (word: string) => word.replace(/^\\(?=\$|%%)/, "");
    expect(words(uncomment(markdownToComment(md, w))).map(unescaped)).toEqual(words(md));
  },
);

const codeLines = fc.array(fc.oneof(fc.stringMatching(/^[ a-z0-9=():%#"'.,+*-]{0,120}$/), fc.constant("")), { minLength: 1, maxLength: 8 });

test.prop([paragraph(), codeLines, paragraph(), lineWidth], { numRuns: 300 })(
  "code blocks are kept verbatim, whatever the width",
  (before, code, after, w) => {
    const block = ["```text", ...code, "```"];
    const out = markdownToComment(`${before}\n\n${block.join("\n")}\n\n${after}`, w);
    const expected = block.map((line) => (line === "" ? "#" : `# ${line}`));
    const start = out.indexOf("# ```text");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(out.slice(start, start + expected.length)).toEqual(expected);
  },
);

const cell = fc.oneof(fc.array(plainWord, { maxLength: 3 }).map((w) => w.join(" ")), fc.constantFrom("a \\| b", "😀", "", "数据"));
test.prop([
  fc.integer({ min: 1, max: 5 }).chain((n) => fc.tuple(
    fc.array(cell, { minLength: n, maxLength: n }),
    fc.array(fc.constantFrom("---", ":--", "--:", ":-:"), { minLength: n, maxLength: n }),
    fc.array(fc.array(cell, { minLength: n, maxLength: n }), { maxLength: 5 }),
  )),
  lineWidth,
], { numRuns: 300 })("tables are re-aligned: every row puts its pipes in the same columns", ([header, delims, rows], w) => {
  const md = [header, delims, ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
  const out = markdownToComment(md, w);
  expect(out).toHaveLength(rows.length + 2);
  // Columns of unescaped pipes, in code points.
  const pipes = (line: string) => [...line].flatMap((ch, i, chars) => (ch === "|" && chars[i - 1] !== "\\" ? [i] : []));
  for (const line of out) expect(pipes(line)).toEqual(pipes(out[0]));
});

test.prop([markdownDocument, lineWidth], { numRuns: 200 })("comment lines never read as py:percent cell markers", (md, w) => {
  // Paragraph lines are escaped here; verbatim lines are escaped by the
  // .py writer (see python.prop.test.ts), so only check reflowed text.
  for (const line of markdownToComment(md, w)) {
    if (/^# %%/.test(line)) expect(md.split("\n").some((source) => source.trimStart().startsWith("%%"))).toBe(true);
  }
});
