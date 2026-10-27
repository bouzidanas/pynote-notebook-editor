import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePynote, serializePynote } from "./pynote";
import { parseIpynb, serializeIpynb } from "./ipynb";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO, type NotebookDocument } from "./document";

const root = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const ok = <T>(r: { ok: true; value: T; warnings: string[] } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

const DEFAULT_META = { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO };

// The example from docs/formats/pynote.md, verbatim.
const SPEC_EXAMPLE = `---
pynote: 1
executionMode: reactive
theme:
  colors:
    primary: "#f38ba8"
---

<!-- cell 1f3a9c2e -->
# Sales analysis

Load the data first.

\`\`\`python {#7b2e10d4}
import pandas as pd
df = pd.read_csv("sales.csv")
\`\`\`

\`\`\`python {#c90a5b13 autorun=false}
df.describe()
\`\`\`

<!-- cell 4d0e8a71 -->
A second markdown cell.
`;

describe("the documented example", () => {
  it("parses to the notebook it describes", () => {
    const { value: doc, warnings } = ok(parsePynote(SPEC_EXAMPLE));
    expect(warnings).toEqual([]);
    expect(doc).toEqual({
      metadata: { ...DEFAULT_META, PyNote: { executionMode: "reactive", theme: { colors: { primary: "#f38ba8" } } } },
      cells: [
        { id: "1f3a9c2e", type: "markdown", source: "# Sales analysis\n\nLoad the data first.", metadata: {} },
        { id: "7b2e10d4", type: "code", source: 'import pandas as pd\ndf = pd.read_csv("sales.csv")', metadata: {} },
        { id: "c90a5b13", type: "code", source: "df.describe()", metadata: { pynote: { autorun: false } } },
        { id: "4d0e8a71", type: "markdown", source: "A second markdown cell.", metadata: {} },
      ],
    });
  });

  it("is exactly what the writer produces for that notebook", () => {
    expect(serializePynote(ok(parsePynote(SPEC_EXAMPLE)).value)).toBe(SPEC_EXAMPLE);
  });
});

describe("conversion with .ipynb", () => {
  const kitchenSink = () => ok(parseIpynb(read("test/fixtures/notebooks/jupyter-kitchen-sink.ipynb"))).value;

  it("writes the kitchen-sink notebook as the reviewed golden file", async () => {
    // Regenerate with `npx vitest run -u` only for an intended format change, and review the diff.
    await expect(serializePynote(kitchenSink())).toMatchFileSnapshot(resolve(root, "test/golden/pynote/jupyter-kitchen-sink.pynote"));
  });

  it(".ipynb -> .pynote -> .ipynb is byte-identical", () => {
    const ipynb = serializeIpynb(kitchenSink());
    const viaPynote = serializeIpynb(ok(parsePynote(serializePynote(ok(parseIpynb(ipynb)).value))).value);
    expect(viaPynote).toBe(ipynb);
  });

  it("keeps other tools' metadata, attachments, raw cells and history", () => {
    const doc = ok(parsePynote(serializePynote(kitchenSink()))).value;
    expect(doc).toEqual(kitchenSink());
  });
});

describe("cell sources survive exactly", () => {
  const roundTrip = (cells: NotebookDocument["cells"]) => {
    const doc: NotebookDocument = { cells, metadata: { ...DEFAULT_META } };
    const text = serializePynote(doc);
    return { text, doc: ok(parsePynote(text)).value };
  };

  it("leading and trailing blank lines in markdown and code", () => {
    const cells: NotebookDocument["cells"] = [
      { id: "a", type: "markdown" as const, source: "\n\nbody\n\n", metadata: {} },
      { id: "b", type: "code" as const, source: "\nx = 1\n", metadata: {} },
      { id: "c", type: "markdown" as const, source: "", metadata: {} },
      { id: "d", type: "code" as const, source: "", metadata: {} },
      { id: "e", type: "markdown" as const, source: "last\n", metadata: {} },
    ];
    expect(roundTrip(cells).doc.cells).toEqual(cells);
  });

  it("backtick runs get a longer fence", () => {
    const source = 'doc = """\n````\n```python\n````\n"""';
    const { text, doc } = roundTrip([{ id: "a", type: "code", source, metadata: {} }]);
    expect(text).toContain("`````python {#a}");
    expect(doc.cells[0].source).toBe(source);
  });

  it("markdown that contains marker-like lines is written fenced", () => {
    const source = "Docs about the format:\n\n<!-- cell abc -->\n```python {#x}\nprint(1)\n```\n<!-- pynote";
    const { text, doc } = roundTrip([{ id: "m", type: "markdown", source, metadata: {} }]);
    expect(text).toContain("```markdown {#m}");
    expect(doc.cells).toEqual([{ id: "m", type: "markdown", source, metadata: {} }]);
  });

  it("carriage returns and NUL bytes are escaped, never written raw", () => {
    const cells: NotebookDocument["cells"] = [
      { id: "a", type: "markdown" as const, source: "windows\r\nline", metadata: {} },
      { id: "b", type: "code" as const, source: "x = '\0'\r", metadata: { pynote: { autorun: true } } },
    ];
    const { text, doc } = roundTrip(cells);
    expect(text).not.toMatch(/[\r\0]/);
    expect(doc.cells).toEqual(cells);
  });
});

describe("metadata placement", () => {
  it("PyNote cell settings become attributes, other keys go in meta", () => {
    const doc: NotebookDocument = {
      metadata: { ...DEFAULT_META },
      cells: [{
        id: "c1", type: "code", source: "x",
        metadata: { tags: ["parameters"], pynote: { codeview: { showCode: false }, placeholder: "Setup <b> --> & more" } },
      }],
    };
    const text = serializePynote(doc);
    expect(text).toContain('```python {#c1 placeholder="Setup \\u003cb\\u003e --\\u003e \\u0026 more" codeview={"showCode":false} meta={"tags":["parameters"]}}');
    expect(ok(parsePynote(text)).value).toEqual(doc);
  });

  it("history goes to the trailer and other tools' notebook metadata under metadata", () => {
    const doc: NotebookDocument = {
      metadata: {
        kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
        language_info: PYNOTE_LANGUAGE_INFO,
        colab: { provenance: [] },
        PyNote: { executionMode: "hybrid", history: ["a|0|code|c1", "u|m1|-->|<x>"], futureSetting: true },
      },
      cells: [{ id: "c1", type: "code", source: "1", metadata: {} }],
    };
    const text = serializePynote(doc);
    const [front] = text.split("\n---\n");
    expect(front).not.toContain("history");
    expect(front).toContain("futureSetting: true");
    expect(front).toContain("colab:");
    expect(text).toMatch(/<!-- pynote\n\{\n "history": \[\n  "a\|0\|code\|c1",\n  "u\|m1\|--\\u003e\|\\u003cx\\u003e"\n \]\n\}\n-->\n$/);
    expect(ok(parsePynote(text)).value).toEqual(doc);
  });

  it("an empty undo history is not stored (the documented normalization)", () => {
    const doc: NotebookDocument = { metadata: { ...DEFAULT_META, PyNote: { executionMode: "hybrid", history: [] } }, cells: [] };
    const text = serializePynote(doc);
    expect(text).toBe("---\npynote: 1\nexecutionMode: hybrid\n---\n");
    expect(ok(parsePynote(text)).value.metadata.PyNote).toEqual({ executionMode: "hybrid" });
  });
});

describe("front matter strings survive exactly", () => {
  // Both found by the property tests.
  it("whitespace-only and newline-only strings", () => {
    const doc: NotebookDocument = { cells: [], metadata: { ...DEFAULT_META, x: { "": ["\n\n", " \n", "\t\n", "  lead"] } } };
    expect(ok(parsePynote(serializePynote(doc))).value).toEqual(doc);
  });

  it("a hand-written keep block scalar keeps its trailing newlines", () => {
    const text = "---\npynote: 1\ncodeHiddenPlaceholder: |+\n  hidden\n\n---\n";
    expect(ok(parsePynote(text)).value.metadata.PyNote).toEqual({ codeHiddenPlaceholder: "hidden\n\n" });
  });
});

describe("hand-edited files", () => {
  it("accepts {.cell} and markerless text, CRLF line endings and a BOM", () => {
    const text = "\ufeff---\r\npynote: 1\r\n---\r\n\r\nIntro without a marker.\r\n\r\n```python {.cell}\r\nprint(1)\r\n```\r\n";
    const { value: doc, warnings } = ok(parsePynote(text));
    expect(doc.cells.map((c) => [c.type, c.source])).toEqual([["markdown", "Intro without a marker."], ["code", "print(1)"]]);
    for (const c of doc.cells) expect(c.id).toMatch(/^[0-9a-f]{8}$/);
    expect(warnings).toHaveLength(1);
  });

  it("keeps text when the blank separator line was deleted", () => {
    const text = "---\npynote: 1\n---\n\n<!-- cell a -->\nKeep me\n<!-- cell b -->\nAnd me\n";
    expect(ok(parsePynote(text)).value.cells.map((c) => c.source)).toEqual(["Keep me", "And me"]);
  });

  it("gives duplicated ids (copied cells) new ids after the first", () => {
    const text = "---\npynote: 1\n---\n\n```python {#same}\na\n```\n\n```python {#same}\nb\n```\n";
    const { value: doc, warnings } = ok(parsePynote(text));
    expect(new Set(doc.cells.map((c) => c.id)).size).toBe(2);
    expect(warnings.some((w) => w.includes("more than once"))).toBe(true);
  });

  it("reads bare-word attribute values as strings", () => {
    const text = "---\npynote: 1\n---\n\n```python {#c placeholder=Setup autorun=true}\nx\n```\n";
    expect(ok(parsePynote(text)).value.cells[0].metadata).toEqual({ pynote: { placeholder: "Setup", autorun: true } });
  });
});

describe("malformed files are rejected, never thrown", () => {
  it.each([
    ["no front matter", "# hello\n", "front matter"],
    ["unclosed front matter", "---\npynote: 1\n", "not closed"],
    ["invalid YAML", "---\npynote: [1\n---\n", "not valid YAML"],
    ["no version", "---\ntitle: x\n---\n", "format version"],
    ["newer version", "---\npynote: 99\n---\n", "Update PyNote"],
    ["unclosed fence", "---\npynote: 1\n---\n\n```python {#a}\nx = 1\n", "never closed"],
  ])("%s", (_name, text, message) => {
    const result = parsePynote(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});
