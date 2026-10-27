import { fc, test } from "@fast-check/vitest";
import { expect, vi } from "vitest";
import { exportMarkdown, parseMarkdown } from "../../src/lib/formats/markdown";
import type { DocCell, NotebookDocument } from "../../src/lib/formats/document";
import { cellId, hazardText, notebookDocument } from "../arbitraries/notebook";

// Each property runs hundreds of cases, which takes seconds when the machine
// is busy (the suite runs files in parallel): more than a unit test's budget.
vi.setConfig({ testTimeout: 60_000 });

// Property tests for the .md export (docs/formats/exports.md).

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const toLf = (text: string) => text.replace(/\r\n?/g, "\n");
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;

// Code and prose only; prose without fence lines (a python fence in prose
// would read back as code).
const codeAndProse = fc.uniqueArray(
  fc.tuple(cellId, fc.oneof(
    fc.record({ type: fc.constant("code" as const), source: hazardText() }),
    fc.record({ type: fc.constant("markdown" as const), source: hazardText().filter((s) => !toLf(s).split("\n").some((line) => FENCE_LINE.test(line))) }),
  )),
  { selector: ([id]) => id, maxLength: 8 },
).map((cells): NotebookDocument => ({ cells: cells.map(([id, c]) => ({ id, ...c, metadata: {} }) as DocCell), metadata: {} }));

// What a plain .md keeps: prose and code in order, adjacent prose cells as
// one (they are only separated by a blank line), blank prose dropped, LF
// line endings, the last prose cell's trailing line breaks dropped by the
// file's single final newline, and a U+FEFF that starts the file read as a
// byte order mark.
const expectedCells = (doc: NotebookDocument): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  for (const cell of doc.cells) {
    const source = toLf(cell.source);
    if (cell.type === "code") out.push(["code", source]);
    else if (source.trim() !== "") {
      const last = out[out.length - 1];
      if (last?.[0] === "markdown") last[1] += `\n\n${source}`;
      else out.push(["markdown", source]);
    }
  }
  const last = out[out.length - 1];
  if (last?.[0] === "markdown") last[1] = last[1].replace(/\n+$/, "");
  if (out[0]?.[0] === "markdown") out[0][1] = out[0][1].replace(/^\ufeff/, "");
  return out;
};

test.prop([codeAndProse], { numRuns: 400 })("a plain export of code and prose reads back to the same cells", (doc) => {
  const cells = unwrap(parseMarkdown(exportMarkdown(doc, { includeCode: true }))).cells;
  expect(cells.map((c) => [c.type, c.source])).toEqual(expectedCells(doc));
});

test.prop([notebookDocument, fc.boolean(), fc.boolean()], { numRuns: 300 })("output is deterministic, LF only, with one final newline", (doc, pairAnchors, includeCode) => {
  const text = exportMarkdown(doc, { includeCode, pairAnchors, pairedWith: "x.py" });
  expect(exportMarkdown(structuredClone(doc), { includeCode, pairAnchors, pairedWith: "x.py" })).toBe(text);
  expect(text).not.toContain("\r");
  if (text !== "") {
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  }
});

test.prop([notebookDocument], { numRuns: 300 })("a pair half reads back to the same cells, code as empty anchors", (doc) => {
  const cells = unwrap(parseMarkdown(exportMarkdown(doc, { includeCode: false, pairAnchors: true }))).cells;
  expect(cells.map((c) => [c.id, c.type])).toEqual(doc.cells.map((c) => [c.id, c.type]));
  doc.cells.forEach((cell, i) => {
    const source = toLf(cell.source);
    const last = i === doc.cells.length - 1;
    if (cell.type === "code") expect(cells[i].source).toBe("");
    else if (cell.type === "raw") expect(cells[i].source).toBe(source);
    else expect(cells[i].source).toBe(last ? source.replace(/\n+$/, "") : source);
  });
});

test.prop([fc.string({ unit: "binary", maxLength: 400 }), hazardText(400)], { numRuns: 300 })("the reader never throws", (a, b) => {
  for (const text of [a, b, `<!-- cell x -->\n${b}`, `<!-- raw r -->\n\`\`\`\n${b}`]) {
    const result = parseMarkdown(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Set(result.value.cells.map((c) => c.id)).size).toBe(result.value.cells.length);
  }
});
