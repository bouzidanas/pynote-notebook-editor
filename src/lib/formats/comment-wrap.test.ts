import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";
import { katexMathExtensions } from "../markdown-katex";
import { markdownToComment } from "./comment-wrap";

const root = resolve(__dirname, "../../..");
const goldenDir = resolve(root, "test/golden/comment-wrap");

const wrap = (md: string, width?: number) => markdownToComment(md, width);
const text = (md: string, width?: number) => wrap(md, width).join("\n");

describe("golden files", () => {
  // Each <name>.md (or <name>.w<width>.md) has a reviewed <name>.txt. Update
  // them with `npx vitest run -u` only for an intended change, and review the diff.
  const inputs = readdirSync(goldenDir).filter((name) => name.endsWith(".md")).sort();

  it("covers every rule group", () => {
    expect(inputs.length).toBeGreaterThanOrEqual(14);
  });

  it.each(inputs)("%s", async (name) => {
    const width = /\.w(\d+)\.md$/.exec(name);
    const output = text(readFileSync(resolve(goldenDir, name), "utf8"), width ? Number(width[1]) : 79);
    await expect(`${output}\n`).toMatchFileSnapshot(resolve(goldenDir, name.replace(/(\.w\d+)?\.md$/, ".txt")));
  });
});

describe("comment form", () => {
  it("prefixes lines with '# ' and writes empty lines as a bare '#'", () => {
    expect(wrap("One\n\nTwo")).toEqual(["# One", "#", "# Two"]);
  });

  it("drops leading and trailing blank lines and collapses runs", () => {
    expect(wrap("\n\n\nA\n\n\n\nB\n\n\n")).toEqual(["# A", "#", "# B"]);
  });

  it("writes nothing for empty or blank Markdown", () => {
    expect(wrap("")).toEqual([]);
    expect(wrap(" \n\t\n")).toEqual([]);
  });

  it("normalizes CRLF and CR line endings and replaces NUL", () => {
    expect(wrap("a\r\nb\rc")).toEqual(["# a b c"]);
    expect(wrap("x\0y")).toEqual(["# x\uFFFDy"]);
  });

  it("is deterministic", () => {
    const md = readFileSync(resolve(goldenDir, "lists.md"), "utf8");
    expect(wrap(md)).toEqual(wrap(md));
  });
});

describe("paragraphs", () => {
  it("fill lines up to the width, prefix included", () => {
    const lines = wrap("aaa bbb ccc ddd eee", 11);
    expect(lines).toEqual(["# aaa bbb", "# ccc ddd", "# eee"]);
  });

  it("put a word longer than the width on its own line, unbroken", () => {
    expect(wrap("a abcdefghijklmnop b", 10)).toEqual(["# a", "# abcdefghijklmnop", "# b"]);
  });

  it.each([
    ["code span", "`a b c d`"],
    ["link", "[a b c](http://x.y 'd e')"],
    ["image", "![a b c](i.png)"],
    ["inline HTML", '<span title="a b c">'],
    ["inline math", "$a + b + c$"],
    ["single-line display math", "$$a + b + c$$"],
  ])("never break inside a %s", (_name, atom) => {
    const lines = wrap(`one two ${atom} three`, 12);
    expect(lines.some((line) => line.includes(atom))).toBe(true);
  });

  it("join a code span that spans source lines into one atom", () => {
    expect(wrap("see `a\nb` here", 79)).toEqual(["# see `a b` here"]);
  });

  it("break only at spaces, never at a non-breaking space", () => {
    expect(wrap("aaaa\u00a0bbbb cc", 8)).toEqual(["# aaaa\u00a0bbbb", "# cc"]);
  });

  it("keep both kinds of hard line breaks", () => {
    expect(wrap("one  \ntwo\\\nthree four", 79)).toEqual(["# one  ", "# two\\", "# three four"]);
  });

  it("keep the indentation of a line after a hard break, which may protect it", () => {
    expect(wrap("a  \n    - b", 79)).toEqual(["# a  ", "#     - b"]);
  });

  it.each(["-", "+", "*", "1.", "2)", "#", "###", ">", ">quote", "```", "~~~x", "===", "---", "|", ":--", "<div>", "$$", "%%"])(
    "never start a wrapped line with %j",
    (word) => {
      const lines = wrap(`aaaa bbbb ${word} cccc`, 12);
      for (const line of lines.slice(1)) expect(line.slice(2).startsWith(word)).toBe(false);
      expect(lines.join(" ")).toContain(`bbbb ${word}`);
    },
  );

  it("never end a wrapped line with a backslash (it would be a hard break)", () => {
    const lines = wrap("aaaa bbbb\\ cccc dddd", 12);
    for (const line of lines.slice(0, -1)) expect(line.endsWith("\\")).toBe(false);
  });

  it("escape a line that starts with %% so it cannot read as a cell marker", () => {
    expect(wrap("%% not a marker")).toEqual(["# \\%% not a marker"]);
  });

  it("keep multi-line display math inside a paragraph on its own lines", () => {
    expect(wrap("text\n$$\na % b\nc\n$$\nmore text", 79)).toEqual(["# text", "# $$", "# a % b", "# c", "# $$", "# more text"]);
  });
});

describe("verbatim blocks", () => {
  const long = "x".repeat(100);

  it.each([
    ["ATX heading", `## ${long}`],
    ["setext heading", `${long}\n===`],
    ["fenced code", `\`\`\`\n${long}\n\n  indented\n\`\`\``],
    ["indented code", `    ${long}\n    second`],
    ["HTML block", `<div>\n${long}\n</div>`],
    ["math block", `$$\n${long}\n% comment\n$$`],
    ["rule", "* * *"],
    ["link definition", `[ref]: http://example.com/${long}`],
  ])("keep a %s exactly", (_name, block) => {
    expect(wrap(block, 20)).toEqual(block.split("\n").map((line) => (line === "" ? "#" : `# ${line}`)));
  });

  it("close an unclosed fence (renders the same)", () => {
    expect(wrap("~~~~py\nx = 1")).toEqual(["# ~~~~py", "# x = 1", "# ~~~~"]);
  });

  it("keep YAML front matter at the top of a cell", () => {
    expect(wrap("---\ntitle: x\nlist:\n  - a\n---\nText")).toEqual(["# ---", "# title: x", "# list:", "#   - a", "# ---", "# Text"]);
  });
});

describe("lists", () => {
  it("hang wrapped text under the item text, keeping markers verbatim", () => {
    expect(wrap("7) aaa bbb ccc ddd", 12)).toEqual(["# 7) aaa bbb", "#    ccc ddd"]);
  });

  it("keep a task box with its first word and hang task text at the content offset", () => {
    // Hanging it under the text after the box would indent it by four, which
    // marked reads as indented code inside a list item.
    expect(wrap("- [x] aaa bbb ccc", 15)).toEqual(["# - [x] aaa bbb", "#   ccc"]);
    expect(wrap("- [ ] aaaaaaaaaa", 8)).toEqual(["# - [ ] aaaaaaaaaa"]);
  });

  it("keep a task item whose box is followed by a block other than text as written", () => {
    // marked leaves the box in the heading and still adds a checkbox.
    expect(wrap("- [x] a\n  ===")).toEqual(["# - [x] a", "#   ==="]);
  });

  it("keep nesting and loose spacing", () => {
    expect(wrap("- a\n\n  - b\n- c")).toEqual(["# - a", "#", "#   - b", "# - c"]);
  });

  it("expand a tab after the marker into spaces (the content then starts at column 4)", () => {
    expect(wrap("-\tfoo\n\n    bar")).toEqual(["# -   foo", "#", "#     bar"]);
  });

  it("keep an empty item", () => {
    expect(wrap("- a\n-\n- b")).toEqual(["# - a", "# -", "# - b"]);
  });
});

describe("marked's quirks", () => {
  it("keep an empty quote line that ends a quote (it stops lazy continuation)", () => {
    expect(wrap("> - a\n>\nb")).toEqual(["# > - a", "# >", "# b"]);
  });

  it("keep a quote with lazy lines around nested blocks as written", () => {
    const md = "> - a\n>         indented\n`a b`";
    expect(wrap(md, 12)).toEqual(md.split("\n").map((line) => `# ${line}`));
  });

  it("keep a bare list marker after a hard break on its own line", () => {
    expect(wrap("aaa bbb\\\n+\nccc ddd", 12)).toEqual(["# aaa bbb\\", "# +", "# ccc ddd"]);
  });

  it("never let a lone tag or rule end a line it starts", () => {
    expect(wrap("> </span> a\n> *a*", 12)).toEqual(["# > </span> a", "# > *a*"]);
    expect(wrap("a  \n--- b c", 8)).toEqual(["# a  ", "# --- b", "# c"]);
  });

  it("let inline math start a line, and escape a dollar that would become math", () => {
    // Math renders after any whitespace, a line break included.
    expect(wrap("aaaa bbbb $x$ cc", 12)).toEqual(["# aaaa bbbb", "# $x$ cc"]);
    expect(wrap("text\n$x$ more")).toEqual(["# text $x$ more"]);
    // A span cannot hold a line break, so these dollars are not math; joined
    // onto one line they would be, so the first is escaped.
    expect(wrap("x $a\nb$ y")).toEqual(["# x \\$a b$ y"]);
  });

  it("keep a paragraph whose wrapping would read differently as written", () => {
    // A wrapped line before a delimiter-like line would read as a table head.
    const md = "x|y | **b** |  | xmnbduqd ezqy qzfimmhqz\n- | - | :-- | -";
    expect(wrap(md, 30)).toEqual(md.split("\n").map((line) => `# ${line}`));
  });
});

describe("blockquotes", () => {
  it("prefix every line with '> ', blank lines with '>'", () => {
    expect(wrap("> aaa bbb ccc\n>\n> ddd", 12)).toEqual(["# > aaa bbb", "# > ccc", "# >", "# > ddd"]);
  });

  it("make lazy continuation lines explicit", () => {
    expect(wrap("> a\nb")).toEqual(["# > a b"]);
  });
});

describe("tables", () => {
  it("align pipes, keep alignment colons and cell text (escapes included)", () => {
    expect(wrap("a|b\n:-:|--:\nlonger|x\\|y")).toEqual([
      "# |   a    |    b |",
      "# | :----: | ---: |",
      "# | longer | x\\|y |",
    ]);
  });

  it("measure cells in code points", () => {
    expect(wrap("| é | 😀 |\n|---|---|\n| ab | c |")).toEqual(["# | é   | 😀   |", "# | --- | --- |", "# | ab  | c   |"]);
  });

  it("never wrap a row", () => {
    const row = `| ${"w ".repeat(50)}|`;
    expect(wrap(`${row}\n|---|`, 20)[0].length).toBeGreaterThan(20);
  });
});

describe("independence from the app's marked configuration", () => {
  it("gives the same output after KaTeX extensions are added to the global marked", () => {
    const md = readFileSync(resolve(goldenDir, "math.md"), "utf8");
    const before = wrap(md, 40);
    marked.use({ extensions: katexMathExtensions() });
    expect(wrap(md, 40)).toEqual(before);
  });
});

describe("never throws", () => {
  it.each([
    ["deep nesting", `${"> ".repeat(300)}x`],
    ["deep lists", Array.from({ length: 100 }, (_, i) => `${"  ".repeat(i)}- item`).join("\n")],
    ["only markers", "-\n>\n#\n|\n```"],
    ["tiny width", "some words here"],
  ])("%s", (_name, md) => {
    const lines = wrap(md, 3);
    for (const line of lines) expect(line === "#" || line.startsWith("# ")).toBe(true);
  });
});

it("a line of invisible characters is not blank to Markdown, so it is kept", () => {
  // trim() drops U+FEFF and U+2028, but Markdown makes a paragraph of them.
  expect(markdownToComment("Text\n\n\uFEFF", 79)).toEqual(["# Text", "#", "# \uFEFF"]);
  expect(markdownToComment("\t\u2028", 79)).toEqual(["# \t\u2028"]);
});

