import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fc, test } from "@fast-check/vitest";
import { expect, vi } from "vitest";
import Ajv from "ajv-draft-04";
import { fromIpynbJson, parseIpynb, serializeIpynb, stripPyNoteMetadata } from "../../src/lib/formats/ipynb";
import { cellId, hazardText, jsonValue, metadata, notebookDocument } from "../arbitraries/notebook";

// Each property runs hundreds of cases, which takes seconds when the machine
// is busy (the suite runs files in parallel): more than a unit test's budget.
vi.setConfig({ testTimeout: 60_000 });

// Property tests for the .ipynb reader/writer. Seeds are printed on failure;
// replay one with test.prop(..., { seed, path }) while debugging.
const schema = JSON.parse(readFileSync(resolve(__dirname, "../vendor/nbformat/nbformat.v4.5.schema.json"), "utf8"));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

test.prop([notebookDocument], { numRuns: 400 })("document -> .ipynb -> document is the identity", (doc) => {
  expect(unwrap(parseIpynb(serializeIpynb(doc)))).toEqual(doc);
});

test.prop([notebookDocument], { numRuns: 400 })("every written notebook is valid nbformat 4.5", (doc) => {
  const nb = JSON.parse(serializeIpynb(doc));
  expect(validate(nb) ? [] : validate.errors).toEqual([]);
});

test.prop([notebookDocument], { numRuns: 200 })("writing is deterministic and ends with one newline", (doc) => {
  const text = serializeIpynb(doc);
  expect(serializeIpynb(structuredClone(doc))).toBe(text);
  expect(text.endsWith("}\n")).toBe(true);
  expect(text.endsWith("\n\n")).toBe(false);
});

// Arbitrary, often malformed, notebook-shaped JSON: the reader must never
// throw, and whatever it accepts must write back as a valid notebook.
const looseCell = fc.record(
  {
    id: fc.oneof(cellId, fc.constant("dup"), hazardText(8), jsonValue),
    cell_type: fc.oneof(fc.constantFrom("code", "markdown", "raw", "heading", ""), jsonValue),
    source: fc.oneof(hazardText(), fc.array(fc.oneof(hazardText(20), jsonValue), { maxLength: 4 }), jsonValue),
    metadata: fc.oneof(metadata, jsonValue),
    attachments: fc.oneof(metadata, jsonValue),
    outputs: jsonValue,
    execution_count: jsonValue,
  },
  { requiredKeys: [] },
);
const looseNotebook = fc.record(
  {
    cells: fc.oneof(fc.array(fc.oneof(looseCell, jsonValue), { maxLength: 6 }), jsonValue),
    metadata: fc.oneof(metadata, jsonValue),
    nbformat: fc.oneof(fc.constant(4), jsonValue),
    nbformat_minor: jsonValue,
  },
  { requiredKeys: [] },
);

test.prop([looseNotebook], { numRuns: 500 })("the reader never throws and only accepts what it can write validly", (raw) => {
  const result = fromIpynbJson(raw);
  if (!result.ok) return;
  const nb = JSON.parse(serializeIpynb(result.value));
  expect(validate(nb) ? [] : validate.errors).toEqual([]);
  expect(new Set(result.value.cells.map((c) => c.id)).size).toBe(result.value.cells.length);
});

const withPyNote = fc.tuple(notebookDocument, jsonValue, fc.array(fc.option(jsonValue, { nil: undefined }), { maxLength: 8 }))
  .map(([doc, settings, cellSettings]) => ({
    ...doc,
    metadata: { ...doc.metadata, PyNote: settings },
    cells: doc.cells.map((c, i) => (cellSettings[i] === undefined ? c : { ...c, metadata: { ...c.metadata, pynote: cellSettings[i]! } })),
  }));

test.prop([withPyNote], { numRuns: 300 })("the clean copy removes exactly PyNote's keys and leaves its input alone", (doc) => {
  const before = structuredClone(doc);
  const clean = stripPyNoteMetadata(doc);
  expect(doc).toEqual(before);
  const without = (o: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));
  expect(clean.metadata).toEqual(without(doc.metadata, "PyNote"));
  expect(clean.cells).toEqual(doc.cells.map((c) => ({ ...c, metadata: without(c.metadata, "pynote") })));
  const nb = JSON.parse(serializeIpynb(clean));
  expect(validate(nb) ? [] : validate.errors).toEqual([]);
});
