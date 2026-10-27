import { describe, expect, it } from "vitest";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO, type DocCell, type JsonObject, type NotebookDocument } from "./document";
import { exportMarkdown, parseMarkdown } from "./markdown";

const ok = <T>(r: { ok: true; value: T; warnings: string[] } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

const code = (id: string, source: string): DocCell => ({ id, type: "code", source, metadata: {} });
const md = (id: string, source: string): DocCell => ({ id, type: "markdown", source, metadata: {} });
const raw = (id: string, source: string, metadata: JsonObject = {}): DocCell => ({ id, type: "raw", source, metadata });
const doc = (...cells: DocCell[]): NotebookDocument => ({ cells, metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO } });
const shape = (text: string) => ok(parseMarkdown(text)).value.cells.map((c) => [c.type, c.source]);

const NOTE = (file: string) => `<!-- PyNote: this is the prose half of a notebook whose code is in ${file}. -->`;

describe("exportMarkdown: plain", () => {
  it("writes prose verbatim and code as fenced python blocks, separated by one blank line", () => {
    const text = exportMarkdown(doc(md("a", "# Title\n\nSome *text*."), code("b", "x = 1\nprint(x)"), md("c", "End.")), { includeCode: true });
    expect(text).toBe("# Title\n\nSome *text*.\n\n```python\nx = 1\nprint(x)\n```\n\nEnd.\n");
  });

  it("makes the fence longer than any backtick run in the code (at least three)", () => {
    expect(exportMarkdown(doc(code("a", "s = '`'")), { includeCode: true })).toBe("```python\ns = '`'\n```\n");
    expect(exportMarkdown(doc(code("a", "doc = '''\n````\n'''")), { includeCode: true })).toBe("`````python\ndoc = '''\n````\n'''\n`````\n");
  });

  it("writes an empty code cell as an empty block", () => {
    expect(exportMarkdown(doc(code("a", "")), { includeCode: true })).toBe("```python\n```\n");
  });

  it("omits code when includeCode is false", () => {
    expect(exportMarkdown(doc(md("a", "A"), code("b", "x"), md("c", "C")), { includeCode: false })).toBe("A\n\nC\n");
  });

  it.each([
    ["text/latex", "latex"],
    ["text/restructuredtext", "rst"],
    ["text/html", "html"],
    ["text/x-python", "text"],
    [undefined, "text"],
  ])("fences a raw cell of format %s with the info string %s", (format, info) => {
    const metadata: JsonObject = format === undefined ? {} : { format };
    expect(exportMarkdown(doc(raw("r", "\\alpha", metadata)), { includeCode: false })).toBe(`\`\`\`${info}\n\\alpha\n\`\`\`\n`);
  });

  it("writes no front matter and ends with exactly one newline", () => {
    const text = exportMarkdown({ ...doc(md("a", "A\n\n\n")), metadata: { PyNote: { executionMode: "reactive" } } }, { includeCode: true });
    expect(text).toBe("A\n");
  });

  it("skips empty prose and writes an empty notebook as an empty file", () => {
    expect(exportMarkdown(doc(md("a", ""), md("b", " \n"), code("c", "x")), { includeCode: true })).toBe("```python\nx\n```\n");
    expect(exportMarkdown(doc(), { includeCode: true })).toBe("");
  });

  it("writes LF line endings", () => {
    expect(exportMarkdown(doc(md("a", "a\r\nb"), code("b", "x\ry")), { includeCode: true })).toBe("a\nb\n\n```python\nx\ny\n```\n");
  });

  it("gives a prose line that reads exactly like a pair anchor one more space, so it reads back unchanged", () => {
    const source = "<!-- cell abc -->\n<!--  code x -->\n<!-- cell not an id! -->";
    const text = exportMarkdown(doc(md("a", source)), { includeCode: true });
    expect(text).toBe("<!--  cell abc -->\n<!--   code x -->\n<!-- cell not an id! -->\n");
    expect(shape(text)).toEqual([["markdown", source]]);
  });
});

describe("exportMarkdown: pair mode", () => {
  it("marks every cell with an anchor and leaves the code to the .py half", () => {
    const text = exportMarkdown(doc(md("m1", "# Title"), code("c1", "x = 1"), raw("r1", "\\LaTeX", { format: "text/latex" }), md("m2", "")), {
      includeCode: false, pairAnchors: true, pairedWith: "analysis.py",
    });
    expect(text).toBe(`${NOTE("analysis.py")}\n\n<!-- cell m1 -->\n# Title\n\n<!-- code c1 -->\n\n<!-- raw r1 -->\n\`\`\`latex\n\\LaTeX\n\`\`\`\n\n<!-- cell m2 -->\n`);
  });

  it("reads the prose half of an empty notebook as no cells (the note marks it as a pair half)", () => {
    const text = exportMarkdown(doc(), { includeCode: false, pairAnchors: true, pairedWith: "a.py" });
    expect(ok(parseMarkdown(text)).value.cells).toEqual([]);
  });

  it("names the code half generically without pairedWith, and keeps a file name inside the comment", () => {
    expect(exportMarkdown(doc(), { includeCode: false, pairAnchors: true })).toBe(`${NOTE("the paired .py file")}\n`);
    expect(exportMarkdown(doc(), { includeCode: false, pairAnchors: true, pairedWith: "a-->b\nc.py" }).split("\n")[0]).toBe(NOTE("a- ->b c.py"));
  });
});

describe("parseMarkdown: pair halves", () => {
  it("reads cells and anchors exactly; code anchors become empty code cells", () => {
    const text = `${NOTE("a.py")}\n\n<!-- cell m1 -->\n\n# Title\n\n\n<!-- code c1 -->\n\n<!-- raw r1 -->\n\`\`\`\`rst\n**x**\n\`\`\`\n\`\`\`\`\n\n<!-- cell m2 -->\n`;
    const { value, warnings } = ok(parseMarkdown(text));
    expect(warnings).toEqual([]);
    expect(value).toEqual({
      cells: [
        { id: "m1", type: "markdown", source: "\n# Title\n", metadata: {} },
        { id: "c1", type: "code", source: "", metadata: {} },
        { id: "r1", type: "raw", source: "**x**\n```", metadata: { format: "text/restructuredtext" } },
        { id: "m2", type: "markdown", source: "", metadata: {} },
      ],
      metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO },
    });
  });

  it("accepts anchors with trailing blanks", () => {
    expect(ok(parseMarkdown("<!-- cell a -->  \nText\n")).value.cells).toEqual([{ id: "a", type: "markdown", source: "Text", metadata: {} }]);
  });

  it("keeps prose typed outside any cell as new markdown cells, with warnings", () => {
    const text = "Typed at the top.\n\n<!-- code c1 -->\nTyped after code.\n\n<!-- raw r1 -->\n```text\nr\n```\nAfter raw.\n";
    const { value, warnings } = ok(parseMarkdown(text));
    expect(value.cells.map((c) => [c.type, c.source])).toEqual([
      ["markdown", "Typed at the top."], ["code", ""], ["markdown", "Typed after code."], ["raw", "r"], ["markdown", "After raw."],
    ]);
    expect(warnings).toHaveLength(3);
  });

  it("keeps a raw cell that lost its fence, with a warning", () => {
    const { value, warnings } = ok(parseMarkdown("<!-- raw r1 -->\nplain text\n\n<!-- cell m -->\nx\n"));
    expect(value.cells.map((c) => [c.id, c.type, c.source])).toEqual([["r1", "raw", "plain text"], ["m", "markdown", "x"]]);
    expect(warnings).toEqual(["Line 1: raw cell r1 is not a fenced block; kept its text as is."]);
  });

  it("gives new ids to cells that share an id", () => {
    const { value, warnings } = ok(parseMarkdown("<!-- cell a -->\nx\n\n<!-- cell a -->\ny\n"));
    expect(value.cells.map((c) => c.id)).not.toContain("a");
    expect(warnings).toHaveLength(2);
  });

  it("does not take an anchor inside a fenced block for a pair anchor", () => {
    expect(shape("Text\n\n```html\n<!-- code abc -->\n```\n")).toEqual([["markdown", "Text\n\n```html\n<!-- code abc -->\n```"]]);
  });
});

describe("parseMarkdown: any Markdown file", () => {
  it("makes python fences code cells and the text between them one markdown cell", () => {
    const text = "# Title\n\nIntro.\n\n```python\nx = 1\n```\n\nMiddle one.\n\nMiddle two.\n\n```Python3 {.cell}\ny = 2\n```\n";
    expect(shape(text)).toEqual([["markdown", "# Title\n\nIntro."], ["code", "x = 1"], ["markdown", "Middle one.\n\nMiddle two."], ["code", "y = 2"]]);
  });

  it("trims exactly one separating blank line on each side of a code block", () => {
    const text = "\nlead\n\n\n```python\nx\n```\n\n\ntrail\n";
    expect(shape(text)).toEqual([["markdown", "\nlead\n"], ["code", "x"], ["markdown", "\ntrail"]]);
  });

  it("keeps other fences, indented python fences and nested fences in the prose", () => {
    const text = "```js\nlet x;\n```\n\n- item\n\n  ```python\n  inside a list\n  ```\n\n````markdown\n```python\nshown, not run\n```\n````\n";
    expect(shape(text)).toEqual([["markdown", text.slice(0, -1)]]);
  });

  it("reads an unclosed python fence to the end of the file", () => {
    expect(shape("Text\n\n```python\nx = 1\n")).toEqual([["markdown", "Text"], ["code", "x = 1\n"]]);
  });

  it("reads plain prose as one markdown cell and blank text as no cells", () => {
    expect(shape("Just prose.\n")).toEqual([["markdown", "Just prose."]]);
    expect(shape("")).toEqual([]);
    expect(shape("\n \n")).toEqual([]);
  });

  it("round-trips a plain export of code and prose", () => {
    const notebook = doc(md("a", "Intro"), code("b", "x = 1\n"), md("c", "\nMiddle\n"), code("d", "doc = '''```'''"), code("e", ""));
    const cells = ok(parseMarkdown(exportMarkdown(notebook, { includeCode: true }))).value.cells;
    expect(cells.map((c) => [c.type, c.source])).toEqual(notebook.cells.map((c) => [c.type, c.source]));
  });

  it("accepts CRLF line endings and a byte order mark", () => {
    expect(shape("\uFEFFA\r\n\r\n```python\r\nx\r\n```\r\n")).toEqual([["markdown", "A"], ["code", "x"]]);
  });

  it.each([
    ["only fences", "```\n```\n```"],
    ["anchors and fences mixed", "<!-- raw a -->\n<!-- code b -->\n```\n<!-- cell c -->"],
    ["binary noise", "\u0000\u0001<!--\u0002"],
  ])("never throws: %s", (_name, text) => {
    expect(parseMarkdown(text).ok).toBe(true);
  });
});
