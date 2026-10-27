// The markdown cell editor's parser (mathSyntax.ts, in Milkdown's remark)
// takes math exactly where the renderer finds it.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fc, test as prop } from "@fast-check/vitest";
import { Marked, type Token } from "marked";
import { Editor, defaultValueCtx, remarkCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import type { RemarkPluginRaw } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";
import { mathExtensions } from "./markdown-math";
import { markdownSyntax } from "./markdownSyntax";
import type { MdNode } from "./mathSyntax";

let editor: Editor;
// The editor without PyNote's math: CommonMark and GFM, as Milkdown reads them.
let plain: Editor;
// The editor with a count of the reads remarkMath's parser asks for, from a
// remark plugin that comes between remark-parse and remarkMath.
let counted: Editor;
let reads = 0;
const countReads = $remark("countReads", () =>
  function (this: { parser?: (document: string, file: unknown) => unknown }) {
    const parse = this.parser!;
    this.parser = (document, file) => {
      reads++;
      return parse(document, file);
    };
  } as unknown as RemarkPluginRaw<unknown>);
beforeAll(async () => {
  const make = () => {
    const root = document.createElement("div");
    document.body.append(root);
    return Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, "");
    });
  };
  editor = await markdownSyntax(make()).create();
  plain = await make().use(commonmark).use(gfm).create();
  counted = await markdownSyntax(make().use(countReads)).create();
});
afterAll(async () => {
  await Promise.all([editor.destroy(), plain.destroy(), counted.destroy()]);
  document.body.innerHTML = "";
});

/** The math the parser reads in `markdown`, as written (line endings as the renderer reads them). */
function parserMath(markdown: string): string[] {
  const remark = editor.action((ctx) => ctx.get(remarkCtx));
  const math: string[] = [];
  const walk = (node: MdNode) => {
    if (node.type === "inlineMath") math.push(node.value!.replace(/\r\n?/g, "\n"));
    node.children?.forEach(walk);
  };
  walk(remark.runSync(remark.parse(markdown), markdown) as unknown as MdNode);
  return math;
}

/** The math the renderer finds in `markdown` (images have no text in the editor). */
function rendererMath(markdown: string): string[] {
  const marked = new Marked();
  marked.use({ extensions: mathExtensions(() => "") });
  const math: string[] = [];
  const walk = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === "inlineKatex" || token.type === "displayMath") math.push(token.raw);
      else if (token.type === "list") token.items.forEach((item: Token & { tokens: Token[] }) => walk(item.tokens));
      else if (token.type !== "image" && "tokens" in token && token.tokens) walk(token.tokens);
    }
  };
  walk(marked.lexer(markdown));
  return math;
}

// What a paragraph is made of, by what decides where the renderer finds math
// in it. A line break is followed by what cannot start a block of its own.
// Left out is what CommonMark and marked read apart whatever the math: code
// (marked lets emphasis, and a "~" before it, take a backtick that opens code
// to CommonMark), images (a description the math holds a "]" of, which marked
// reads as text) and link destinations other than "(u)".
const PARTS = [
  "a", "x", "5", "10", " ", " ", " ", "  ", "\t", ".", ",", ":", "?", "!", "(", ")", "'", "|",
  "$", "$", "$", "$", "$$", "\\$", "\\", "\\\\", "&#36;", "$x$", "$a*b$", "$x_1$", "$5", "$x", "x$",
  "**$", "$**", "*$", "$*", "_$", "$_", "~$", "$~", "[$", "$]",
  "*", "**", "_", "~", "~~", "[", "]", "](u)", "[a](u)", "[d]", "<b>", "</b>",
  "\ny", "\n$", "  \ny", "\\\ny",
];
const paragraph = fc
  .array(fc.constantFrom(...PARTS), { maxLength: 40 })
  .map((parts) => `x ${parts.join("")}`)
  .filter((markdown) => !markdown.includes("![") && !/\]\((?!u\))/.test(markdown));

// marked reads a link's text with its escaped brackets as brackets.
const unescapingBrackets = (math: string[]) => math.map((raw) => raw.replace(/\\+(?=[[\]])/g, ""));

describe("the parser takes math where the renderer finds it", () => {
  test("in the cases where the renderer reads a line differently from CommonMark", () => {
    for (const markdown of [
      "It costs $5 and $10, or $5 and $x$.",
      "It costs $5 for **$n$** items, $10 for *$x_1$* and $3 for ~~$k$~~.",
      "**see $a*b*c$ more** and **$a*b$** and *a $b* c$",
      "*see $5 for **$n$** here* and [*cost* $5](u) and $x$, [$y](v) $z$",
      "$ x $ and $x $, $x\\ $ y, $a$$b$ and $$a$$$$b$$",
      "Display $$a\nb$$ over two lines, and $x$\r\nafter a CRLF and $y$\rafter a CR, $$c\r\nd$$ too.",
      "A tab\t$x$\tand a reference [a $b$][d].\n\n[d]: https://example.com",
      // A line of "1. " starts a block for marked, not for CommonMark: the
      // math is in the paragraphs that make, apart.
      "**$*\n1. \n$a*$ and $x$, *a\n1. \n$b*$ c*",
      // A paragraph whose first line is "$$" alone, indented.
      "  $$\nx\n$$",
    ]) {
      expect(parserMath(markdown), JSON.stringify(markdown)).toEqual(rendererMath(markdown));
    }
  });

  prop.prop([paragraph], { numRuns: 600 })("in any paragraph", (markdown) => {
    expect(unescapingBrackets(parserMath(markdown))).toEqual(unescapingBrackets(rendererMath(markdown)));
  });
});

// Lines of a document, by what decides its blocks: lines of "$" or "$$",
// block math fences or not (indented, after a list marker or a ">", or with
// more on the line), list items and quotes and the indentation that goes on
// with them, blank lines, and what else starts or ends a block. No "~": it
// fences the code that block math is compared with.
const LINES = [
  "$", "$", "$$", "$$", "$$", " $$", "  $", "    $$", "$$ ", "$$$", "$ x", "$x$", "$$x$$", "a $", "\\$", "a\\",
  "- $$", "* $", "1. $$", "> $$", "> $", ">", "> a", "  $$", "  > $$",
  "- a", "* b", "+ c", "1. d", "2) e", "-", "  - f", "  > g", "    h",
  "", "", "", "a", "b c", "# h", "---", "===", "```", "| a |", "|---|", "<div>",
];
const markdownDocument = fc.array(fc.constantFrom(...LINES), { maxLength: 14 }).map((lines) => lines.join("\n"));

const CONTAINERS = new Set(["root", "blockquote", "list", "listItem", "table", "tableRow"]);

/** The blocks of a syntax tree, nested, with the lines each spans (block math as code). */
function blocks(node: MdNode): string {
  const name = `${node.type === "blockMath" ? "code" : node.type} ${node.position?.start.line}-${node.position?.end.line}`;
  return CONTAINERS.has(node.type) ? `${name} (${(node.children ?? []).map(blocks).join(", ")})` : name;
}

/** `markdown` with the block math in its syntax tree fenced as code: "~~~" for each "$" or "$$" fence. */
function fencedAsCode(markdown: string, tree: MdNode): string {
  const fences: Array<[number, number]> = [];
  const walk = (node: MdNode) => {
    if (node.type === "blockMath") {
      const size = /^\$+/.exec(node.value!)![0].length;
      fences.push([node.position!.start.offset!, size], [node.position!.end.offset! - size, size]);
    }
    node.children?.forEach(walk);
  };
  walk(tree);
  return fences.sort(([a], [b]) => b - a).reduce((text, [at, size]) => `${text.slice(0, at)}~~~${text.slice(at + size)}`, markdown);
}

const parse = (by: Editor, markdown: string) => by.action((ctx) => ctx.get(remarkCtx)).parse(markdown) as unknown as MdNode;

describe("the parser reads blocks as CommonMark does, with block math as fenced code", () => {
  // A line of "$" or "$$" that no closing fence follows is no block math:
  // lists and quotes start on the lines after it.
  const examples = ["$$\n- item", "$\n- item", "$$\n1. item", "$$\n> quote", "- x\n\n  $$\n  - nested", "> $$\n> - a", "$$\n- a\n$$\n- b"];

  prop.prop([markdownDocument], { numRuns: 500, examples: examples.map((markdown) => [markdown]) })("in any document", (markdown) => {
    const tree = parse(editor, markdown);
    expect(blocks(tree)).toBe(blocks(parse(plain, fencedAsCode(markdown, tree))));
  });
});

describe("the parser reads blocks as the renderer does", () => {
  test("a line of $ or $$ right under a table is a row of it", () => {
    expect(blocks(parse(editor, "a\n-:\n$\n \n$"))).toBe("root 1-5 (table 1-3 (tableRow 1-1 (tableCell 1-1), tableRow 3-3 (tableCell 3-3)), paragraph 5-5)");
    const rows = "table 1-5 (tableRow 1-1 (tableCell 1-1), tableRow 3-3 (tableCell 3-3), tableRow 4-4 (tableCell 4-4), tableRow 5-5 (tableCell 5-5))";
    expect(blocks(parse(editor, "| a |\n|---|\n$$\nx\n$$"))).toBe(`root 1-5 (${rows})`);
    expect(blocks(parse(editor, "> | a |\n> |---|\n> $$\n> x\n> $$"))).toBe(`root 1-5 (blockquote 1-5 (${rows}))`);
  });
});

describe("the parser reads a document again only where a fence that failed may have hidden a list or quote", () => {
  const readsOf = (markdown: string) => {
    reads = 0;
    counted.action((ctx) => ctx.get(remarkCtx)).parse(markdown);
    return reads;
  };

  test("once, when no line the fence read past could start a list item, quote or footnote definition", () => {
    // Math lines that start with a digit, a "-" or a "[", but no list item
    // or footnote definition.
    for (const markdown of ["Some text.\n\n$$\n\n\\int f", "$$\nE = mc^2", "$$\n2x + 1 = 0\n-x^2 + 1\n[a, b]"]) {
      expect(readsOf(markdown), JSON.stringify(markdown)).toBe(1);
    }
  });

  test("twice, when one could", () => {
    for (const markdown of ["$$\n- item", "$$\n1. item", "$$\n> quote", "$$\n[^a]: note", "- x\n\n  $$\n  - nested"]) {
      expect(readsOf(markdown), JSON.stringify(markdown)).toBe(2);
    }
  });

  test("twice for a run of fences that each keep the next one from being tried", () => {
    const markdown = `${"$\n> # \\\n".repeat(8)}$\n- item`;
    expect(readsOf(markdown)).toBe(2);
    expect(blocks(parse(editor, markdown))).toMatch(/, list 18-18 \(listItem 18-18 \(paragraph 18-18\)\)\)$/);
  });
});
