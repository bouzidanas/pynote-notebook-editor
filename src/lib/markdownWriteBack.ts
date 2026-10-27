import { editorViewCtx, parserCtx, remarkCtx, serializerCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { Fragment, type Node } from "@milkdown/kit/prose/model";
import type { MdNode } from "./mathSyntax";

// The Markdown a markdown cell gets back from its editor. Milkdown never
// writes a source back byte for byte (it escapes underscores and stars,
// spaces out tight lists, rewrites bullets, setext headings and table
// padding, adds a final newline), so the cell gets back its own text for
// every top-level block an edit did not touch, and Milkdown's Markdown only
// for the blocks that changed, where math is still written as it was
// (mathSyntax.ts). A document changed back to how it opened gives back the
// original text.

export interface OpenedText {
  /** The cell's text when editing began. */
  text: string;
  /** The document the editor made of it. */
  doc: Node;
  /** Where each of the document's top-level blocks is in `text`, if known. */
  ranges: Array<[number, number]> | null;
  /** Markdown to a document, as the editor's parser reads it. */
  parse(markdown: string): Node;
  /** A document to Markdown, as Milkdown writes it. */
  serialize(doc: Node): string;
}

/** The cell's Markdown for each state of the document. */
export function writeBack(opened: OpenedText): (doc: Node) => string {
  let parsed: Node[] | undefined; // the opened text, parsed afresh
  return (doc) => {
    if (doc.eq(opened.doc)) return opened.text;
    if (!opened.ranges) return opened.serialize(doc);
    parsed ??= children(opened.parse(opened.text));
    return keepUntouched(opened, opened.ranges, parsed, doc) ?? opened.serialize(doc);
  };
}

const children = (node: Node) => {
  const all: Node[] = [];
  node.forEach((child) => all.push(child));
  return all;
};

// The opened text with only the changed blocks rewritten, or null when the
// result would not read as the document does.
function keepUntouched(
  { text, doc: opened, parse: parseAny, serialize }: OpenedText,
  ranges: Array<[number, number]>,
  parsed: Node[],
  doc: Node,
): string | null {
  // A cell whose every block changed is all new text, read once.
  let last: { markdown: string; read: Node } | undefined;
  const parse = (markdown: string) => {
    if (last?.markdown !== markdown) last = { markdown, read: parseAny(markdown) };
    return last.read;
  };
  const before = children(opened);
  const after = children(doc);
  const n = before.length;
  if (parsed.length !== n) return null;
  // The text between blocks (and before the first and after the last), which
  // may hold more than blank lines (link definitions).
  const gap = (i: number) => text.slice(i === 0 ? 0 : ranges[i - 1][1], i === n ? text.length : ranges[i][0]);

  // Between kept blocks, the opened text where nothing changed, Milkdown's
  // Markdown for blocks that were added or rewritten.
  const kept = [[-1, -1], ...keptBlocks(before, after), [n, after.length]];
  const expected: Node[] = [];
  const readOnItsOwn = inContext(doc, parse, serialize);
  let out = "";
  for (let k = 0; k + 1 < kept.length; k++) {
    const [i, j] = kept[k];
    const [nextI, nextJ] = kept[k + 1];
    if (i >= 0) {
      out += text.slice(ranges[i][0], ranges[i][1]);
      expected.push(parsed[i]);
    }
    const added = after.slice(j + 1, nextJ);
    const middle = added.length ? serialize(doc.copy(Fragment.fromArray(added))).replace(/\n+$/, "") : "";
    if (middle) expected.push(...readOnItsOwn(middle, added));
    const removed = nextI > i + 1;
    if (!removed && !middle) out += gap(i + 1);
    else if (!removed) out += i < 0 ? `${gap(0)}${middle}\n\n` : `\n\n${middle}${gap(i + 1)}`;
    else if (middle) out += gap(i + 1) + middle + gap(nextI);
    else out += joinGaps(gap(i + 1), gap(nextI), i < 0, nextI === n);
  }

  // Each part must read as it did on its own: a kept block must not read
  // differently next to the new text (two lists becoming one, a paragraph
  // running on into the next). Fresh parses are compared, as the editor's
  // plugins add to what it parsed (heading ids).
  const actual = children(parse(out));
  return actual.length === expected.length && actual.every((block, i) => block.eq(expected[i])) ? out : null;
}

// The blocks that Markdown written for some of `doc`'s blocks reads as on
// its own, with `doc`'s footnote definitions in scope: a footnote reference
// is one only where its definition is in the same document, which for an
// edited paragraph is usually a block the edit did not touch.
function inContext(doc: Node, parse: (markdown: string) => Node, serialize: (doc: Node) => string) {
  const notes: Node[] = [];
  doc.descendants((node) => {
    if (node.type.name === "footnote_definition") notes.push(node);
    return !node.isTextblock;
  });
  let definitions: string | undefined;
  return (markdown: string, blocks: Node[]): Node[] => {
    const refers = blocks.some((block) => {
      let found = false;
      block.descendants((node) => {
        found ||= node.type.name === "footnote_reference";
        return !found;
      });
      return found;
    });
    if (!refers || notes.length === 0) return children(parse(markdown));
    // After a blank line each definition is a block of its own.
    definitions ??= serialize(doc.copy(Fragment.fromArray(notes))).replace(/\n+$/, "");
    const read = children(parse(`${markdown}\n\n${definitions}`));
    const own = read.slice(0, read.length - notes.length);
    return read.slice(own.length).every((block) => block.type.name === "footnote_definition") ? own : children(parse(markdown));
  };
}

// The blocks of `before` still in `after`, as [index in before, index in
// after] pairs: the longest run of them in order. The blocks before and
// after the edit are kept as they are, so the run is only searched for in
// between (an edit usually changes a block or two of a long cell).
function keptBlocks(before: Node[], after: Node[]): Array<[number, number]> {
  const same = (i: number, j: number) => before[i] === after[j] || before[i].eq(after[j]);
  let head = 0;
  while (head < before.length && head < after.length && same(head, head)) head++;
  let tail = 0;
  while (head + tail < before.length && head + tail < after.length && same(before.length - 1 - tail, after.length - 1 - tail)) tail++;
  const endBefore = before.length - tail;
  const endAfter = after.length - tail;
  const longest = Array.from({ length: endBefore - head + 1 }, () => new Array<number>(endAfter - head + 1).fill(0));
  for (let i = endBefore - 1; i >= head; i--) {
    for (let j = endAfter - 1; j >= head; j--) {
      const [a, b] = [i - head, j - head];
      longest[a][b] = same(i, j) ? longest[a + 1][b + 1] + 1 : Math.max(longest[a + 1][b], longest[a][b + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < head; i++) pairs.push([i, i]);
  for (let i = head, j = head; i < endBefore && j < endAfter; ) {
    if (same(i, j)) pairs.push([i++, j++]);
    else if (longest[i - head + 1][j - head] >= longest[i - head][j - head + 1]) i++;
    else j++;
  }
  for (let k = tail; k > 0; k--) pairs.push([before.length - k, after.length - k]);
  return pairs;
}

// The text left where blocks were deleted, between the gaps around them:
// what they hold, a blank line apart.
function joinGaps(before: string, after: string, first: boolean, last: boolean): string {
  if (first) return before + after.trimStart();
  if (last) return before.trimEnd() + after;
  return `${before.trimEnd()}\n\n${after.trimStart()}`;
}

/**
 * Where each top-level block of `doc` (the document the editor made of
 * `text`) is in `text`, or null when that is not clear.
 */
export function blockRanges(remark: { parse(text: string): unknown }, text: string, doc: Node): Array<[number, number]> | null {
  // Link definitions are folded into the links that use them.
  const blocks = ((remark.parse(text) as MdNode).children ?? []).filter((node) => node.type !== "definition");
  if (blocks.length !== doc.childCount) return null;
  const ranges: Array<[number, number]> = [];
  for (const block of blocks) {
    const start = block.position?.start.offset;
    const end = block.position?.end.offset;
    if (start === undefined || end === undefined || start > end || start < (ranges.at(-1)?.[1] ?? 0)) return null;
    ranges.push([start, end]);
  }
  return ranges;
}

/** writeBack for the editor in `ctx`, which was just given `text`. */
export const cellWriteBack = (text: string) => (ctx: Ctx) => {
  const doc = ctx.get(editorViewCtx).state.doc;
  return writeBack({
    text,
    doc,
    ranges: blockRanges(ctx.get(remarkCtx), text, doc),
    parse: ctx.get(parserCtx),
    serialize: ctx.get(serializerCtx),
  });
};
