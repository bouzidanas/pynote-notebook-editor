/**
 * Math Plugin for Milkdown
 *
 * Math in a markdown cell's editor, recognized exactly where the renderer
 * finds it (src/lib/markdown-math.ts) and kept as written. The editor shows
 * math as its source, tinted, so what the cell will render as math is what is
 * tinted, and typing math works as it reads:
 *
 * - `math_inline` marks inline and display math ($...$, $$...$$) in text. As
 *   the cell opens, it is where the parser found it, which is where the
 *   renderer finds it in the cell's text. It follows the text: after every
 *   change the math is found again in the paragraphs that changed, so typing
 *   or deleting a "$" moves it, as in the renderer.
 * - `math_block` holds block math ($$ on lines of their own), fences included.
 *   Enter after "$$" alone in a paragraph starts one.
 *
 * Both are written back to Markdown untouched (src/lib/mathSyntax.ts reads and
 * writes the Markdown). While math is being typed, Markdown shortcuts that
 * would turn part of it into emphasis or code (`^* b^*`) stay out of the way.
 */

import {
  inputRulesCtx,
  remarkCtx,
  remarkStringifyOptionsCtx,
  schemaCtx,
  SerializerReady,
  serializerCtx,
} from "@milkdown/kit/core";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { hardbreakSchema, imageSchema } from "@milkdown/kit/preset/commonmark";
import { Fragment, Mark, type MarkType, type Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { Transform } from "@milkdown/kit/prose/transform";
import { SerializerState, type RemarkPluginRaw, type Root } from "@milkdown/kit/transformer";
import { $markSchema, $nodeSchema, $prose, $remark } from "@milkdown/kit/utils";
import { opensInlineMath } from "./markdown-math";
import { scanMath, type MathScan } from "./mathScan";
import { mathHandlers, remarkMath, type MdNode } from "./mathSyntax";

// ─── Finding math in a paragraph ────────────────────────────────────────────

// Marks the renderer reads as a run of inline text of their own: math may
// open at their start and close at their end.
const RUN_MARKS = new Set(["emphasis", "strong", "strike_through", "link"]);

// A textblock's text as the renderer reads the Markdown it is written as:
// inline code as code, a line break as a line ending (after its "\" when it
// is written so), an image by its "!", inline HTML and a caption's tags by
// their "<" and ">".
interface Paragraph {
  text: string;
  pos: number[]; // document position of each character, -1 if it stands for something else
  code: boolean[];
  runStart: number[]; // the run each character is in: where the innermost
  runEnd: number[]; // run mark around it starts and ends (the paragraph without one)
  // How many times, before each character (and at the end), text that is not
  // math meets text with other formatting (see findMath).
  changes: number[];
}

function readParagraph(block: Node, start: number): Paragraph {
  let text = "";
  const pos: number[] = [];
  const code: boolean[] = [];
  const marks: Array<readonly Mark[]> = [];
  const changes = [0];
  const caption = (node: Node | null) => !!node?.marks.some((mark) => mark.type.name === "caption");
  let last: { formatting: readonly Mark[]; math: boolean } | undefined; // the text before
  block.forEach((child, offset, index) => {
    if (child.isText) {
      const math = child.marks.some((mark) => mark.type.name === "math_inline");
      const formatting = child.marks.filter((mark) => mark.type.name !== "math_inline");
      if (last && !(last.math && math) && !Mark.sameSet(last.formatting, formatting)) changes[changes.length - 1]++;
      last = { formatting, math };
    }
    const runs = child.marks.filter((mark) => RUN_MARKS.has(mark.type.name));
    const push = (char: string, at: number, isCode: boolean) => {
      text += char;
      pos.push(at);
      code.push(isCode);
      marks.push(runs);
      changes.push(changes[changes.length - 1]);
    };
    if (caption(child) && !caption(index > 0 ? block.child(index - 1) : null)) push(">", -1, false);
    if (child.isText) {
      const isCode = child.marks.some((mark) => mark.type.spec.code);
      if (isCode) push("`", -1, true);
      for (let i = 0; i < child.text!.length; i++) push(child.text![i], start + offset + i, isCode);
      if (isCode) push("`", -1, true);
    } else {
      const name = child.type.name;
      if (name === "hardbreak" && child.attrs.escaped) push("\\", -1, false);
      push(name === "hardbreak" ? "\n" : name === "image" ? "!" : name === "html" ? "<" : "\uFFFC", -1, false);
    }
    if (caption(child) && !caption(index + 1 < block.childCount ? block.child(index + 1) : null)) push("<", -1, false);
  });

  const runStart = new Array<number>(text.length).fill(0);
  const runEnd = new Array<number>(text.length).fill(text.length);
  const open: Array<[Mark, number]> = [];
  const close = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      runStart[i] = Math.max(runStart[i], from);
      runEnd[i] = Math.min(runEnd[i], to);
    }
  };
  for (let i = 0; i <= text.length; i++) {
    const here = marks[i] ?? [];
    for (let k = open.length - 1; k >= 0; k--) {
      if (!open[k][0].isInSet(here)) close(open.splice(k, 1)[0][1], i);
    }
    for (const mark of here) if (!open.some(([m]) => m.eq(mark))) open.push([mark, i]);
  }
  return { text, pos, code, runStart, runEnd, changes };
}

// Whether characters `j` and `j + 1` are written next to each other: no mark
// starts or ends between them (its delimiters would be written there).
const joined = ({ runStart, runEnd }: Paragraph, j: number) => j + 1 < runEnd[j] && runStart[j + 1] <= j;

// Whether the character after `j` is written right after it, as `joined`,
// or is whitespace that starts a mark (Milkdown writes it before the mark).
const followedBy = (paragraph: Paragraph, j: number) =>
  joined(paragraph, j) || (j + 1 < paragraph.runEnd[j] && /\s/.test(paragraph.text[j + 1]));

// Whether math may open at character `i`: display math at any "$$", inline
// math at a "$" that starts a run or follows whitespace (a "$" escaped by a
// backslash opens nothing).
function opensAt(paragraph: Paragraph, i: number): "inline" | "display" | null {
  const { text, pos, code, runStart } = paragraph;
  if (text[i] !== "$" || code[i]) return null;
  let slashes = 0;
  while (i - slashes > 0 && text[i - slashes - 1] === "\\" && pos[i - slashes - 1] !== -1) slashes++;
  if (slashes % 2 === 1) return null;
  if (text[i + 1] === "$" && joined(paragraph, i) && !code[i + 1]) return "display";
  return i === runStart[i] || opensInlineMath(text[i - 1]) ? "inline" : null;
}

// The math in a paragraph, as [first, last] character indices. Text that is
// not math yet does not become math across a change of formatting: taking
// it would drop the formatting from the text for good, delimiters and all,
// where the math may hold only for a keystroke (with "Z" typed before
// "$ x $ is **a** $ y $", the rules find math from its second "$" across
// the bold), or only to the rules (micromark reads `**$*b*c$**` as strong
// emphasis, which the renderer does not, and in it the rules find `$bc$`
// across the emphasis on "b"). The parser takes no math across formatting
// (mathSyntax.ts).
function findMath(paragraph: Paragraph): Array<[number, number]> {
  const { text, runStart, runEnd, changes } = paragraph;
  const found: Array<[number, number]> = [];
  // The rules matched on the text of each run (mathScan.ts), by where the
  // run starts and ends.
  const scans = new Map<number, MathScan>();
  for (let i = 0; i < text.length; i++) {
    const opens = opensAt(paragraph, i);
    if (!opens) continue;
    const from = runStart[i];
    const end = runEnd[i];
    const key = from * (text.length + 1) + end;
    let scan = scans.get(key);
    if (!scan) scans.set(key, (scan = scanMath(text.slice(from, end))));
    const length = opens === "display" ? scan.display(i - from) : scan.inline(i - from);
    if (!length) continue;
    // The rules read the "$$" of each end, and what follows inline math in
    // its run, as they are written: with no mark's delimiters among them.
    // Where the run ends, the closing "$" must be in that run itself: one
    // inside a mark that ends there is followed by the mark's delimiters.
    const last = i + length - 1;
    const fence = opens === "display" || text[i + 1] === "$" ? 2 : 1;
    if (fence === 2 && !(joined(paragraph, i) && joined(paragraph, last - 1))) continue;
    if (opens === "inline" && (last + 1 < end ? !followedBy(paragraph, last) : runStart[last] > i)) continue;
    if (changes[last] > changes[i]) continue;
    found.push([i, last]);
    i = last;
  }
  return found;
}

/**
 * The math in a textblock starting at `start`, as the editor finds it after
 * an edit (as the cell opens, its math is the parser's), as document ranges
 * from its opening "$" to its closing one.
 */
export function mathRanges(block: Node, start: number): Array<[number, number]> {
  const paragraph = readParagraph(block, start);
  return findMath(paragraph).map(([first, last]) => [paragraph.pos[first], paragraph.pos[last] + 1]);
}

// ─── Keeping the marks in step with the text ────────────────────────────────

const textblocks = (doc: Node, each: (block: Node, start: number) => void) =>
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (!node.type.spec.code) each(node, pos + 1);
    return false;
  });

/**
 * Brings `math_inline` in line with the text of the textblocks `changed`
 * picks (all of them by default): it covers exactly the math the renderer
 * would find. Formatting put on math is dropped from it, as math holds none
 * (written out, its delimiters would become part of the math); formatting
 * around the opening "$" bounds the math, as it does for the renderer.
 */
export function normalizeMath(tr: Transform, changed: (block: Node) => boolean = () => true): void {
  const math = tr.doc.type.schema.marks.math_inline as MarkType;
  const each = (visit: (block: Node, start: number) => void) =>
    textblocks(tr.doc, (block, start) => {
      if (changed(block)) visit(block, start);
    });
  // Dropping inline code can move math; a few rounds settle it.
  for (let round = 0; round < 3; round++) {
    const removals: Array<[number, number, Mark]> = [];
    each((block, start) => {
      const children: Array<[number, Node]> = [];
      block.forEach((child, offset) => {
        children.push([start + offset, child]);
      });
      let first = 0; // the first child that does not end before the math
      for (const [from, to] of mathRanges(block, start)) {
        while (first < children.length && children[first][0] + children[first][1].nodeSize <= from) first++;
        const texts: Array<[number, Node]> = [];
        for (let k = first; k < children.length && children[k][0] < to; k++) {
          if (children[k][1].isText) texts.push(children[k]);
        }
        const shared = texts.reduce<readonly Mark[]>((all, [, node]) => all.filter((mark) => mark.isInSet(node.marks)), texts[0][1].marks);
        for (const [pos, node] of texts) {
          for (const mark of node.marks) {
            if (mark.type !== math && !mark.isInSet(shared)) removals.push([Math.max(pos, from), Math.min(pos + node.nodeSize, to), mark]);
          }
        }
      }
    });
    if (removals.length === 0) break;
    for (const [from, to, mark] of removals) tr.removeMark(from, to, mark);
  }

  each((block, start) => {
    const ranges = mathRanges(block, start);
    let first = 0; // the first range that does not end before the child
    block.forEach((child, offset) => {
      const from = start + offset;
      const to = from + child.nodeSize;
      while (first < ranges.length && ranges[first][1] <= from) first++;
      const has = math.isInSet(child.marks);
      if (!child.isText || child.marks.some((mark) => mark.type.spec.code)) {
        if (has) tr.removeMark(from, to, math);
        return;
      }
      let at = from;
      for (let k = first; k < ranges.length && ranges[k][0] < to; k++) {
        const lo = Math.max(ranges[k][0], from);
        const hi = Math.min(ranges[k][1], to);
        if (has && lo > at) tr.removeMark(at, lo, math);
        if (!has) tr.addMark(lo, hi, math.create());
        at = hi;
      }
      if (has && at < to) tr.removeMark(at, to, math);
    });
  });
}

// ─── Schema ─────────────────────────────────────────────────────────────────

const MATH_CLASS = "text-accent";

export const mathInlineSchema = $markSchema("math_inline", () => ({
  inclusive: false,
  // Opened last when written out, so it sits inside the other marks. (Inline
  // code never holds math: normalizeMath takes it off code.)
  priority: 100,
  parseDOM: [{ tag: "span[data-math]" }],
  toDOM: () => ["span", { "data-math": "", class: MATH_CLASS }, 0],
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, markType) => {
      // Lines are joined by soft line breaks, as in the rest of the text.
      (node.value as string).split(/\r?\n|\r/).forEach((line, i) => {
        if (i > 0) state.addNode(state.schema.nodes.hardbreak, { isInline: true });
        if (!line) return;
        state.openMark(markType);
        state.addText(line);
        state.closeMark(markType);
      });
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "math_inline",
    runner: (state, _mark, node) => {
      state.addNode("inlineMath", undefined, node.text ?? "");
      return true;
    },
  },
}));

export const mathBlockSchema = $nodeSchema("math_block", () => ({
  content: "text*",
  group: "block",
  marks: "",
  code: true,
  defining: true,
  // Shown as its source, tinted like inline math: a plain block, not a <pre>,
  // which the editor draws as a boxed block of code.
  parseDOM: [
    { tag: "div[data-math]", preserveWhitespace: "full", priority: 60 },
    { tag: "pre[data-math]", preserveWhitespace: "full", priority: 60 },
  ],
  toDOM: () => ["div", { "data-math": "", class: MATH_CLASS }, 0],
  parseMarkdown: {
    match: (node) => node.type === "blockMath",
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.value) state.addText(node.value as string);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_block",
    runner: (state, node) => {
      state.addNode("blockMath", undefined, node.textContent);
    },
  },
}));

// ─── Remark, serializing, and the initial document ──────────────────────────

/**
 * The remark side. It goes before the commonmark preset: its check reads
 * source positions, which commonmark's line break plugin does not keep.
 */
export const mathRemark = $remark("remarkPynoteMath", () => remarkMath as unknown as RemarkPluginRaw<unknown>);

// Milkdown writes out each text node with its marks on its own and joins
// equal neighbours back, after moving the spaces at a node's edges out of
// its marks. Under two or more marks it loses track of those spaces, and the
// spaces then keep the marks from joining, so math as a mark of its own (a
// text node of its own) broke the text around it: "***see $x$ here***" came
// back as "***see** **$x$****here*** ". So the document is written with its
// math as text, between two `marker` characters, in the text around it;
// mathHandlers writes it from there as it is.
function mathAsText(node: Node, math: MarkType, marker: string): Node {
  if (node.isLeaf) return node;
  let changed = false;
  const content: Node[] = [];
  node.forEach((child) => {
    let next = child;
    if (!child.isText) next = mathAsText(child, math, marker);
    else if (math.isInSet(child.marks)) next = child.type.schema.text(marker + child.text + marker, math.removeFromSet(child.marks));
    changed ||= next !== child;
    content.push(next);
  });
  // fromArray joins the text that now has the same marks.
  return changed ? node.copy(Fragment.fromArray(content)) : node;
}

// `count` private use characters that are not in `doc` (its text, nor its
// nodes' attributes, which hold an image's description).
function unusedCharacters(doc: Node, count: number): string[] {
  let used = doc.textContent;
  doc.descendants((node) => {
    if (!node.isText) used += JSON.stringify(node.attrs);
  });
  const found: string[] = [];
  for (let code = 0xe000; found.length < count; code++) {
    if (!used.includes(String.fromCharCode(code))) found.push(String.fromCharCode(code));
  }
  return found;
}

// A list item starts with a paragraph in the editor, so one that starts with
// block math ("- $$" on its first line) gets an empty paragraph in front of
// it, which Milkdown writes as "<br />". It is left out.
function dropFillerParagraphs(node: MdNode): void {
  const children = node.children;
  if (!children) return;
  children.forEach(dropFillerParagraphs);
  const [first, second] = children;
  const empty = (paragraph: MdNode) =>
    paragraph.type === "paragraph" && (paragraph.children ?? []).every((child) => child.type === "html" && /^<br\s*\/?>$/i.test(child.value!.trim()));
  if (node.type === "listItem" && second?.type === "blockMath" && empty(first)) children.shift();
}

const mathSetup: MilkdownPlugin = (ctx) => {
  // Hard breaks remember whether they were written as a "\" (see
  // markEscapedBreaks in mathSyntax.ts) and are written back so.
  ctx.update(hardbreakSchema.key, (prev) => (ctx) => {
    const spec = prev(ctx);
    return {
      ...spec,
      attrs: { ...spec.attrs, escaped: { default: false, validate: "boolean" } },
      parseMarkdown: {
        match: spec.parseMarkdown.match,
        runner: (state, node, type) => {
          const data = node.data as { isInline?: boolean; escaped?: boolean } | undefined;
          state.addNode(type, { isInline: Boolean(data?.isInline), escaped: Boolean(data?.escaped) });
        },
      },
      toMarkdown: {
        match: spec.toMarkdown.match,
        runner: (state, node) => {
          if (node.attrs.isInline) state.addNode("text", undefined, "\n");
          else state.addNode("break", undefined, undefined, node.attrs.escaped ? { data: { escaped: true } } : undefined);
        },
      },
    };
  });
  // The character around inline math while a document is written.
  let marker = "";
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: { ...options.handlers, ...mathHandlers(options.handlers!.text as Parameters<typeof mathHandlers>[0], () => marker) },
  }));
  // An image is written with its description as it was read (mathSyntax.ts
  // keeps it), while that is still its description: Milkdown writes it as
  // plain text, which drops its code spans and emphasis and escapes it
  // anew, and that can change where the renderer finds math in it
  // ("$x$$`a$`$" holds none, "$x$$a$$" does). One with a "[" or "|" that
  // no backslash escapes is not: what a "[" starts (a link, a reference, a
  // footnote) reads as it does only with the definitions of the cell, and
  // a "|" would end a table cell the image is moved into.
  // While a document is written, the description is as many `label`
  // characters as it is long (a table lines its cells up by their length),
  // and `labels` has the descriptions, in order.
  let label = "";
  const labels: string[] = [];
  ctx.update(imageSchema.key, (prev) => (ctx) => {
    const spec = prev(ctx);
    return {
      ...spec,
      attrs: { ...spec.attrs, label: { default: null } },
      toDOM: (node) => {
        const [tag, { label: _, ...attrs }] = spec.toDOM!(node) as [string, Record<string, unknown>];
        return [tag, attrs];
      },
      parseMarkdown: {
        match: spec.parseMarkdown.match,
        runner: (state, node, type) => {
          const source = (node.data as { label?: string } | undefined)?.label;
          state.addNode(type, { src: node.url, alt: node.alt, title: node.title, label: source === undefined ? null : { source, alt: node.alt } });
        },
      },
      toMarkdown: {
        match: spec.toMarkdown.match,
        runner: (state, node) => {
          const read = node.attrs.label as { source: string; alt: string } | null;
          const asRead = label !== "" && read !== null && read.alt === node.attrs.alt && !/(?:^|[^\\])(?:\\\\)*[[|]/.test(read.source);
          if (asRead) labels.push(read.source);
          const alt = asRead ? label.repeat(read.source.length) : node.attrs.alt;
          state.addNode("image", undefined, undefined, { title: node.attrs.title, url: node.attrs.src, alt });
        },
      },
    };
  });
  return async () => {
    await ctx.wait(SerializerReady);
    const schema = ctx.get(schemaCtx);
    const remark = ctx.get(remarkCtx);
    // Milkdown's serializer (SerializerState.create), with math as text.
    ctx.set(serializerCtx, (doc) => {
      [marker, label] = unusedCharacters(doc, 2);
      try {
        const state = new SerializerState(schema);
        state.run(mathAsText(doc, schema.marks.math_inline, marker));
        const tree = state.build();
        dropFillerParagraphs(tree);
        const markdown = remark.stringify(tree as Root);
        let next = 0;
        return labels.length === 0 ? markdown : markdown.replace(new RegExp(`${label}+`, "g"), () => labels[next++]);
      } finally {
        marker = "";
        label = "";
        labels.length = 0;
      }
    });
  };
};

// ─── Editing ────────────────────────────────────────────────────────────────

// Whether the character at `pos` is inside math, or after a "$" on its line
// that may open math and has not closed yet.
function inMath(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  const paragraph = readParagraph($pos.parent, $pos.start());
  const index = paragraph.pos.indexOf(pos);
  if (index === -1) return false;
  let from = paragraph.text.lastIndexOf("\n", index) + 1;
  for (const [first, last] of findMath(paragraph)) {
    if (first <= index && index <= last) return true;
    if (last < index) from = Math.max(from, last + 1);
  }
  for (let i = from; i < index; i++) if (opensAt(paragraph, i)) return true;
  return false;
}

// After a math block, as after a code block (codeBlockNavigationPlugin):
// Right and Down at its end leave it, adding a paragraph when it is the last
// block, and Backspace in an empty paragraph after it goes back into it.
function leaveMathBlock(state: EditorState, dispatch: (tr: Transaction) => void): boolean {
  const { $head, empty } = state.selection;
  if (!empty || $head.parent.type.name !== "math_block" || $head.pos !== $head.end()) return false;
  const after = $head.after();
  const tr = state.tr;
  if (after >= tr.doc.content.size || !tr.doc.resolve(after).nodeAfter) tr.insert(after, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(Selection.near(tr.doc.resolve(after + 1))).scrollIntoView());
  return true;
}

function backIntoMathBlock(state: EditorState, dispatch: (tr: Transaction) => void): boolean {
  const { $head, empty } = state.selection;
  if (!empty || $head.parent.type.name !== "paragraph" || $head.parent.content.size !== 0) return false;
  const index = $head.index($head.depth - 1);
  if (index === 0 || $head.node($head.depth - 1).child(index - 1).type.name !== "math_block") return false;
  const before = $head.before();
  const tr = state.tr.delete(before, $head.after());
  dispatch(tr.setSelection(Selection.near(tr.doc.resolve(before - 1), -1)).scrollIntoView());
  return true;
}

// "$$" alone in a paragraph, then Enter: the paragraph becomes a block of
// math, its fences around an empty line for the formula with the cursor on
// it, as "```" starts a block of code. A list item's first paragraph has to
// stay, so there the block goes after it, left empty (as when a list item
// that starts with block math is read; it is written as nothing, see
// dropFillerParagraphs). A task item cannot start with block math (its
// checkbox is written only before a paragraph), so there Enter is left as is.
function startMathBlock(state: EditorState, dispatch: (tr: Transaction) => void): boolean {
  const { $head, empty } = state.selection;
  const paragraph = $head.parent;
  const text = paragraph.childCount === 1 ? paragraph.firstChild : null;
  if (!empty || paragraph.type.name !== "paragraph" || $head.parentOffset !== paragraph.content.size) return false;
  if (!text?.isText || text.text !== "$$" || text.marks.length > 0) return false;
  const type = state.schema.nodes.math_block;
  const block = type.create(null, state.schema.text("$$\n\n$$"));
  const parent = $head.node(-1);
  const index = $head.index(-1);
  const tr = state.tr;
  let start: number;
  if (parent.canReplaceWith(index, index + 1, type)) {
    start = $head.before();
    tr.replaceWith(start, $head.after(), block);
  } else if (parent.attrs.checked == null && parent.canReplaceWith(index + 1, index + 1, type)) {
    tr.delete($head.start(), $head.end());
    start = tr.mapping.map($head.after());
    tr.insert(start, block);
  } else return false;
  dispatch(tr.setSelection(TextSelection.create(tr.doc, start + 1 + "$$\n".length)).scrollIntoView());
  return true;
}

export const mathEditing = $prose((ctx) => new Plugin({
  key: new PluginKey("pynoteMath"),
  appendTransaction: (transactions, oldState, state) => {
    if (!transactions.some((tr) => tr.docChanged)) return null;
    // The textblocks the transactions left as they were still have their
    // math marked, but in a table that changed: the cell writes it with as
    // many cells in each row as its longest row has, so a cell the renderer
    // left out of the table as written (mathSyntax.ts) is read then.
    const kept = new Set<Node>();
    const tables = new Set<Node>();
    oldState.doc.descendants((node) => {
      if (node.type.name === "table") tables.add(node);
      if (node.isTextblock) kept.add(node);
      return !node.isTextblock;
    });
    state.doc.descendants((node) => {
      if (node.type.name !== "table" || tables.has(node)) return !node.isTextblock;
      node.descendants((cell) => {
        kept.delete(cell);
        return !cell.isTextblock;
      });
      return false;
    });
    const tr = state.tr;
    normalizeMath(tr, (block) => !kept.has(block));
    if (!tr.docChanged) return null;
    // Steps clear the marks set for what is typed next (an input rule ends
    // emphasis that way).
    if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
    return tr;
  },
  props: {
    // Before the input rules (they come after every plugin): text an input
    // rule would rewrite from inside math (`^* b^*` as emphasis), or around
    // math still being typed (`_$x_` while typing `_$x_1$_`), is typed as
    // is. The rules match the text before the cursor as their plugin does,
    // which applies a rule as if its match ended at the cursor: a match that
    // ends before it (Milkdown's strikethrough rule is not anchored, and
    // finds "~1~" in "$a = ~1~$") would rewrite the wrong text.
    handleTextInput(view, from, to, text) {
      const { state } = view;
      const $from = state.doc.resolve(from);
      if (view.composing || $from.parent.type.spec.code) return false;
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 500), $from.parentOffset, undefined, "\uFFFC") + text;
      const asTyped = ctx.get(inputRulesCtx).some((rule) => {
        // As Milkdown's input rule plugin reads them (`match` is internal).
        const match = (rule as unknown as { match: RegExp }).match.exec(before);
        if (!match) return false;
        if (match.index + match[0].length < before.length) return true;
        const dollars = match[0].match(/(?:^|[^\\])(?:\\\\)*\${1,2}/g)?.length ?? 0;
        return dollars % 2 === 1 || inMath(state, from - (match[0].length - text.length));
      });
      if (!asTyped) return false;
      view.dispatch(state.tr.insertText(text, from, to));
      return true;
    },
    handleKeyDown(view, event) {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") return leaveMathBlock(view.state, view.dispatch);
      if (event.key === "Backspace") return backIntoMathBlock(view.state, view.dispatch);
      const plain = !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing;
      if (event.key === "Enter" && plain) return startMathBlock(view.state, view.dispatch);
      return false;
    },
  },
}));

// ─── Plugin array for registration ──────────────────────────────────────────

/** Schema, serializing and editing; goes after the presets (see mathRemark). */
export const math: MilkdownPlugin[] = [
  mathSetup,
  mathInlineSchema,
  mathBlockSchema,
  mathEditing,
].flat();
