// The markdown cell editor stays fast on long lines of math. It once read
// ahead from every "$" to the end of its line, and read a paragraph again
// for what emphasis around math settled, so opening a cell with a 20 KB line
// of math, or writing an edit of it back, took seconds; each now takes time
// about linear in the text, aside from Milkdown's own work on the text and
// marked's on runs of emphasis that close nothing (UNCLOSED). The bounds
// are generous, and each timing is the fastest of a few runs: a
// regression costs orders of magnitude, a busy machine a few times, and only
// for some of the runs.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { markdownSyntax } from "../lib/markdownSyntax";
import { cellWriteBack } from "../lib/markdownWriteBack";

const editors: Editor[] = [];

afterEach(async () => {
  await Promise.all(editors.splice(0).map((editor) => editor.destroy()));
  document.body.innerHTML = "";
});

/** A markdown cell's editor opened on `markdown`, as MarkdownEditor opens it. */
async function open(markdown: string) {
  const root = document.createElement("div");
  document.body.append(root);
  const editor = await markdownSyntax(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    }),
  ).create();
  editors.push(editor);
  const view: EditorView = editor.action((ctx) => ctx.get(editorViewCtx));
  const toMarkdown = editor.action(cellWriteBack(markdown));
  return { view, text: () => toMarkdown(view.state.doc) };
}

/** The fastest of `runs` runs of `run`, in milliseconds, and what the last one gave. */
async function fastest<T>(runs: number, run: () => T | Promise<T>): Promise<[number, T]> {
  let best = Infinity;
  let result: T | undefined;
  for (let k = 0; k < runs; k++) {
    const start = performance.now();
    result = await run();
    best = Math.min(best, performance.now() - start);
  }
  return [best, result as T];
}

// Lines that were slow to read.
const LINES: Array<[string, string]> = [
  ["emphasized math holding its delimiters", "**see $a*b*c$ more** and "],
  ["bold math holding a star", "**$a*b$** and "],
  ["inline math", "see $x_1$ and "],
  ["dollar amounts", "costs $5 and $10, "],
  // The renderer itself matches its rule at every "$" each time it reads on
  // (here after every escape), which takes it seconds.
  ["dollar amounts between escapes", "a\\* $5 "],
];

// Lines of math between runs of "*", "_" or "~" that close nothing. marked
// itself reads on from each such run to the end of the text, so reading the
// line takes it time quadratic in its length, which MarkdownCell pays as well
// to render the line; the editor asks marked where math is in such a line
// once. It once took seconds at 10 KB.
const UNCLOSED: Array<[string, string]> = [
  ["math after stars that close nothing", "*a $x$ "],
  ["math after underscores that close nothing", "_a $x$ "],
  ["math after tildes that close nothing", "~a $x$ "],
];

// Opens a cell on `unit` repeated to `size` characters, types at its end and
// times both: the fastest of 2 opens and of 3 edits written back. Checks
// what the cell gets back after the edits, with `unescaped` the escapes
// Milkdown writes in the line taken out.
async function timed(unit: string, size: number, unescaped = (text: string) => text) {
  const markdown = unit.repeat(Math.ceil(size / unit.length)).trimEnd();
  const [opening, cell] = await fastest(2, () => open(markdown));
  const { view } = cell;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 1)));
  let typed = "";
  const [writing, text] = await fastest(3, () => {
    view.dispatch(view.state.tr.insertText(" Q"));
    typed += " Q";
    return cell.text();
  });
  expect(unescaped(text)).toBe(markdown + typed);
  return { opening, writing };
}

describe("the editor on a long line of math", () => {
  // The first editor also loads and compiles the code every editor runs.
  beforeAll(async () => {
    const cell = await open("Warm up with $x$ and **$a*b$**.");
    cell.view.dispatch(cell.view.state.tr.insertText(" Q", cell.view.state.doc.content.size - 1));
    cell.text();
  });

  it.each(LINES)("%s, 20 KB: opens in well under two seconds, and writes an edit back in well under one", async (_name, unit) => {
    const { opening, writing } = await timed(unit, 20_000);
    expect(opening).toBeLessThan(2000);
    expect(writing).toBeLessThan(1000);
  }, 120_000);

  it.each(UNCLOSED)("%s, 10 KB: opens in well under two seconds, and writes an edit back in well under one", async (_name, unit) => {
    // Milkdown writes a "*", "_" or "~" that closes nothing escaped.
    const { opening, writing } = await timed(unit, 10_000, (text) => text.replace(/\\([*_~])/g, "$1"));
    expect(opening).toBeLessThan(2000);
    expect(writing).toBeLessThan(1000);
  }, 120_000);
});

// Quotes or list items nested in one another, each starting with a line of
// "$$" that no closing fence follows. Each read of the document finds where
// block math fails one level deeper (mathSyntax.ts), so reading all of them
// took seconds at 20 KB; the reads are capped.
const NESTED: Array<[string, (level: number) => string]> = [
  ["quotes", (level) => `${"> ".repeat(level)}$$`],
  ["list items", (level) => `${"  ".repeat(level)}- $$\n${"  ".repeat(level + 1)}x`],
];

describe("the editor on fences of block math nested in quotes or list items", () => {
  it.each(NESTED)("%s, 20 KB: opens in well under two seconds", async (_name, line) => {
    const lines: string[] = [];
    for (let level = 0; lines.join("\n").length < 20_000; level++) lines.push(line(level));
    const [opening] = await fastest(2, () => open(lines.join("\n")));
    expect(opening).toBeLessThan(2000);
  }, 120_000);
});
