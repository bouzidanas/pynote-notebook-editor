import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv-draft-04";
import { parseIpynb, serializeIpynb, stripPyNoteMetadata, toIpynbJson } from "./ipynb";
import { splitLinesKeepEnds, stableStringify } from "./json-stable";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO, type NotebookDocument } from "./document";

const root = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const schema = JSON.parse(read("test/vendor/nbformat/nbformat.v4.5.schema.json"));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
const schemaErrors = (nb: unknown) => (validate(nb) ? [] : validate.errors!.map((e) => `${e.instancePath} ${e.message}`));

const parseOk = (text: string) => {
  const result = parseIpynb(text);
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe("ipynb writer matches Jupyter's nbformat writer byte for byte", () => {
  // test/golden/ipynb/* is written by nbformat itself (test/oracle/write_golden.py).
  it("kitchen-sink fixture", () => {
    const input = read("test/fixtures/notebooks/jupyter-kitchen-sink.ipynb");
    const expected = read("test/golden/ipynb/jupyter-kitchen-sink.ipynb");
    expect(serializeIpynb(parseOk(input).value)).toBe(expected);
  });
});

describe("parseIpynb", () => {
  it("keeps ids, other tools' metadata, raw cells and attachments", () => {
    const { value: doc, warnings } = parseOk(read("test/fixtures/notebooks/jupyter-kitchen-sink.ipynb"));
    expect(warnings).toEqual([]);
    expect(doc.cells.map((c) => [c.id, c.type])).toEqual([
      ["intro", "markdown"],
      ["setup-1", "code"],
      ["raw_cell", "raw"],
      ["empty", "code"],
      ["tabs-and-quotes", "markdown"],
    ]);
    expect(doc.cells[0].metadata).toEqual({ tags: ["header"], jupyter: { source_hidden: false } });
    expect(doc.cells[0].attachments).toHaveProperty(["plot.png", "image/png"]);
    expect(doc.cells[1].metadata.pynote).toEqual({ autorun: false, placeholder: "Setup code", futureKey: { x: 1 } });
    expect(doc.cells[2].source).toBe("\\begin{equation} e^{i\\pi} + 1 = 0 \\end{equation}");
    expect(doc.metadata.colab).toEqual({ provenance: [], toc_visible: true });
    expect(doc.metadata.PyNote).toEqual({ executionMode: "reactive", history: ["a|1|code|setup-1"], laterVersionSetting: true });
  });

  it("joins source lists exactly", () => {
    const { value } = parseOk(read("test/fixtures/notebooks/jupyter-kitchen-sink.ipynb"));
    expect(value.cells[0].source).toBe(
      "# Kitchen sink \u2728\n\nCRLF line\r\nline separator\u2028after separator\n![plot](attachment:plot.png)",
    );
    expect(value.cells[3].source).toBe("");
  });

  it("reads notebooks saved by earlier PyNote versions (no ids, markdown outputs)", () => {
    const legacy = {
      cells: [
        { cell_type: "markdown", source: ["# Title"], outputs: [], metadata: {} },
        { cell_type: "code", source: ["print(1)"], outputs: [], metadata: { pynote: { autorun: true } } },
      ],
      metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: { name: "python", version: "3.11.3" }, PyNote: { history: [], executionMode: "hybrid" } },
      nbformat: 4,
      nbformat_minor: 5,
    };
    const { value: doc, warnings } = parseOk(JSON.stringify(legacy));
    expect(warnings).toEqual([]);
    expect(doc.cells).toHaveLength(2);
    for (const cell of doc.cells) expect(cell.id).toMatch(/^[0-9a-f]{8}$/);
    expect(new Set(doc.cells.map((c) => c.id)).size).toBe(2);
    expect(schemaErrors(JSON.parse(serializeIpynb(doc)))).toEqual([]);
  });

  it("replaces invalid and duplicate ids without touching valid unique ones", () => {
    const nb = {
      cells: [
        { cell_type: "code", id: "dup", source: "a", metadata: {}, outputs: [], execution_count: null },
        { cell_type: "code", id: "dup", source: "b", metadata: {}, outputs: [], execution_count: null },
        { cell_type: "code", id: "has space", source: "c", metadata: {}, outputs: [], execution_count: null },
        { cell_type: "code", id: "keep_me", source: "d", metadata: {}, outputs: [], execution_count: null },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    };
    const { value: doc, warnings } = parseOk(JSON.stringify(nb));
    const ids = doc.cells.map((c) => c.id);
    expect(ids[3]).toBe("keep_me");
    expect(ids.slice(0, 3)).not.toContain("dup");
    expect(ids.slice(0, 3)).not.toContain("has space");
    expect(new Set(ids).size).toBe(4);
    expect(warnings).toHaveLength(3);
  });

  it("keeps unknown cell types as raw cells and fills missing kernel metadata", () => {
    const nb = { cells: [{ cell_type: "heading", source: "Old heading", metadata: {} }], metadata: {}, nbformat: 4, nbformat_minor: 4 };
    const { value: doc, warnings } = parseOk(JSON.stringify(nb));
    expect(doc.cells[0]).toMatchObject({ type: "raw", source: "Old heading" });
    expect(warnings.some((w) => w.includes("unknown type"))).toBe(true);
    expect(doc.metadata.kernelspec).toEqual(PYNOTE_KERNELSPEC);
    expect(doc.metadata.language_info).toEqual(PYNOTE_LANGUAGE_INFO);
  });

  it("drops malformed attachment entries so the written file stays schema-valid", () => {
    // Found by the property tests: {"": null} is not a MIME bundle.
    const nb = {
      cells: [{ cell_type: "markdown", id: "m", source: "x", metadata: {}, attachments: { "": null, "ok.png": { "image/png": "AAAA" }, "bad.png": { "image/png": 5 }, "data.json": { "application/vnd.x+json": { a: 1 } } } }],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    };
    const { value: doc, warnings } = parseOk(JSON.stringify(nb));
    expect(doc.cells[0].attachments).toEqual({ "ok.png": { "image/png": "AAAA" }, "data.json": { "application/vnd.x+json": { a: 1 } } });
    expect(warnings).toEqual(['Cell 1: dropped malformed attachment(s) "", "bad.png".']);
    expect(schemaErrors(JSON.parse(serializeIpynb(doc)))).toEqual([]);
  });

  it("rejects what is not an nbformat 4 notebook, without throwing", () => {
    expect(parseIpynb("{not json")).toMatchObject({ ok: false });
    expect(parseIpynb("[]")).toMatchObject({ ok: false });
    expect(parseIpynb("{}")).toMatchObject({ ok: false, error: expect.stringContaining("no cells") });
    expect(parseIpynb(JSON.stringify({ worksheets: [], metadata: {} }))).toMatchObject({ ok: false, error: expect.stringContaining("nbformat 3") });
    expect(parseIpynb(JSON.stringify({ cells: [], nbformat: 5 }))).toMatchObject({ ok: false });
  });
});

describe("serializeIpynb", () => {
  const doc: NotebookDocument = {
    cells: [
      { id: "m1", type: "markdown", source: "# A\n", metadata: {} },
      { id: "c1", type: "code", source: "x = 1", metadata: { pynote: { codeview: { showCode: false } } } },
      { id: "r1", type: "raw", source: "", metadata: {}, attachments: {} },
    ],
    metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO },
  };

  it("writes a schema-valid nbformat 4.5 notebook", () => {
    expect(schemaErrors(JSON.parse(serializeIpynb(doc)))).toEqual([]);
  });

  it("only gives code cells outputs and execution counts", () => {
    const json = toIpynbJson(doc) as any;
    expect(json.cells[0]).not.toHaveProperty("outputs");
    expect(json.cells[1]).toMatchObject({ outputs: [], execution_count: null });
    expect(json.cells[2]).not.toHaveProperty("execution_count");
  });

  it("round-trips the document exactly", () => {
    expect(parseOk(serializeIpynb(doc)).value).toEqual(doc);
  });

  it("is deterministic and ends with a newline", () => {
    const a = serializeIpynb(doc);
    expect(serializeIpynb(structuredClone(doc))).toBe(a);
    expect(a.endsWith("}\n")).toBe(true);
  });
});

describe("json-stable helpers", () => {
  it("splits lines like Python's str.splitlines(keepends=True)", () => {
    // Expected values computed with CPython 3.13.
    expect(splitLinesKeepEnds("")).toEqual([]);
    expect(splitLinesKeepEnds("a")).toEqual(["a"]);
    expect(splitLinesKeepEnds("a\n")).toEqual(["a\n"]);
    expect(splitLinesKeepEnds("a\r\nb\rc\nd")).toEqual(["a\r\n", "b\r", "c\n", "d"]);
    expect(splitLinesKeepEnds("a\u2028b\u0085c\fd\ve\x1cf")).toEqual(["a\u2028", "b\u0085", "c\f", "d\v", "e\x1c", "f"]);
    expect(splitLinesKeepEnds("\n\n")).toEqual(["\n", "\n"]);
  });

  it("sorts keys by code point and formats like json.dumps(indent=1)", () => {
    expect(stableStringify({ b: 1, "10": [], "2": {}, a: [1, "x"] })).toBe(
      '{\n "10": [],\n "2": {},\n "a": [\n  1,\n  "x"\n ],\n "b": 1\n}',
    );
    // U+FFFD sorts before U+1F600 by code point (UTF-16 order would differ).
    expect(Object.keys(JSON.parse(stableStringify({ "\u{1F600}": 1, "\uFFFD": 2 })))).toEqual(["\uFFFD", "\u{1F600}"]);
  });
});

describe("stripPyNoteMetadata (the Jupyter clean copy)", () => {
  const kitchenSink = () => parseOk(read("test/fixtures/notebooks/jupyter-kitchen-sink.ipynb")).value;

  it("removes metadata.PyNote and every cell's metadata.pynote, keeping all other keys", () => {
    const clean = stripPyNoteMetadata(kitchenSink());
    expect(clean.metadata).not.toHaveProperty("PyNote");
    expect(clean.metadata.colab).toEqual({ provenance: [], toc_visible: true });
    expect(clean.cells[1].metadata).toEqual({ "10": "integer-like key", "2": "sorts after 10 as a string", collapsed: false });
    expect(clean.cells[0].metadata).toEqual({ tags: ["header"], jupyter: { source_hidden: false } });
    expect(clean.cells[0].attachments).toEqual(kitchenSink().cells[0].attachments);
    expect(clean.cells.map((c) => [c.id, c.type, c.source])).toEqual(kitchenSink().cells.map((c) => [c.id, c.type, c.source]));
  });

  it("keeps an empty metadata object for a cell that only had PyNote settings", () => {
    const doc: NotebookDocument = {
      cells: [{ id: "c", type: "code", source: "x", metadata: { pynote: { autorun: true } } }],
      metadata: { kernelspec: PYNOTE_KERNELSPEC, PyNote: { executionMode: "reactive" } },
    };
    const clean = stripPyNoteMetadata(doc);
    expect(clean).toEqual({ cells: [{ id: "c", type: "code", source: "x", metadata: {} }], metadata: { kernelspec: PYNOTE_KERNELSPEC } });
    expect(schemaErrors(JSON.parse(serializeIpynb(clean)))).toEqual([]);
  });

  it("does not modify its input", () => {
    const doc = kitchenSink();
    const before = structuredClone(doc);
    const clean = stripPyNoteMetadata(doc);
    expect(doc).toEqual(before);
    clean.cells[0].metadata.tags = ["changed"];
    (clean.cells[0].attachments as Record<string, unknown>)["plot.png"] = null;
    expect(doc).toEqual(before);
  });

  it("keeps a metadata key named __proto__ as data", () => {
    const metadata = JSON.parse('{"__proto__": {"x": 1}, "pynote": {}}');
    const clean = stripPyNoteMetadata({ cells: [{ id: "c", type: "code", source: "", metadata }], metadata: {} });
    expect(Object.keys(clean.cells[0].metadata)).toEqual(["__proto__"]);
  });
});
