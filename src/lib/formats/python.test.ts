import { describe, expect, it } from "vitest";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO, type DocCell, type NotebookDocument } from "./document";
import { type DependencyInfo, exportPython, parsePython } from "./python";

const ok = <T>(r: { ok: true; value: T; warnings: string[] } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

const code = (id: string, source: string): DocCell => ({ id, type: "code", source, metadata: {} });
const md = (id: string, source: string): DocCell => ({ id, type: "markdown", source, metadata: {} });
const raw = (id: string, source: string): DocCell => ({ id, type: "raw", source, metadata: {} });
const doc = (...cells: DocCell[]): NotebookDocument => ({ cells, metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO } });
const deps = (entries: Record<string, [string[], string[]]>) =>
  new Map<string, DependencyInfo>(Object.entries(entries).map(([id, [definitions, references]]) => [id, { definitions, references }]));

const HEADER = "# ---\n# pynote:\n#   executionMode: reactive\n# ---\n";

describe("exportPython: layout", () => {
  it("writes the header, then cells separated by one blank line, ending with one newline", () => {
    const { text } = exportPython(doc(md("m", "# Title"), code("c", "x = 1"), raw("r", "raw text")), { includeMarkdown: true });
    expect(text).toBe(`${HEADER}\n# %% [markdown]\n# # Title\n\n# %%\nx = 1\n\n# %% [raw]\n# raw text\n`);
  });

  it("records reactive mode in a jupytext-compatible header, whatever the notebook's mode", () => {
    const notebook = { ...doc(code("c", "x = 1")), metadata: { PyNote: { executionMode: "hybrid" } } };
    expect(exportPython(notebook, { includeMarkdown: true }).text.startsWith(HEADER)).toBe(true);
  });

  it("records the notebook's own mode when its order had to be kept", () => {
    const twice = { ...doc(code("a", "x = 1"), code("b", "x = 2")), metadata: { PyNote: { executionMode: "hybrid" } } };
    const dependencies = new Map([
      ["a", { definitions: ["x"], references: [] }],
      ["b", { definitions: ["x"], references: [] }],
    ]);
    const result = exportPython(twice, { includeMarkdown: true, dependencies });
    expect(result.orderNote).toBe("duplicates");
    expect(result.text.startsWith("# ---\n# pynote:\n#   executionMode: hybrid\n# ---\n")).toBe(true);
    // Without a known mode the header records none (an empty mapping).
    const unknown = exportPython({ ...twice, metadata: {} }, { includeMarkdown: true, dependencies }).text;
    expect(unknown.startsWith("# ---\n# pynote: {}\n# ---\n")).toBe(true);
    expect(parsePython(unknown).ok && (parsePython(unknown) as { value: NotebookDocument }).value.metadata.PyNote).toBeUndefined();
  });

  it("writes only the header for an empty notebook", () => {
    expect(exportPython(doc(), { includeMarkdown: true }).text).toBe(HEADER);
  });

  it("puts the pair note inside the header, as YAML comments", () => {
    const { text } = exportPython(doc(code("abc", "x = 1")), { includeMarkdown: false, cellIds: true, pairedWith: "analysis.md" });
    expect(text).toBe(
      "# ---\n# pynote:\n#   executionMode: reactive\n" +
        "# # This is the code half of a notebook whose prose is in analysis.md.\n" +
        '# ---\n\n# %% id="abc"\nx = 1\n',
    );
  });

  it("keeps a pair file name on one comment line", () => {
    const { text } = exportPython(doc(), { includeMarkdown: false, pairedWith: "a\nb\u2028c.md" });
    expect(text).toContain("prose is in a b c.md.");
  });

  it("omits markdown and raw cells when includeMarkdown is false", () => {
    const { text } = exportPython(doc(md("m", "Hi"), code("c", "x = 1"), raw("r", "r")), { includeMarkdown: false });
    expect(text).toBe(`${HEADER}\n# %%\nx = 1\n`);
  });

  it("writes code exactly: indentation, tabs, trailing spaces, leading blank lines", () => {
    const source = "\n\ndef f():\n\treturn 1   \n\n\nx = f()  ";
    const { text } = exportPython(doc(code("c", source), code("d", "y = 2")), { includeMarkdown: true });
    expect(text).toContain(`# %%\n${source}\n\n# %%\ny = 2\n`);
  });

  it("writes an empty code cell as a bare marker", () => {
    expect(exportPython(doc(code("a", ""), code("b", "")), { includeMarkdown: true }).text).toBe(`${HEADER}\n# %%\n\n# %%\n`);
  });

  it("writes line endings as LF (CRLF and CR in sources included)", () => {
    const { text } = exportPython(doc(code("c", "a = 1\r\nb = 2\rc = 3"), md("m", "x\r\ny"), raw("r", "p\r\nq")), { includeMarkdown: true });
    expect(text).not.toContain("\r");
    expect(text).toContain("a = 1\nb = 2\nc = 3");
    expect(text).toContain("# %% [raw]\n# p\n# q\n");
  });

  it("drops the last cell's trailing line breaks (the file ends with exactly one newline)", () => {
    expect(exportPython(doc(code("c", "x = 1\n\n")), { includeMarkdown: true }).text).toBe(`${HEADER}\n# %%\nx = 1\n`);
  });

  it("keeps raw cells verbatim as comments: no wrapping, empty lines as '#'", () => {
    const long = "y".repeat(120);
    const { text } = exportPython(doc(raw("r", `${long}\n\n  indented`)), { includeMarkdown: true, lineWidth: 40 });
    expect(text).toBe(`${HEADER}\n# %% [raw]\n# ${long}\n#\n#   indented\n`);
  });

  it("wraps markdown to the line width", () => {
    const { text } = exportPython(doc(md("m", "word ".repeat(30).trim())), { includeMarkdown: true, lineWidth: 30 });
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(30);
  });

  it("escapes comment lines that would read as cell markers (and the reader undoes it)", () => {
    const prose = "```mermaid\n%% a mermaid comment\n```";
    const { text } = exportPython(doc(md("m", prose), raw("r", "%% raw\n  %%x\nend")), { includeMarkdown: true });
    expect(text).toContain("#  %% a mermaid comment");
    expect(text).toContain("# %% [raw]\n#  %% raw\n#    %%x\n# end");
    const cells = ok(parsePython(text)).value.cells;
    expect(cells.map((c) => c.source)).toEqual([prose, "%% raw\n  %%x\nend"]);
  });

  it("writes NUL in prose as U+FFFD, so the script stays valid Python", () => {
    const { text } = exportPython(doc(md("m", "a\0b"), raw("r", "c\0d")), { includeMarkdown: true });
    expect(text).not.toContain("\0");
    expect(text).toContain("# a\uFFFDb");
    expect(text).toContain("# c\uFFFDd");
  });

  it("is deterministic", () => {
    const notebook = doc(md("m", "Some *text*"), code("c", "x = 1"), raw("r", "r"));
    expect(exportPython(notebook, { includeMarkdown: true })).toEqual(exportPython(structuredClone(notebook), { includeMarkdown: true }));
  });
});

describe("exportPython: order", () => {
  // summary uses total and values; total uses values. Stored out of order.
  const notebook = doc(
    md("title", "# Title"),
    code("summary", "summary = total / len(values)"),
    md("about", "The data:"),
    code("values", "values = [1, 2]"),
    raw("note", "a raw cell"),
    code("total", "total = sum(values)"),
    md("end", "The end."),
  );
  const dependencies = deps({
    summary: [["summary"], ["total", "values", "len"]],
    values: [["values"], []],
    total: [["total"], ["values", "sum"]],
  });

  it("keeps notebook order without dependency information", () => {
    const result = exportPython(notebook, { includeMarkdown: true });
    expect(result.codeOrder).toEqual(["summary", "values", "total"]);
    expect(result.moved).toEqual([]);
    expect(result.orderNote).toBeUndefined();
    expect(result.duplicateDefinitions).toEqual([]);
  });

  it("orders code so every name is defined before it is used; prose travels with the next code cell", () => {
    const result = exportPython(notebook, { includeMarkdown: true, dependencies });
    expect(result.codeOrder).toEqual(["values", "total", "summary"]);
    expect(result.moved).toEqual(["values", "total", "summary"]);
    expect(result.orderNote).toBeUndefined();
    const sources = ok(parsePython(result.text)).value.cells.map((c) => c.source);
    expect(sources).toEqual(["# Title", "The data:", "values = [1, 2]", "a raw cell", "total = sum(values)", "summary = total / len(values)", "The end."]);
  });

  it("keeps notebook order when it is already valid", () => {
    const inOrder = doc(code("a", "a = 1"), code("b", "b = a"), code("c", "c = a + b"));
    const result = exportPython(inOrder, { includeMarkdown: true, dependencies: deps({ a: [["a"], []], b: [["b"], ["a"]], c: [["c"], ["a", "b"]] }) });
    expect(result.codeOrder).toEqual(["a", "b", "c"]);
    expect(result.moved).toEqual([]);
  });

  it("moves as little as needed: ties keep notebook order", () => {
    // x needs d; the independent cells keep their order around it.
    const cells = doc(code("x", "x = d"), code("p", "p = 1"), code("d", "d = 2"), code("q", "q = 3"));
    const result = exportPython(cells, { includeMarkdown: true, dependencies: deps({ x: [["x"], ["d"]], p: [["p"], []], d: [["d"], []], q: [["q"], []] }) });
    expect(result.codeOrder).toEqual(["p", "d", "x", "q"]);
    expect(result.moved).toEqual(["p", "d", "x"]);
  });

  it("keeps notebook order when a name has several defining cells, and reports them", () => {
    const cells = doc(code("a", "x = 1"), code("b", "y = x"), code("c", "x = 2"), code("d", "z = w"), code("e", "w = 1"));
    const result = exportPython(cells, {
      includeMarkdown: true,
      dependencies: deps({ a: [["x"], []], b: [["y"], ["x"]], c: [["x"], []], d: [["z"], ["w"]], e: [["w"], []] }),
    });
    expect(result.codeOrder).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.orderNote).toBe("duplicates");
    expect(result.duplicateDefinitions).toEqual([{ name: "x", cellIds: ["a", "c"] }]);
  });

  it("keeps notebook order when the dependencies form a cycle", () => {
    const cells = doc(code("a", "a = b"), code("b", "b = a"), code("c", "c = 1"));
    const result = exportPython(cells, { includeMarkdown: true, dependencies: deps({ a: [["a"], ["b"]], b: [["b"], ["a"]], c: [["c"], []] }) });
    expect(result.codeOrder).toEqual(["a", "b", "c"]);
    expect(result.orderNote).toBe("cycle");
    expect(result.duplicateDefinitions).toEqual([]);
  });

  it("ignores cell-local names (a leading underscore), self references and unknown names", () => {
    const cells = doc(code("a", "y = _t + x"), code("b", "_t = 1\nx = len([])"), code("c", "_t = 2"));
    const result = exportPython(cells, {
      includeMarkdown: true,
      dependencies: deps({ a: [["y", "y"], ["_t", "x", "y", "undefined_name"]], b: [["_t", "x"], ["len"]], c: [["_t"], []] }),
    });
    expect(result.orderNote).toBeUndefined();
    expect(result.duplicateDefinitions).toEqual([]);
    expect(result.codeOrder).toEqual(["b", "a", "c"]);
  });

  it("treats a cell missing from the dependency map as defining and reading nothing", () => {
    const cells = doc(code("a", "b_value + 1"), code("b", "b_value = 1"));
    const result = exportPython(cells, { includeMarkdown: true, dependencies: deps({ b: [["b_value"], []] }) });
    expect(result.codeOrder).toEqual(["a", "b"]);
  });

  it("keeps prose before the first code cell at the top and after the last at the end", () => {
    const cells = doc(md("top", "Top"), code("b", "b = a"), md("mid", "Mid"), code("a", "a = 1"), md("tail", "Tail"));
    const result = exportPython(cells, { includeMarkdown: true, dependencies: deps({ b: [["b"], ["a"]], a: [["a"], []] }) });
    expect(ok(parsePython(result.text)).value.cells.map((c) => c.source)).toEqual(["Top", "Mid", "a = 1", "b = a", "Tail"]);
  });

  it("keeps the order of a notebook with only prose", () => {
    const result = exportPython(doc(md("a", "A"), raw("b", "B"), md("c", "C")), { includeMarkdown: true, dependencies: deps({}) });
    expect(ok(parsePython(result.text)).value.cells.map((c) => c.source)).toEqual(["A", "B", "C"]);
    expect(result.codeOrder).toEqual([]);
  });
});

describe("exportPython: what py:percent cannot hold", () => {
  it("a code line that starts with '# %%' splits the cell when read back (documented)", () => {
    const { text } = exportPython(doc(code("c", "x = 1\n# %% not a new cell\ny = 2")), { includeMarkdown: true });
    expect(text).toContain("x = 1\n# %% not a new cell\ny = 2");
    const cells = ok(parsePython(text)).value.cells;
    expect(cells.map((c) => [c.type, c.source])).toEqual([["code", "x = 1"], ["code", "y = 2"]]);
    expect(cells[1].metadata).toEqual({ title: "not a new cell" });
  });

  it("other '%%' lines in code are safe: indented, '# %%%', '# %%x', '%%timeit'", () => {
    const source = "def f():\n    # %% indented\n    pass\n# %%% three\n# %%x\n%%timeit";
    const { text } = exportPython(doc(code("c", source)), { includeMarkdown: true });
    expect(ok(parsePython(text)).value.cells.map((c) => c.source)).toEqual([source]);
  });
});

describe("parsePython", () => {
  const defaults = { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO };

  it("reads the execution mode from the header and gives PyNote's kernel metadata", () => {
    const { value, warnings } = ok(parsePython(`${HEADER}\n# %%\nx = 1\n`));
    expect(warnings).toEqual([]);
    expect(value.metadata).toEqual({ ...defaults, PyNote: { executionMode: "reactive" } });
    expect(value.cells).toEqual([{ id: expect.stringMatching(/^[0-9a-f]{8}$/), type: "code", source: "x = 1", metadata: {} }]);
  });

  it("ignores unknown header keys and jupytext's jupyter block", () => {
    const text = "# ---\n# jupyter:\n#   jupytext:\n#     text_representation:\n#       extension: .py\n#   kernelspec:\n#     name: python3\n# title: Report\n# pynote:\n#   executionMode: hybrid\n#   future: 1\n# ---\n\n# %%\nx = 1\n";
    const { value, warnings } = ok(parsePython(text));
    expect(warnings).toEqual([]);
    expect(value.metadata).toEqual({ ...defaults, PyNote: { executionMode: "hybrid" } });
    expect(value.cells.map((c) => c.source)).toEqual(["x = 1"]);
  });

  it("warns about an unknown execution mode and ignores it", () => {
    const { value, warnings } = ok(parsePython("# ---\n# pynote:\n#   executionMode: fast\n# ---\nx = 1\n"));
    expect(value.metadata.PyNote).toBeUndefined();
    expect(warnings).toEqual(['Ignored an unknown execution mode "fast" in the header.']);
  });

  it("keeps comment lines that only look like a header as code", () => {
    for (const text of ["# ---\n# My script\n# ---\nprint(1)\n", "# ---\n# key: [unclosed\n# ---\nprint(1)\n", "# ---\n# no end\nprint(1)\n"]) {
      const { value } = ok(parsePython(text));
      expect(value.metadata.PyNote).toBeUndefined();
      expect(value.cells.map((c) => c.source)).toEqual([text.slice(0, -1)]);
    }
  });

  it("reads markers with titles, cell types and jupytext key=value metadata", () => {
    const text = [
      '# %% Load the data tags=["setup", "x"] id="cell-1" collapsed=true',
      "x = 1",
      "",
      "#%% [md] note=plain",
      "# Some *prose*",
      "#",
      "#no space",
      "",
      '# %% [raw] {"format": "text/latex", "n": 2}',
      "# \\LaTeX",
    ].join("\n");
    const cells = ok(parsePython(text)).value.cells;
    expect(cells).toEqual([
      { id: "cell-1", type: "code", source: "x = 1", metadata: { title: "Load the data", tags: ["setup", "x"], collapsed: true } },
      { id: expect.any(String), type: "markdown", source: "Some *prose*\n\nno space", metadata: { note: "plain" } },
      { id: expect.any(String), type: "raw", source: "\\LaTeX", metadata: { format: "text/latex", n: 2 } },
    ]);
  });

  it("defines a metadata key named __proto__ as data", () => {
    const cell = ok(parsePython('# %% __proto__={"polluted":true}\nx\n')).value.cells[0];
    expect(Object.keys(cell.metadata)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("does not take '# %%%', '# %%x' or an indented marker for a marker", () => {
    const text = "# %%%\n# %%x\n  # %%\nx = 1\n";
    expect(ok(parsePython(text)).value.cells.map((c) => c.source)).toEqual([text.slice(0, -1)]);
  });

  it("gives new ids to cells without a valid id, and to every cell sharing one", () => {
    const text = '# %% id="has space"\na\n\n# %% id="dup"\nb\n\n# %% id="dup"\nc\n\n# %% id="keep_me"\nd\n';
    const { value, warnings } = ok(parsePython(text));
    const ids = value.cells.map((c) => c.id);
    expect(ids[3]).toBe("keep_me");
    expect(ids.slice(0, 3)).not.toContain("dup");
    expect(new Set(ids).size).toBe(4);
    expect(warnings).toHaveLength(3);
  });

  it("makes text before the first marker a code cell, unless it is blank", () => {
    expect(ok(parsePython("import os\n\n# %%\nx = 1\n")).value.cells.map((c) => c.source)).toEqual(["import os", "x = 1"]);
    expect(ok(parsePython(`${HEADER}\n\n\n# %%\nx = 1\n`)).value.cells.map((c) => c.source)).toEqual(["x = 1"]);
  });

  it("reads a plain script as one code cell", () => {
    expect(ok(parsePython("import os\n\nprint(os.name)\n")).value.cells.map((c) => [c.type, c.source])).toEqual([["code", "import os\n\nprint(os.name)"]]);
  });

  it("reads an empty file as an empty notebook", () => {
    expect(ok(parsePython("")).value.cells).toEqual([]);
    expect(ok(parsePython(HEADER)).value.cells).toEqual([]);
  });

  it("strips exactly the one blank line that separates cells", () => {
    const text = "# %%\na\n\n\n# %%\nb\n \n# %%\n\n\nc\n";
    expect(ok(parsePython(text)).value.cells.map((c) => c.source)).toEqual(["a\n", "b\n ", "\n\nc"]);
  });

  it("keeps a cell's text when the separating blank line was deleted", () => {
    expect(ok(parsePython("# %%\na\n# %%\nb")).value.cells.map((c) => c.source)).toEqual(["a", "b"]);
  });

  it("accepts CRLF line endings and a byte order mark", () => {
    const text = "\uFEFF# ---\r\n# pynote:\r\n#   executionMode: reactive\r\n# ---\r\n\r\n# %%\r\nx = 1\r\n\r\n# %% [markdown]\r\n# Hi\r\n";
    const { value } = ok(parsePython(text));
    expect(value.metadata.PyNote).toEqual({ executionMode: "reactive" });
    expect(value.cells.map((c) => [c.type, c.source])).toEqual([["code", "x = 1"], ["markdown", "Hi"]]);
  });

  it.each([
    ["unterminated JSON value", '# %% tags=["a"\nx\n'],
    ["binary noise", "\u0000\u0001\u0002# %%\u0003"],
    ["only markers", "# %%\n# %%\n# %%"],
    ["marker metadata without values", "# %% a= b= [raw] [markdown]"],
    ["huge header", `# ---\n${"# k: v\n".repeat(1000)}# ---\n`],
  ])("never throws: %s", (_name, text) => {
    expect(parsePython(text).ok).toBe(true);
  });
});

describe("round trips", () => {
  const roundTrip = (cells: DocCell[]) => ok(parsePython(exportPython(doc(...cells), { includeMarkdown: true }).text)).value.cells;

  it("keeps code exactly, including adversarial content", () => {
    const sources = [
      'doc = """\n````\n```python\n<!-- cell abc -->\n"""',
      "s = '<!-- code abc -->'\n# ---\n#",
      "émoji = '😀 数据'\n\n\n",
      "",
      "\ttabbed = True  ",
      "%matplotlib inline\n!pip install x",
    ];
    const cells = roundTrip([...sources.map((s, i) => code(`c${i}`, s)), md("m", "end")]);
    expect(cells.filter((c) => c.type === "code").map((c) => c.source)).toEqual(sources);
  });

  it("keeps prose equivalent and raw cells exact", () => {
    const cells = roundTrip([md("a", "A *long* paragraph " + "with many words ".repeat(10)), raw("b", "  raw\n\n# not a heading\n%% x"), code("c", "x")]);
    expect(cells[0].source.replace(/\s+/g, " ")).toBe(("A *long* paragraph " + "with many words ".repeat(10)).trim());
    expect(cells[1]).toMatchObject({ type: "raw", source: "  raw\n\n# not a heading\n%% x" });
  });

  it("round-trips a notebook with only code, only markdown, or only raw cells", () => {
    expect(roundTrip([code("a", "a = 1"), code("b", "b = 2")]).map((c) => c.source)).toEqual(["a = 1", "b = 2"]);
    expect(roundTrip([md("a", "A"), md("b", "B")]).map((c) => [c.type, c.source])).toEqual([["markdown", "A"], ["markdown", "B"]]);
    expect(roundTrip([raw("a", "A"), raw("b", "")]).map((c) => [c.type, c.source])).toEqual([["raw", "A"], ["raw", ""]]);
  });

  it("keeps cell ids in pair mode", () => {
    const notebook = doc(code("first-cell", "a = 1"), code("_2", "b = 2"));
    const cells = ok(parsePython(exportPython(notebook, { includeMarkdown: false, cellIds: true }).text)).value.cells;
    expect(cells.map((c) => c.id)).toEqual(["first-cell", "_2"]);
  });
});
