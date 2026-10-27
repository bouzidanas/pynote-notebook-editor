import { fc, test } from "@fast-check/vitest";
import { expect, vi } from "vitest";
import { exportPair, mergePair } from "../../src/lib/formats/pair";
import { CELL_MARKER } from "../../src/lib/formats/python";
import type { DocCell, NotebookDocument } from "../../src/lib/formats/document";
import { hazardText, notebookDocument } from "../arbitraries/notebook";

// Each property runs hundreds of cases, which takes seconds when the machine
// is busy (the suite runs files in parallel): more than a unit test's budget.
vi.setConfig({ testTimeout: 60_000 });

// Property tests for the .py/.md pair (docs/formats/exports.md).

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const toLf = (text: string) => text.replace(/\r\n?/g, "\n");
const hasMarkerLine = (source: string) => toLf(source).split("\n").some((line) => CELL_MARKER.test(line));
// Pairs whose code can be written as py:percent (documented limitation).
const pairable = notebookDocument.filter((doc) => !doc.cells.some((c) => c.type === "code" && hasMarkerLine(c.source)));

/**
 * The cells a merge gives back: everything, in notebook order, with the
 * documented normalizations (LF line endings; each file's single final
 * newline drops the trailing line breaks of its last cell).
 */
const expected = (doc: NotebookDocument, codeOrder: string[]): Array<[string, string, string]> => {
  const lastPy = codeOrder[codeOrder.length - 1];
  const lastMd = doc.cells[doc.cells.length - 1];
  return doc.cells.map((c) => {
    let source = toLf(c.source);
    if ((c.type === "code" && c.id === lastPy) || (c.type === "markdown" && c === lastMd)) source = source.replace(/\n+$/, "");
    return [c.id, c.type, source];
  });
};

const shape = (cells: DocCell[]) => cells.map((c): [string, string, string] => [c.id, c.type, c.source]);

// Code edits are plain lines: no marker line, no CR, no trailing line break.
const newSource = hazardText(60).map((s) => toLf(s).replace(/\n+$/, "")).filter((s) => !hasMarkerLine(s));

// The region of a code cell in the .py: its marker line up to the next marker.
const cellRegion = (lines: string[], id: string): [number, number] => {
  const start = lines.indexOf(`# %% id=${JSON.stringify(id)}`);
  let end = start + 1;
  while (end < lines.length && !CELL_MARKER.test(lines[end])) end++;
  return [start, end];
};

test.prop([pairable], { numRuns: 400 })("merging an exported pair gives the notebook back: ids, types, sources, order", (doc) => {
  const { py, md, python } = exportPair(doc, { baseName: "nb" });
  const { cells, metadata } = unwrap(mergePair(py, md));
  expect(shape(cells)).toEqual(expected(doc, python.codeOrder));
  expect(metadata.PyNote).toEqual({ executionMode: "reactive" });
});

test.prop([pairable, fc.nat(), newSource], { numRuns: 300 })("editing a code cell in the .py changes exactly that cell", (doc, k, source) => {
  const code = doc.cells.filter((c) => c.type === "code");
  fc.pre(code.length > 0);
  const target = code[k % code.length];
  const { py, md, python } = exportPair(doc, { baseName: "nb" });
  const lines = py.split("\n");
  const [start, end] = cellRegion(lines, target.id);
  // Keep the blank separator line (and the file's final empty string).
  const keep = end < lines.length || lines[end - 1] === "" ? 1 : 0;
  const edited = [...lines.slice(0, start + 1), ...(source === "" ? [] : source.split("\n")), ...lines.slice(end - keep)].join("\n");
  const want = expected(doc, python.codeOrder).map((c): [string, string, string] => (c[0] === target.id ? [c[0], c[1], source] : c));
  expect(shape(unwrap(mergePair(edited, md)).cells)).toEqual(want);
});

test.prop([pairable, fc.nat(), newSource], { numRuns: 300 })("a cell added after another in the .py lands right after it", (doc, k, source) => {
  const code = doc.cells.filter((c) => c.type === "code");
  fc.pre(code.length > 0);
  const after = code[k % code.length];
  const { py, md } = exportPair(doc, { baseName: "nb" });
  const lines = py.split("\n");
  const [, end] = cellRegion(lines, after.id);
  const body = source === "" ? [] : source.split("\n");
  // Before the next marker, or before the empty string after the final newline.
  const at = end < lines.length ? end : end - 1;
  const insert = end < lines.length ? ["# %%", ...body, ""] : ["", "# %%", ...body];
  const edited = [...lines.slice(0, at), ...insert, ...lines.slice(at)].join("\n");
  const cells = unwrap(mergePair(edited, md)).cells;
  expect(cells).toHaveLength(doc.cells.length + 1);
  const ids = cells.map((c) => c.id);
  const added = cells.find((c) => !doc.cells.some((d) => d.id === c.id))!;
  expect(added.type).toBe("code");
  expect(added.source).toBe(source);
  expect(ids.indexOf(added.id)).toBe(ids.indexOf(after.id) + 1);
});

test.prop([pairable, fc.nat()], { numRuns: 300 })("deleting an anchor from the .md drops nothing: the cell follows its .py predecessor", (doc, k) => {
  const code = doc.cells.filter((c) => c.type === "code");
  fc.pre(code.length > 0);
  const target = code[k % code.length];
  const { py, md, python } = exportPair(doc, { baseName: "nb" });
  const edited = md.split("\n").filter((line) => line !== `<!-- code ${target.id} -->`).join("\n");
  const cells = unwrap(mergePair(py, edited)).cells;
  const ids = cells.map((c) => c.id);
  expect([...ids].sort()).toEqual(doc.cells.map((c) => c.id).sort());
  const position = python.codeOrder.indexOf(target.id);
  if (position > 0) {
    expect(ids.indexOf(target.id)).toBe(ids.indexOf(python.codeOrder[position - 1]) + 1);
  } else {
    // First in the .py: before the first code cell that kept its anchor (or last).
    const firstAnchored = ids.findIndex((id) => id !== target.id && code.some((c) => c.id === id));
    expect(ids.indexOf(target.id)).toBe(firstAnchored < 0 ? ids.length - 1 : firstAnchored - 1);
  }
});

test.prop([fc.string({ unit: "binary", maxLength: 300 }), hazardText(300), hazardText(300)], { numRuns: 300 })("merging never throws", (a, b, c) => {
  for (const [py, md] of [[a, b], [b, c], [`# %% id="x"\n${b}`, `<!-- code x -->\n${c}`]]) {
    const result = mergePair(py, md);
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Set(result.value.cells.map((cell) => cell.id)).size).toBe(result.value.cells.length);
  }
});
