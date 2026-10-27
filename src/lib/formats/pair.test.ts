import { describe, expect, it } from "vitest";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO, type DocCell, type NotebookDocument } from "./document";
import { exportPair, mergePair } from "./pair";
import type { DependencyInfo } from "./python";

const ok = <T>(r: { ok: true; value: T; warnings: string[] } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

const code = (id: string, source: string): DocCell => ({ id, type: "code", source, metadata: {} });
const md = (id: string, source: string): DocCell => ({ id, type: "markdown", source, metadata: {} });
const raw = (id: string, source: string): DocCell => ({ id, type: "raw", source, metadata: {} });
const doc = (...cells: DocCell[]): NotebookDocument => ({ cells, metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO } });
const shape = (cells: DocCell[]) => cells.map((c) => [c.id, c.type, c.source]);

// A reactive notebook stored out of order: the .py runs top to bottom, the
// .md keeps the notebook's order.
const notebook = doc(
  md("title", "# Report"),
  code("show", "print(total)"),
  md("note", "The total comes from the values:"),
  code("total", "total = sum(values)"),
  raw("tex", "\\sum_i v_i"),
  code("values", "values = [1, 2, 3]"),
);
const dependencies = new Map<string, DependencyInfo>([
  ["show", { definitions: [], references: ["total", "print"] }],
  ["total", { definitions: ["total"], references: ["values", "sum"] }],
  ["values", { definitions: ["values"], references: [] }],
]);

describe("exportPair", () => {
  const pair = exportPair(notebook, { baseName: "report", dependencies });

  it("writes the code half as a runnable script with cell ids, in dependency order", () => {
    expect(pair.py).toBe([
      "# ---",
      "# pynote:",
      "#   executionMode: reactive",
      "# # This is the code half of a notebook whose prose is in report.md.",
      "# ---",
      "",
      '# %% id="values"',
      "values = [1, 2, 3]",
      "",
      '# %% id="total"',
      "total = sum(values)",
      "",
      '# %% id="show"',
      "print(total)",
      "",
    ].join("\n"));
    expect(pair.python.codeOrder).toEqual(["values", "total", "show"]);
  });

  it("writes the prose half in notebook order, with an anchor for each code cell", () => {
    expect(pair.md).toBe([
      "<!-- PyNote: this is the prose half of a notebook whose code is in report.py. -->",
      "",
      "<!-- cell title -->",
      "# Report",
      "",
      "<!-- code show -->",
      "",
      "<!-- cell note -->",
      "The total comes from the values:",
      "",
      "<!-- code total -->",
      "",
      "<!-- raw tex -->",
      "```text",
      "\\sum_i v_i",
      "```",
      "",
      "<!-- code values -->",
      "",
    ].join("\n"));
  });

  it("merges back into the notebook, in its order, with the execution mode", () => {
    const { value, warnings } = ok(mergePair(pair.py, pair.md));
    expect(warnings).toEqual([]);
    expect(shape(value.cells)).toEqual(shape(notebook.cells));
    expect(value.metadata).toEqual({ kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { executionMode: "reactive" } });
  });
});

describe("mergePair: edits on either side", () => {
  const { py, md: prose } = exportPair(notebook, { baseName: "report", dependencies });

  it("takes code edits from the .py", () => {
    const edited = py.replace("total = sum(values)", "total = sum(values) * 2\n# doubled");
    const cells = ok(mergePair(edited, prose)).value.cells;
    expect(shape(cells)).toEqual(shape(notebook.cells).map((c) => (c[0] === "total" ? ["total", "code", "total = sum(values) * 2\n# doubled"] : c)));
  });

  it("takes prose edits from the .md", () => {
    const cells = ok(mergePair(py, prose.replace("# Report", "# Annual report\n\nWith a new paragraph."))).value.cells;
    expect(cells[0]).toEqual(md("title", "# Annual report\n\nWith a new paragraph."));
  });

  it("inserts a cell written in the .py right after the .py cell before it", () => {
    const edited = py.replace('# %% id="total"', "# %%\nextra = values[0]\n\n# %% id=\"total\"");
    const { value, warnings } = ok(mergePair(edited, prose));
    const ids = value.cells.map((c) => c.id);
    const extra = value.cells.find((c) => c.source === "extra = values[0]")!;
    // After "values", its predecessor in the .py, which ends the notebook.
    expect(ids.indexOf(extra.id)).toBe(ids.indexOf("values") + 1);
    expect(warnings).toEqual([`The code cell ${extra.id} is only in the .py file; inserted it after cell values.`]);
  });

  it("inserts a cell written at the top of the .py before the first code cell", () => {
    const edited = py.replace('# ---\n\n# %% id="values"', '# ---\n\nimport math\n\n# %% id="values"');
    const cells = ok(mergePair(edited, prose)).value.cells;
    expect(cells.map((c) => c.source).slice(0, 3)).toEqual(["# Report", "import math", "print(total)"]);
  });

  it("re-inserts a cell whose anchor was deleted from the .md after its .py predecessor", () => {
    const { value, warnings } = ok(mergePair(py, prose.replace("<!-- code total -->\n\n", "")));
    expect(value.cells.map((c) => c.id)).toEqual(["title", "show", "note", "tex", "values", "total"]);
    expect(warnings).toEqual(["The code cell total is only in the .py file; inserted it after cell values."]);
  });

  it("drops the anchor of a cell deleted from the .py", () => {
    const edited = py.replace('# %% id="total"\ntotal = sum(values)\n\n', "");
    const { value, warnings } = ok(mergePair(edited, prose));
    expect(value.cells.map((c) => c.id)).toEqual(["title", "show", "note", "tex", "values"]);
    expect(warnings).toEqual(["Line 11 of the Markdown file: dropped the anchor of code cell total, which the .py file no longer has."]);
  });

  it("uses a code cell once when its anchor was duplicated", () => {
    const { value, warnings } = ok(mergePair(py, prose.replace("<!-- code show -->", "<!-- code show -->\n\n<!-- code show -->")));
    expect(value.cells.filter((c) => c.id === "show")).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it("gives a new id to a cell whose id is used in both files", () => {
    const { value, warnings } = ok(mergePair('# %% id="same"\nx = 1\n', "<!-- cell same -->\nProse\n\n<!-- code same -->\n"));
    expect(value.cells.map((c) => c.type)).toEqual(["markdown", "code"]);
    expect(value.cells[0].id).toBe("same");
    expect(value.cells[1].id).not.toBe("same");
    expect(warnings).toHaveLength(1);
  });

  it("keeps markdown cells written in the .py, placed like new code cells", () => {
    const edited = py.replace('# %% id="show"', "# %% [markdown]\n# Written in the script.\n\n# %% id=\"show\"");
    const cells = ok(mergePair(edited, prose)).value.cells;
    const at = cells.findIndex((c) => c.source === "Written in the script.");
    expect(cells[at - 1].id).toBe("total");
  });

  it("adds the code after the text when the .md has no anchors", () => {
    const { value, warnings } = ok(mergePair(py, "# Notes\n\nNo anchors here.\n"));
    expect(value.cells.map((c) => c.source)).toEqual(["# Notes\n\nNo anchors here.", "values = [1, 2, 3]", "total = sum(values)", "print(total)"]);
    expect(warnings[0]).toBe("The Markdown file has no cell anchors; the code cells were added after its text.");
  });

  it("reads the execution mode from the .py header", () => {
    const edited = py.replace("executionMode: reactive", "executionMode: hybrid");
    expect(ok(mergePair(edited, prose)).value.metadata.PyNote).toEqual({ executionMode: "hybrid" });
  });

  it.each([
    ["two empty files", "", ""],
    ["noise", "\u0000# %% id=\"x\"\n", "<!-- code x -->\n<!-- code y -->\n<!-- raw z -->\n```"],
  ])("never throws: %s", (_name, a, b) => {
    expect(mergePair(a, b).ok).toBe(true);
  });
});
