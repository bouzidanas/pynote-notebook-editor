import { fc, test } from "@fast-check/vitest";
import { expect, vi } from "vitest";
import { CELL_MARKER, type DependencyInfo, exportPython, parsePython } from "../../src/lib/formats/python";
import type { DocCell, NotebookDocument } from "../../src/lib/formats/document";
import { cellId, hazardText, notebookDocument } from "../arbitraries/notebook";
import { markdownCell } from "../arbitraries/markdown";
import { renderNormalized } from "../support/markdown-render";

// Each property runs hundreds of cases, which takes seconds when the machine
// is busy (the suite runs files in parallel): more than a unit test's budget.
vi.setConfig({ testTimeout: 60_000 });

// Property tests for the .py export (docs/formats/exports.md). Seeds are
// printed on failure; replay one with test.prop(..., { seed, path }).

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const toLf = (text: string) => text.replace(/\r\n?/g, "\n");
// A code line that reads as a cell marker cannot be written (documented).
const hasMarkerLine = (cell: DocCell) => cell.type === "code" && toLf(cell.source).split("\n").some((line) => CELL_MARKER.test(line));

// Documents whose markdown cells are real Markdown documents too, not only
// hazard text, so comment wrapping runs on lists, tables and code blocks.
const notebook = fc.tuple(notebookDocument, fc.array(markdownCell, { maxLength: 3 })).map(([doc, prose]): NotebookDocument => ({
  ...doc,
  cells: doc.cells.map((cell, i) => (cell.type === "markdown" && i < prose.length ? { ...cell, source: prose[i] } : cell)),
}));

test.prop([notebook, fc.boolean(), fc.integer({ min: 12, max: 100 })], {
  numRuns: 300,
  // A markdown cell of a tab and U+2028: not blank to Markdown, though trim() drops it (found by this property).
  examples: [[{ metadata: {}, cells: [{ id: "m", type: "markdown", source: "\t\u2028", metadata: {} }] }, false, 12]],
})(
  "the script parses back to the same cells: code exact, raw exact, markdown rendering the same",
  (doc, pair, lineWidth) => {
    fc.pre(!doc.cells.some(hasMarkerLine));
    const result = exportPython(doc, { includeMarkdown: true, cellIds: pair, lineWidth });
    const back = unwrap(parsePython(result.text)).cells;
    // Without dependencies the notebook order is kept.
    expect(back.map((c) => c.type)).toEqual(doc.cells.map((c) => c.type));
    expect(result.codeOrder).toEqual(doc.cells.filter((c) => c.type === "code").map((c) => c.id));
    doc.cells.forEach((cell, i) => {
      const last = i === doc.cells.length - 1;
      const source = toLf(cell.source);
      if (cell.type === "code") {
        // The documented normalizations: LF line endings, and the file's
        // single final newline drops the last cell's trailing line breaks.
        expect(back[i].source).toBe(last ? source.replace(/\n+$/, "") : source);
        if (pair) expect(back[i].id).toBe(cell.id);
      } else if (cell.type === "raw") {
        expect(back[i].source).toBe(source.replace(/\0/g, "\uFFFD"));
      } else {
        expect(renderNormalized(back[i].source)).toBe(renderNormalized(source.replace(/\0/g, "\uFFFD")));
      }
    });
  },
);

test.prop([notebook, fc.boolean()], { numRuns: 200 })("the script is deterministic, LF only, NUL-free outside code, and ends with one newline", (doc, includeMarkdown) => {
  const text = exportPython(doc, { includeMarkdown }).text;
  expect(exportPython(structuredClone(doc), { includeMarkdown }).text).toBe(text);
  expect(text.startsWith("# ---\n# pynote:\n#   executionMode: reactive\n# ---\n")).toBe(true);
  expect(text).not.toContain("\r");
  expect(text.endsWith("\n")).toBe(true);
  expect(text.endsWith("\n\n")).toBe(false);
  const codeHasNul = doc.cells.some((c) => c.type === "code" && c.source.includes("\0"));
  if (!codeHasNul) expect(text).not.toContain("\0");
});

test.prop([fc.string({ unit: "binary", maxLength: 400 }), hazardText(400)], { numRuns: 300 })("the reader never throws", (a, b) => {
  for (const text of [a, b, `# %%\n${b}`, `# ---\n# pynote:\n${b}`]) {
    const result = parsePython(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Set(result.value.cells.map((c) => c.id)).size).toBe(result.value.cells.length);
  }
});

// --- Order -------------------------------------------------------------------

// Random dependency graphs over a few names: each code cell defines some
// names and reads others. The oracle is the plain definition: repeatedly
// emit the earliest cell whose definers are all emitted.
const graph = fc.integer({ min: 0, max: 8 }).chain((n) => fc.record({
  ids: fc.uniqueArray(cellId, { minLength: n, maxLength: n }),
  defs: fc.array(fc.subarray(["a", "b", "c", "d", "e", "_x", "f"], { maxLength: 2 }), { minLength: n, maxLength: n }),
  refs: fc.array(fc.subarray(["a", "b", "c", "d", "e", "_x", "f", "len"], { maxLength: 3 }), { minLength: n, maxLength: n }),
  prose: fc.array(fc.nat(n), { maxLength: 4 }),
}));

test.prop([graph], { numRuns: 500 })("code order: a valid order, the earliest possible, else notebook order with the reason", ({ ids, defs, refs, prose }) => {
  const cells: DocCell[] = ids.map((id, i) => ({ id, type: "code", source: `# cell ${i}`, metadata: {} }));
  // Prose cells inserted at random positions (positions counted in code cells).
  const all: DocCell[] = [];
  cells.forEach((cell, i) => {
    prose.filter((p) => p === i).forEach((_, k) => all.push({ id: `p${i}x${k}`, type: "markdown", source: `prose ${i}.${k}`, metadata: {} }));
    all.push(cell);
  });
  prose.filter((p) => p === cells.length).forEach((_, k) => all.push({ id: `tail${k}`, type: "markdown", source: `tail ${k}`, metadata: {} }));
  const dependencies = new Map<string, DependencyInfo>(ids.map((id, i) => [id, { definitions: defs[i], references: refs[i] }]));
  const result = exportPython({ cells: all, metadata: {} }, { includeMarkdown: true, dependencies });

  const definers = new Map<string, number[]>();
  defs.forEach((names, i) => names.filter((n) => !n.startsWith("_")).forEach((n) => definers.set(n, [...(definers.get(n) ?? []), i])));
  const duplicates = [...definers].filter(([, at]) => at.length > 1);
  expect(result.duplicateDefinitions).toEqual(duplicates.map(([name, at]) => ({ name, cellIds: at.map((i) => ids[i]) })).sort((x, y) => (x.name < y.name ? -1 : 1)));
  if (duplicates.length > 0) {
    expect(result.orderNote).toBe("duplicates");
    expect(result.codeOrder).toEqual(ids);
    return;
  }
  const needs = refs.map((names, i) => new Set(names.flatMap((n) => (n.startsWith("_") ? [] : (definers.get(n) ?? []))).filter((j) => j !== i)));
  const order: number[] = [];
  const done = new Set<number>();
  while (order.length < ids.length) {
    const next = ids.findIndex((_, i) => !done.has(i) && [...needs[i]].every((j) => done.has(j)));
    if (next < 0) break;
    order.push(next);
    done.add(next);
  }
  if (order.length < ids.length) {
    expect(result.orderNote).toBe("cycle");
    expect(result.codeOrder).toEqual(ids);
    expect(result.moved).toEqual([]);
    return;
  }
  expect(result.orderNote).toBeUndefined();
  expect(result.codeOrder).toEqual(order.map((i) => ids[i]));
  expect(result.moved).toEqual(order.filter((i, k) => i !== k).map((i) => ids[i]));

  // Prose travels with the next code cell; what precedes all code or follows
  // it stays put.
  const back = unwrap(parsePython(result.text)).cells.map((c) => c.source);
  const before = (i: number) => (i < cells.length ? prose.filter((p) => p === i).map((_, k) => `prose ${i}.${k}`) : []);
  const tail = prose.filter((p) => p === cells.length).map((_, k) => `tail ${k}`);
  expect(back).toEqual([...before(0), ...order.flatMap((i) => [...(i > 0 ? before(i) : []), `# cell ${i}`]), ...tail]);
});
