import { describe, expect, test } from "vitest";
import { type NotebookDocument, PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO } from "../formats/document";
import { parseIpynb } from "../formats/ipynb";
import { mergePair } from "../formats/pair";
import { parsePynote } from "../formats/pynote";
import { buildTextExport } from "./text-exports";
import { cellForLine, failingLine } from "./script-check";

const doc: NotebookDocument = {
  metadata: {
    kernelspec: PYNOTE_KERNELSPEC,
    language_info: PYNOTE_LANGUAGE_INFO,
    PyNote: { executionMode: "reactive", history: [] },
  },
  cells: [
    { id: "intro", type: "markdown", source: "# Title\n\nSome prose.", metadata: {} },
    { id: "use", type: "code", source: "print(total)", metadata: {} },
    { id: "define", type: "code", source: "total = 1 + 2", metadata: { pynote: { codeview: { showCode: false } } } },
  ],
};

const options = { ipynbClean: false, pythonMarkdown: true, markdownCode: true };
const deps = new Map([
  ["use", { definitions: [], references: ["total", "print"] }],
  ["define", { definitions: ["total"], references: [] }],
]);

describe("buildTextExport", () => {
  test("PyNote and Jupyter exports read back to the same document", () => {
    const pynote = buildTextExport(doc, "pynote", "nb", options).files;
    expect(pynote.map((f) => f.name)).toEqual(["nb.pynote"]);
    const fromPynote = parsePynote(pynote[0].text);
    expect(fromPynote.ok && fromPynote.value.cells.map((c) => c.id)).toEqual(["intro", "use", "define"]);

    const ipynb = buildTextExport(doc, "ipynb", "nb", options).files;
    expect(ipynb.map((f) => f.name)).toEqual(["nb.ipynb"]);
    const fromIpynb = parseIpynb(ipynb[0].text);
    expect(fromIpynb.ok && fromIpynb.value.metadata.PyNote).toBeTruthy();
  });

  test("a clean Jupyter copy has no PyNote settings", () => {
    const [file] = buildTextExport(doc, "ipynb", "nb", { ...options, ipynbClean: true }).files;
    const json = JSON.parse(file.text);
    expect(json.metadata.PyNote).toBeUndefined();
    expect(json.cells[2].metadata).toEqual({});
    expect(json.metadata.kernelspec).toEqual(PYNOTE_KERNELSPEC);
  });

  test("the Python script defines names before using them and knows where each cell starts", () => {
    const out = buildTextExport(doc, "python", "nb", options, deps);
    expect(out.files.map((f) => f.name)).toEqual(["nb.py"]);
    const script = out.script!;
    expect(script.result.codeOrder).toEqual(["define", "use"]);
    const lines = script.text.split("\n");
    expect(script.cellStarts.map((s) => s.id)).toEqual(["define", "use"]);
    for (const start of script.cellStarts) expect(lines[start.line - 1]).toMatch(/^# ?%%/);
    expect(lines.findIndex((l) => l.includes("total = 1 + 2")) + 1).toBeGreaterThan(script.cellStarts[0].line);
    expect(lines.findIndex((l) => l.includes("print(total)")) + 1).toBeGreaterThan(script.cellStarts[1].line);
  });

  test("markdown can be left out of the Python script", () => {
    const withProse = buildTextExport(doc, "python", "nb", options).files[0].text;
    const without = buildTextExport(doc, "python", "nb", { ...options, pythonMarkdown: false }).files[0].text;
    expect(withProse).toContain("Some prose.");
    expect(without).not.toContain("Some prose.");
  });

  test("code can be left out of the Markdown export", () => {
    expect(buildTextExport(doc, "markdown", "nb", options).files[0].text).toContain("total = 1 + 2");
    expect(buildTextExport(doc, "markdown", "nb", { ...options, markdownCode: false }).files[0].text).not.toContain("total = 1 + 2");
  });

  test("the pair is two files that merge back into the notebook's cells", () => {
    const out = buildTextExport(doc, "pair", "nb", options, deps);
    expect(out.files.map((f) => f.name)).toEqual(["nb.py", "nb.md"]);
    const merged = mergePair(out.files[0].text, out.files[1].text);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.value.cells.map((c) => [c.id, c.type, c.source])).toEqual(doc.cells.map((c) => [c.id, c.type, c.source]));
    expect(out.script?.cellStarts.map((s) => s.id)).toEqual(["define", "use"]);
  });
});

describe("where each code cell starts in the script", () => {
  // Code is written as it is, so a line of code can look exactly like a cell
  // marker (code pasted from a VS Code or Spyder script).
  const pasted: NotebookDocument = {
    metadata: doc.metadata,
    cells: [
      { id: "intro", type: "markdown", source: "# Title\n\n# %% in prose", metadata: {} },
      { id: "a", type: "code", source: "x = 1\n# %%\ny = 2\n# %% [markdown]\n#%%", metadata: {} },
      { id: "raw", type: "raw", source: "%% raw", metadata: {} },
      { id: "b", type: "code", source: "z = undefined_name", metadata: {} },
      { id: "empty", type: "code", source: "", metadata: {} },
      { id: "c", type: "code", source: "print(x, y)\r\nprint(z)", metadata: {} },
    ],
  };

  // Each start is the cell's marker line, followed by exactly the cell's code.
  const expectStartsAtTheirCode = (out: ReturnType<typeof buildTextExport>, source: NotebookDocument) => {
    const script = out.script!;
    const lines = script.text.split("\n");
    expect(script.cellStarts.map((s) => s.id)).toEqual(script.result.codeOrder);
    for (const start of script.cellStarts) {
      const code = source.cells.find((cell) => cell.id === start.id)!.source.replace(/\r\n?/g, "\n");
      expect(lines[start.line - 1]).toMatch(/^# %%( id="[^"]+")?$/);
      if (code !== "") expect(lines.slice(start.line, start.line + code.split("\n").length).join("\n")).toBe(code);
    }
  };

  test.each([
    ["python with markdown", "python", { ...options, pythonMarkdown: true }],
    ["python without markdown", "python", { ...options, pythonMarkdown: false }],
    ["the pair's .py", "pair", options],
  ] as const)("in %s, a line of code that looks like a marker starts no cell", (_, format, opts) => {
    expectStartsAtTheirCode(buildTextExport(pasted, format, "nb", opts), pasted);
    expectStartsAtTheirCode(buildTextExport(pasted, format, "nb", opts, new Map([["c", { definitions: [], references: ["x", "y", "z"] }], ["a", { definitions: ["x", "y"], references: [] }], ["b", { definitions: ["z"], references: ["undefined_name"] }]])), pasted);
  });

  test("an error is reported in the cell that raised it", () => {
    const script = buildTextExport(pasted, "python", "nb", options).script!;
    // Where CPython reports the NameError: the line that reads undefined_name.
    const line = script.text.split("\n").findIndex((l) => l.includes("undefined_name")) + 1;
    const traceback = `Traceback (most recent call last):\n  File "notebook.py", line ${line}, in <module>\nNameError: name 'undefined_name' is not defined`;
    expect(cellForLine(failingLine(traceback)!, script.cellStarts)).toBe("b");
  });
});
