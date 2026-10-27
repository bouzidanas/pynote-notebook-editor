import { fc, test } from "@fast-check/vitest";
import { expect, vi } from "vitest";
import { structuredPatch } from "diff";
import { parsePynote, serializePynote } from "../../src/lib/formats/pynote";
import { parseIpynb, serializeIpynb } from "../../src/lib/formats/ipynb";
import { cloneJson, isJsonObject, type NotebookDocument } from "../../src/lib/formats/document";
import { hazardText, notebookDocument } from "../arbitraries/notebook";

// Each property runs hundreds of cases, which takes seconds when the machine
// is busy (the suite runs files in parallel): more than a unit test's budget.
vi.setConfig({ testTimeout: 60_000 });

// Property tests for .pynote (docs/formats/pynote.md).

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

// The format's one documented normalization: an empty undo history is not
// stored, and a PyNote settings object left empty by that disappears.
const normalize = (doc: NotebookDocument): NotebookDocument => {
  const out = cloneJson(doc as any) as NotebookDocument;
  const py = out.metadata.PyNote;
  if (isJsonObject(py) && Array.isArray(py.history) && py.history.length === 0) {
    delete py.history;
    if (Object.keys(py).length === 0) delete out.metadata.PyNote;
  }
  return out;
};

// Documents whose PyNote settings are arbitrary JSON, to exercise the
// front matter mapping as hard as the cell markers.
const withPyNote = fc.tuple(notebookDocument, fc.option(fc.oneof(
  fc.dictionary(hazardText(10), fc.jsonValue({ maxDepth: 2 }) as fc.Arbitrary<any>, { maxKeys: 4, noNullPrototype: true }),
  fc.record({ executionMode: fc.constantFrom("hybrid", "reactive"), history: fc.array(hazardText(30), { maxLength: 3 }) }),
), { nil: undefined })).map(([doc, py]) => (py === undefined ? doc : { ...doc, metadata: { ...doc.metadata, PyNote: py } }));

test.prop([withPyNote], { numRuns: 500 })("document -> .pynote -> document is the identity (modulo empty history)", (doc) => {
  expect(unwrap(parsePynote(serializePynote(doc)))).toEqual(normalize(doc));
});

test.prop([withPyNote], { numRuns: 300 })(".pynote output is deterministic, LF only, NUL-free and ends with one newline", (doc) => {
  const text = serializePynote(doc);
  expect(serializePynote(structuredClone(doc))).toBe(text);
  expect(text).not.toMatch(/[\r\0]/);
  expect(text.endsWith("\n")).toBe(true);
  expect(text.endsWith("\n\n\n\n")).toBe(false);
});

test.prop([withPyNote], { numRuns: 300 })(".ipynb and .pynote agree: converting through .pynote changes nothing", (doc) => {
  const ipynb = serializeIpynb(normalize(doc));
  expect(serializeIpynb(unwrap(parsePynote(serializePynote(unwrap(parseIpynb(ipynb))))))).toBe(ipynb);
});

// Line range of a cell in a .pynote file: from its marker line up to the next
// cell's marker (or the trailer / end of file).
const cellLines = (text: string, ids: string[], index: number): [number, number] => {
  const lines = text.split("\n");
  const isMarkerOf = (line: string, id: string) =>
    line.startsWith(`<!-- cell ${id} `) || line === `<!-- cell ${id} -->` || new RegExp(`^\`{3,}(python|raw|markdown) \\{#${id}[ }]`).test(line);
  const start = lines.findIndex((line) => isMarkerOf(line, ids[index]));
  const nextId = ids[index + 1];
  let end = nextId === undefined ? lines.findIndex((line) => line === "<!-- pynote") : lines.findIndex((line) => isMarkerOf(line, nextId));
  if (end < 0) end = lines.length;
  return [start, end];
};

test.prop([notebookDocument, fc.nat(), hazardText()], { numRuns: 300 })(
  "git friendliness: editing one cell's source changes only that cell's lines",
  (doc, k, source) => {
    fc.pre(doc.cells.length > 0);
    const i = k % doc.cells.length;
    const edited = { ...doc, cells: doc.cells.map((c, j) => (j === i ? { ...c, source } : c)) };
    const before = serializePynote(doc);
    const after = serializePynote(edited);
    const ids = doc.cells.map((c) => c.id);
    const [oldStart, oldEnd] = cellLines(before, ids, i);
    const [newStart, newEnd] = cellLines(after, ids, i);
    expect(oldStart).toBe(newStart); // nothing before the cell moved
    const patch = structuredPatch("a", "b", before, after, "", "", { context: 0 });
    for (const hunk of patch.hunks) {
      // jsdiff hunk starts are 1-based; a pure insertion has oldLines 0.
      expect(hunk.oldStart - 1).toBeGreaterThanOrEqual(oldStart);
      expect(hunk.oldStart - 1 + hunk.oldLines).toBeLessThanOrEqual(oldEnd);
      expect(hunk.newStart - 1).toBeGreaterThanOrEqual(newStart);
      expect(hunk.newStart - 1 + hunk.newLines).toBeLessThanOrEqual(newEnd);
    }
  },
);

test.prop([fc.string({ unit: "binary", maxLength: 300 }), hazardText(300)], { numRuns: 300 })(
  "the reader never throws on arbitrary text",
  (a, b) => {
    for (const text of [a, b, `---\npynote: 1\n---\n${b}`]) {
      const result = parsePynote(text);
      if (result.ok) expect(new Set(result.value.cells.map((c) => c.id)).size).toBe(result.value.cells.length);
    }
  },
);
