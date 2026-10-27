import { Lexer, Marked, type RendererExtension, type Token, type TokenizerExtension, type TokenizerThis } from "marked";
import { mathExtensions } from "./markdown-math";
import { scanMath, type MathScan } from "./mathScan";

// PyNote's math (src/lib/markdown-math.ts) in the markdown cell editor's
// parser and serializer (remark, inside Milkdown). Math is kept exactly as
// written: it is never read as Markdown, so its backslashes, underscores and
// stars survive an edit and are written back untouched. The same goes for
// what decides where math is: a run of backslashes before a "$" and the
// character references for "$" ("&#36;", "&dollar;") stay as written, and a
// plain "$" is never escaped.
//
// Where the inline text of a paragraph, heading or table cell holds math is
// what the renderer (marked) finds there: it reads the text left to right and
// takes whatever starts first, math, or emphasis, a link or strikethrough,
// whose text it then reads as a run of its own (pairing their delimiters in
// the source, math or not), which micromark matches only once it has read
// the whole text, and by rules of its own. So at the first "$" of a text, the
// text is read as the renderer reads it (rendererMath), once, and math is
// taken exactly where the renderer found it.

// --- The renderer -----------------------------------------------------------

// marked reading a text as the renderer does, with what it asks the math
// rules answered by a scan of the text (mathScan.ts). It asks at every token,
// about the rest of the text, and the rules read on to the end of the line
// when no math closes there; a scan answers at once.
class Reader extends Lexer {
  // The texts being read, innermost last (a run's text is read while the
  // text around it is).
  private readonly texts: Array<{ text: string; scan?: MathScan }> = [];

  inlineTokens(src: string, tokens?: Token[]): Token[] {
    this.texts.push({ text: src });
    try {
      return super.inlineTokens(src, tokens);
    } finally {
      this.texts.pop();
    }
  }

  /**
   * The scan of the text being read and where `src` is in it, if `src` is
   * the rest of that text (marked hands its extensions the rest of the text,
   * or the rest after its first character).
   */
  scanned(src: string): [MathScan, number] | undefined {
    const reading = this.texts[this.texts.length - 1];
    if (!reading) return undefined;
    const { text } = reading;
    const at = text.length - src.length;
    const rest = at >= 0 && (!src || (text.charCodeAt(at) === src.charCodeAt(0) && text.charCodeAt(text.length - 1) === src.charCodeAt(src.length - 1)));
    if (!rest) return undefined;
    reading.scan ??= scanMath(text);
    return [reading.scan, at];
  }
}

const scanned = (self: TokenizerThis, src: string) => (self.lexer instanceof Reader ? self.lexer.scanned(src) : undefined);

// The renderer's math extensions (mathExtensions), with inline and display
// math found by the scan when a Reader reads. A tokenizer is still handed the
// math the scan found, with the character after it, to make its token.
const extensions = mathExtensions(() => "").map((extension): TokenizerExtension & RendererExtension => {
  const { start, tokenizer } = extension;
  if (extension.name !== "inlineKatex" && extension.name !== "displayMath") return extension;
  const inline = extension.name === "inlineKatex";
  return {
    ...extension,
    start(src) {
      const found = scanned(this, src);
      if (!found) return start?.call(this, src);
      return inline ? found[0].inlineStart(found[1]) : found[0].displayStart(found[1]);
    },
    tokenizer(src, tokens) {
      const found = scanned(this, src);
      if (!found) return tokenizer.call(this, src, tokens);
      const length = inline ? found[0].inline(found[1]) : found[0].display(found[1]);
      return length ? tokenizer.call(this, src.slice(0, length + 1), tokens) : undefined;
    },
  };
});

// The renderer: marked with GFM and PyNote's math, as MarkdownCell and
// Output set it up.
const renderer = new Marked({ gfm: true, breaks: false }).use({ extensions });

// What may follow math that ends a run of the text: the rules read a run's
// text on its own, and in the text it is followed by the run's closing "*",
// "_" or "~", or by the "]" of a link or image.
const ENDS_RUN = /[\s?!.,:？！。，：*_~\]]/;

// A line of a list item's marker and nothing more, which marked lets start
// a block where CommonMark lets no empty item interrupt a paragraph.
const EMPTY_ITEM = /^ {0,3}(?:[*+-]|1[.)])[ \t]+(?:\n|$)/;

// Where the renderer finds math in `text`, as [start, end) indices: inline
// and display math, in the text and in the text of emphasis, strikethrough,
// links and images, which it reads as runs of their own. `defined` are the
// labels of the document's link definitions (a reference link is a link only
// with one).
function rendererMath(text: string, defined: readonly string[]): Array<[number, number]> {
  // Math in a run is math the rules find in the text with what ends the run
  // after it (a link's text has its escaped brackets read as brackets, which
  // leaves the rules' units as they are), so text where they find none holds
  // none. Dollar amounts are read so at once, however marked would read the
  // rest of the text (an emphasis delimiter that closes nothing has it read
  // on to the end of the text).
  if (!scanMath(text, ENDS_RUN).found) return [];
  const reader = () => {
    const lexer = new Reader(renderer.defaults);
    lexer.tokens.links = Object.fromEntries(defined.map((label) => [label.toLowerCase(), { href: "", title: "" }]));
    return lexer;
  };
  const found: Array<[number, number]> = [];
  // `position` gives where a character of the tokens' source is in `text`.
  const walk = (tokens: Token[], position: (i: number) => number) => {
    let at = 0;
    for (const token of tokens) {
      if (token.type === "inlineKatex" || token.type === "displayMath") found.push([position(at), position(at + token.raw.length - 1) + 1]);
      else if ("tokens" in token && token.tokens && "text" in token && typeof token.text === "string") {
        const inner = runText(token.type, token.raw, token.text);
        const from = at;
        if (inner) walk(token.tokens, (i) => position(from + inner[i]));
      }
      at += token.raw.length;
    }
  };
  // At a line of a list item's marker and nothing more (EMPTY_ITEM), marked
  // starts a block, and CommonMark reads on: the paragraphs that a
  // paragraph's text then makes are read apart. (The text of a heading or a
  // table cell is one line.) Whatever else marked would read of the text on
  // its own, without the quote or list item around it or the indentation
  // micromark took off its lines, it reads as the paragraph it is.
  const blocks = text.includes("\n") ? reader().lex(text) : [];
  const apart =
    blocks.length > 1 &&
    blocks[0].type === "paragraph" &&
    blocks.slice(1).every((block) =>
      block.type === "space" ||
      (block.type === "paragraph" && EMPTY_ITEM.test(block.raw)) ||
      (block.type === "list" && block.items.every((item: { text: string }) => !item.text.trim())));
  if (!apart) walk(reader().inlineTokens(text), (i) => i);
  else {
    let at = 0;
    for (const block of blocks) {
      const from = at;
      if (block.type === "paragraph" && block.tokens) walk(block.tokens, (i) => from + i);
      at += block.raw.length;
    }
  }
  return found;
}

// Where each character of the text of a run (emphasis, strikethrough, a
// link or an image, which the renderer reads on its own) is in the run's
// source: after its opening delimiters, or after the "[" (or "![") of a link
// or image, whose text the renderer reads with its escaped brackets as
// brackets. Null for a run read from anything else.
function runText(type: string, raw: string, text: string): number[] | null {
  const link = type === "link" || type === "image";
  let k = link ? raw.indexOf("[") + 1 : (raw.length - text.length) / 2;
  const at: number[] = [];
  for (let j = 0; j < text.length; j++, k++) {
    if (link && raw[k] === "\\" && (text[j] === "[" || text[j] === "]") && raw[k + 1] === text[j]) k++;
    if (raw[k] !== text[j]) return null;
    at.push(k);
  }
  return at;
}

// --- micromark --------------------------------------------------------------

// The parts of micromark's API used here (micromark-util-types has the full
// story; PyNote does not depend on it directly).
type Code = number | null;
type State = (code: Code) => State | undefined;
interface Point { line: number; column: number; offset: number }
interface MicromarkToken { type: string; start: Point; end: Point }
interface Effects {
  consume(code: Code): void;
  enter(type: string): MicromarkToken;
  exit(type: string): MicromarkToken;
  attempt(construct: Construct, ok: State, nok?: State): State;
  check(construct: Construct, ok: State, nok?: State): State;
}
interface TokenizeContext {
  interrupt?: boolean;
  events: Array<[string, MicromarkToken, unknown]>;
  parser: { lazy: Record<number, boolean>; defined: string[] };
  now(): Point;
  sliceSerialize(token: MicromarkToken): string;
}
interface Construct {
  name?: string;
  tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State): State;
  partial?: boolean;
  concrete?: boolean;
}

const DOLLAR = 36;
const BACKSLASH = 92;
const SPACE = 32;
const AMPERSAND = 38;
const SEMICOLON = 59;
// micromark's codes for line endings (CR, LF, CRLF) and for a tab (a tab
// character followed by virtual spaces).
const isLineEnding = (code: Code) => code !== null && code < -2;
const isSpace = (code: number) => code === SPACE || code === -1 || code === -2;
const charOf = (code: number) => (code === -1 ? "" : code === -2 ? "\t" : code < 0 ? "\n" : String.fromCharCode(code));

// The math the renderer finds in the text being read, from a "$" on: where
// the text starts in the source, the offset of that "$", and where each math
// from there on ends, by where it starts (offsets in the source).
interface Found {
  start: number;
  from: number;
  ends: Map<number, number>;
}

// What the renderer found in the texts read lately (rendererMath), by the
// labels of the link definitions and the text: as a cell's editor opens and
// writes its document back, it reads the same texts more than once. The
// READ_TEXTS read last are kept.
const READ_TEXTS = 256;
class ReadTexts {
  private readonly read = new Map<string, Array<[number, number]>>();

  math(text: string, defined: readonly string[]): Array<[number, number]> {
    const key = `${defined.join("\n")}\0${text}`;
    const known = this.read.get(key);
    // The text read last goes last, and the one read longest ago first.
    if (known) this.read.delete(key);
    const math = known ?? rendererMath(text, defined);
    this.read.set(key, math);
    if (this.read.size > READ_TEXTS) this.read.delete(this.read.keys().next().value!);
    return math;
  }
}

// Inline math, and display math ($$...$$) anywhere in the text: where the
// renderer finds it. At the first "$" of a text the construct reads the rest
// of it and asks the renderer about the whole text; the "$" after it use
// what it found (kept by parser, in `found`). There is none in the parts of
// the source `outside` (see remarkMath).
const mathText = (found: WeakMap<object, Found>, texts: ReadTexts, outside: ReadonlyArray<[number, number]>): Construct => ({
  name: "pynoteMathText",
  tokenize(effects, ok, nok) {
    const self = this;
    const here = self.now();
    if (outside.some(([from, to]) => from <= here.offset && here.offset < to)) return nok;
    const first = self.events[0]?.[1];
    const start = first ? first.start.offset : here.offset;
    let end = -1; // where the math ends in the source

    const known = found.get(self.parser);
    if (known && known.start === start && here.offset >= known.from) {
      end = known.ends.get(here.offset) ?? -1;
      return (code) => (end === -1 ? nok(code) : take(code));
    }

    // Reads the rest of the text, with the offset of each of its characters
    // (as micromark writes a slice of the source, a tab's virtual spaces left
    // out; and line endings as "\n", as the renderer reads them).
    const probe: Construct = {
      partial: true,
      tokenize(effects, ok, nok) {
        const before = first ? self.sliceSerialize({ type: "", start: first.start, end: here }).replace(/\r\n?/g, "\n") : "";
        let rest = "";
        const offsets: number[] = [];
        return (code: Code) => {
          effects.enter("pynoteMathProbe");
          return read(code);
        };
        function read(code: Code): State | undefined {
          if (code === null) return done(code);
          const char = charOf(code);
          if (char) {
            rest += char;
            offsets.push(self.now().offset);
          }
          effects.consume(code);
          return read;
        }
        function done(code: Code): State | undefined {
          effects.exit("pynoteMathProbe");
          const ends = new Map<number, number>();
          for (const [from, to] of texts.math(before + rest, self.parser.defined)) {
            if (from >= before.length) ends.set(offsets[from - before.length], offsets[to - 1 - before.length] + 1);
          }
          found.set(self.parser, { start, from: here.offset, ends });
          end = ends.get(here.offset) ?? -1;
          return end === -1 ? nok(code) : ok(code);
        }
      },
    };

    return (code) => effects.check(probe, take, nok)(code);

    function take(code: Code): State | undefined {
      effects.enter("pynoteMathText");
      return segment(code);
    }
    // Line endings get tokens of their own, as in code spans: micromark finds
    // the lines of a paragraph by them.
    function segment(code: Code): State | undefined {
      if (code === null || self.now().offset >= end) {
        effects.exit("pynoteMathText");
        return ok(code);
      }
      if (isLineEnding(code)) {
        effects.enter("lineEnding");
        effects.consume(code);
        effects.exit("lineEnding");
        return segment;
      }
      effects.enter("pynoteMathTextData");
      return data(code);
    }
    function data(code: Code): State | undefined {
      if (code === null || self.now().offset >= end || isLineEnding(code)) {
        effects.exit("pynoteMathTextData");
        return segment(code);
      }
      effects.consume(code);
      return data;
    }
  },
});

// A run of backslashes before a "$" (and the "$" itself when the run escapes
// it), or a character reference for "$". The renderer reads these from the
// source, so they are kept as written instead of decoded.
const dollarEscape: Construct = {
  name: "pynoteDollarEscape",
  tokenize(effects, ok, nok) {
    let backslashes = 0;
    let name = "";
    return start;

    function start(code: Code): State | undefined {
      effects.enter("pynoteDollarEscape");
      effects.consume(code);
      if (code === BACKSLASH) {
        backslashes = 1;
        return backslash;
      }
      return reference;
    }
    function backslash(code: Code): State | undefined {
      if (code === BACKSLASH) {
        effects.consume(code);
        backslashes++;
        return backslash;
      }
      if (code !== DOLLAR) return nok(code);
      // An even run leaves the "$" free to start display math.
      if (backslashes % 2 === 0) return done(code);
      effects.consume(code);
      return done;
    }
    function reference(code: Code): State | undefined {
      if (code === SEMICOLON && /^(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|dollar)$/.test(name) && decodesToDollar(name)) {
        effects.consume(code);
        return done;
      }
      if (code === null || code < 0 || name.length > 8 || !/[#\da-zA-Z]/.test(String.fromCharCode(code))) return nok(code);
      name += String.fromCharCode(code);
      effects.consume(code);
      return reference;
    }
    function done(code: Code): State | undefined {
      effects.exit("pynoteDollarEscape");
      return ok(code);
    }
  },
};

const decodesToDollar = (name: string) =>
  name === "dollar" || (name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)) === DOLLAR;

// One read of a document (see remarkMath): the "$" where block math is not
// tried, and those where it failed in a way that calls for another read.
interface Read {
  noBlock: ReadonlySet<number>;
  failed: Set<number>;
}

// How a line can start a list item, a quote or a footnote definition, after
// its indentation.
const STARTS_CONTAINER = /^(?:>|[*+-](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|\[\^)/;

// Whether the current line is a body row of the GFM table above it, as
// micromark-extension-gfm-table decides: its construct is tried after the
// "$" ones, and the renderer's table rows run on until a blank line or the
// start of a block other than math.
function tableBodyRow(self: TokenizeContext): boolean {
  let index = self.events.length - 1;
  while (index > -1 && (self.events[index][1].type === "lineEnding" || self.events[index][1].type === "linePrefix")) index--;
  const tail = index > -1 ? self.events[index][1].type : undefined;
  return (tail === "tableHead" || tail === "tableRow") && !self.parser.lazy[self.now().line];
}

// Block math: "$$" (or "$") alone on a line, up to the same fence alone on a
// line (BLOCK_MATH). Like a fenced code block it may hold blank lines, but it
// needs its closing fence, starts at the left edge, and cannot interrupt a
// paragraph (there "$$...$$" is display math in the paragraph's text) or a
// table (there it is a row).
//
// Like fenced code it is concrete: micromark starts no list item or quote
// inside it, so the lines it reads on for its closing fence are not checked
// for one. Fenced code never fails once open, but block math does where its
// closing fence never comes (at the end of the document, of its quote or
// list item, or at a lazy line), and micromark then reads those lines again
// as a paragraph, with the lists and quotes on them as text. So where it
// failed after reading a line that could start one, the document is read
// again with no block math tried there (`reads`, the reads in progress,
// innermost last).
const mathBlock = (reads: readonly Read[]): Construct => ({
  name: "pynoteMathBlock",
  concrete: true,
  tokenize(effects, ok, nok) {
    const self = this;
    const read = reads[reads.length - 1];
    let opening = -1; // where the opening fence is in the source
    let starts = false; // a line read on could start a list item, quote or footnote definition
    const passed: number[] = []; // where the lines read on that hold this fence alone start
    let fence = 0;
    let first = true; // at the first line of content
    let content = 0; // characters of content before the current line
    let backslashes = 0; // trailing backslashes on the current line
    let escaped = false; // the line ending just read belongs to the content
    let lineAt = -1; // where the current line starts in the source
    let head = ""; // the current line's first characters after its indentation
    let dollars = 0; // the "$" that make up the current line so far, -1 once it holds more

    const closing: Construct = {
      partial: true,
      tokenize(effects, ok, nok) {
        let size = 0;
        return sequence;
        function sequence(code: Code): State | undefined {
          if (code === DOLLAR && size < fence) {
            if (size === 0) effects.enter("pynoteMathBlockFence");
            effects.consume(code);
            size++;
            return sequence;
          }
          if (size < fence || (code !== null && !isLineEnding(code))) return nok(code);
          effects.exit("pynoteMathBlockFence");
          return ok(code);
        }
      },
    };

    const nonLazyLineEnding: Construct = {
      partial: true,
      tokenize(effects, ok, nok) {
        return (code) => {
          effects.enter("lineEnding");
          effects.consume(code);
          effects.exit("lineEnding");
          return (next: Code) => (next === null || self.parser.lazy[self.now().line] ? nok(next) : ok(next));
        };
      },
    };

    return start;

    function start(code: Code): State | undefined {
      const tail = self.events[self.events.length - 1];
      if (self.interrupt || (tail && tail[1].type === "linePrefix") || tableBodyRow(self)) return nok(code);
      opening = self.now().offset;
      if (read?.noBlock.has(opening)) return nok(code);
      effects.enter("pynoteMathBlock");
      return open(code);
    }
    // No closing fence. If a line read on could have started a list item, a
    // quote or a footnote definition, the document is read again. A fence like
    // this one that it read past reads on over the same lines, so it fails as
    // well (or is no fence once those lines are read again).
    function fail(code: Code): State | undefined {
      if (starts && read) for (const at of [opening, ...passed]) read.failed.add(at);
      return nok(code);
    }
    function open(code: Code): State | undefined {
      if (code === DOLLAR && fence < 2) {
        effects.consume(code);
        fence++;
        return open;
      }
      return isLineEnding(code) ? lineEnding(code) : nok(code);
    }
    function lineEnding(code: Code): State | undefined {
      // A backslash escapes the line ending after it (BLOCK_MATH's `\\[^]`).
      escaped = backslashes % 2 === 1;
      return effects.attempt(nonLazyLineEnding, lineStart, fail)(code);
    }
    function lineStart(code: Code): State | undefined {
      if (!first && content > 0 && !escaped) return effects.attempt(closing, end, contentLine)(code);
      return contentLine(code);
    }
    function contentLine(code: Code): State | undefined {
      if (!first) content++; // the line ending before this line
      first = false;
      backslashes = 0;
      lineAt = self.now().offset;
      head = "";
      dollars = 0;
      if (code === null) return fail(code);
      if (isLineEnding(code)) return lineEnding(code);
      effects.enter("pynoteMathBlockValue");
      return line(code);
    }
    function line(code: Code): State | undefined {
      if (code === null || isLineEnding(code)) {
        starts ||= STARTS_CONTAINER.test(head);
        if (dollars === fence) passed.push(lineAt);
      }
      if (code === null) return fail(code);
      if (isLineEnding(code)) {
        effects.exit("pynoteMathBlockValue");
        return lineEnding(code);
      }
      if (head.length < 12 && (head || !isSpace(code))) head += charOf(code);
      dollars = code === DOLLAR && dollars >= 0 ? dollars + 1 : -1;
      effects.consume(code);
      content += charOf(code).length;
      backslashes = code === BACKSLASH ? backslashes + 1 : 0;
      return line;
    }
    function end(code: Code): State | undefined {
      effects.exit("pynoteMathBlock");
      return ok(code);
    }
  },
});

const syntax = (found: WeakMap<object, Found>, texts: ReadTexts, outside: ReadonlyArray<[number, number]>, reads: readonly Read[]) => ({
  text: { [DOLLAR]: mathText(found, texts, outside), [BACKSLASH]: dollarEscape, [AMPERSAND]: dollarEscape },
  flow: { [DOLLAR]: mathBlock(reads) },
});

// --- mdast ------------------------------------------------------------------

/** An mdast node, as far as math needs to know. */
export interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: { start: Partial<Point>; end: Partial<Point> };
  [key: string]: unknown;
}

// What mdast-util-from-markdown hands its handlers as `this`.
interface CompileContext {
  stack: MdNode[];
  config: { enter: Record<string, (this: CompileContext, token: MicromarkToken) => void>; exit: Record<string, (this: CompileContext, token: MicromarkToken) => void> };
  enter(node: MdNode, token: MicromarkToken): void;
  exit(token: MicromarkToken): void;
  sliceSerialize(token: MicromarkToken): string;
}

function enterLiteral(type: string) {
  return function (this: CompileContext, token: MicromarkToken) {
    this.enter({ type, value: "" }, token);
  };
}

function exitLiteral(this: CompileContext, token: MicromarkToken) {
  this.stack[this.stack.length - 1].value = this.sliceSerialize(token);
  this.exit(token);
}

// Math becomes `inlineMath` and `blockMath` nodes holding the source; the
// escapes stay text, as written. An image keeps its description as written
// too (in `data.label`), for the editor to write it back so (mathPlugin.ts):
// mdast has it as plain text, without its code spans, emphasis and escapes,
// which tell where the renderer finds math in it.
const fromMarkdown = {
  enter: {
    pynoteMathText: enterLiteral("inlineMath"),
    pynoteMathBlock: enterLiteral("blockMath"),
    pynoteDollarEscape(this: CompileContext, token: MicromarkToken) {
      this.config.enter.data.call(this, token);
    },
    labelText(this: CompileContext, token: MicromarkToken) {
      const node = this.stack[this.stack.length - 2];
      if (node?.type === "image") node.data = { ...(node.data as object), label: this.sliceSerialize(token) };
    },
  },
  exit: {
    pynoteMathText: exitLiteral,
    pynoteMathBlock: exitLiteral,
    pynoteDollarEscape(this: CompileContext, token: MicromarkToken) {
      this.config.exit.data.call(this, token);
    },
  },
};

const offsetOf = (point: Partial<Point> | undefined) => point?.offset ?? 0;

interface Processor {
  data(): Record<string, unknown[] | undefined>;
  parse(markdown: string): unknown;
  parser?: (document: string, file: unknown) => unknown;
}

// Marks the hard breaks written as a "\" before the line ending (`escaped`):
// the renderer reads that "\" right after a "$" before the break, so math
// does not close there. The editor keeps them so (mathPlugin.ts).
function markEscapedBreaks(node: MdNode, source: string): void {
  for (const child of node.children ?? []) {
    if (child.type === "break" && source[offsetOf(child.position?.start)] === "\\") child.data = { ...(child.data as object), escaped: true };
    markEscapedBreaks(child, source);
  }
}

const holdsMath = (node: MdNode): boolean => node.type === "inlineMath" || !!node.children?.some(holdsMath);

// Where the cells are that hold math in the rows of tables that have more
// cells than their header row: the renderer leaves those cells out, and
// micromark keeps them.
function cellsLeftOut(node: MdNode, found: Array<[number, number]> = []): Array<[number, number]> {
  if (node.type !== "table") node.children?.forEach((child) => cellsLeftOut(child, found));
  else {
    const columns = node.children?.[0]?.children?.length ?? 0;
    for (const row of node.children ?? []) {
      for (const cell of row.children?.slice(columns) ?? []) {
        if (holdsMath(cell)) found.push([offsetOf(cell.position?.start), offsetOf(cell.position?.end)]);
      }
    }
  }
  return found;
}

// How many times a document is read at most. A fence that fails can keep
// another one from being tried, in a quote or list item it read past without
// seeing it (or behind a fence of the other size), and that one then fails
// in the next read. A document made to chain more of those than this keeps
// the lines after the last ones as text, rather than taking seconds to read.
const MAX_READS = 8;

/**
 * The remark plugin: math syntax, and the hard breaks written as a "\". A
 * document with math in table cells the renderer leaves out is read again
 * with none there, and one where block math failed after reading past a
 * line that could start a list item or quote, with none tried there.
 */
export function remarkMath(this: Processor) {
  const data = this.data();
  const outside: Array<[number, number]> = [];
  const reads: Read[] = [];
  (data.micromarkExtensions ??= []).push(syntax(new WeakMap(), new ReadTexts(), outside, reads));
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);
  // Where block math failed after reading past a line that could start a
  // list item, quote or footnote definition (see mathBlock), the document is
  // read again with none tried there, until a read finds no new place (a
  // place in noBlock fails at once, before reading on). The parser does
  // it (remark-parse's, which comes first), as every read goes through it:
  // markdownWriteBack reads a cell's blocks without the transform below.
  const parse = this.parser;
  if (parse) {
    this.parser = (document, file) => {
      const noBlock = new Set<number>();
      for (let count = 1; ; count++) {
        const read: Read = { noBlock, failed: new Set() };
        reads.push(read);
        try {
          const tree = parse(document, file);
          if (read.failed.size === 0 || count === MAX_READS) return tree;
        } finally {
          reads.pop();
        }
        for (const at of read.failed) noBlock.add(at);
      }
    };
  }
  return (tree: MdNode, file: { value?: unknown }) => {
    const source = String(file.value ?? "");
    const leftOut = cellsLeftOut(tree);
    if (leftOut.length > 0) {
      outside.push(...leftOut);
      try {
        tree.children = (this.parse(source) as MdNode).children;
      } finally {
        outside.length = 0;
      }
    }
    markEscapedBreaks(tree, source);
  };
}

// --- Serializing ------------------------------------------------------------

// What mdast-util-to-markdown hands its handlers.
interface Unsafe { character: string; inConstruct?: string | string[]; notInConstruct?: string | string[] }
interface StringifyState {
  stack: string[];
  unsafe: Unsafe[];
  safe(value: string, config: Info & { encode?: string[] }): string;
}
interface Info { before: string; after: string }
type Handle = ((node: MdNode, parent: MdNode | undefined, state: StringifyState, info: Info) => string) & { peek?: () => string };

const inList = (stack: string[], list: string | string[] | undefined, none: boolean) => {
  if (list === undefined || list.length === 0) return none;
  return (typeof list === "string" ? [list] : list).some((name) => stack.includes(name));
};
const inScope = (stack: string[], pattern: Unsafe) =>
  inList(stack, pattern.inConstruct, true) && !inList(stack, pattern.notInConstruct, false);

// In a table cell a "|" ends the cell, so math there has its pipes escaped,
// as the renderer reads them inside a table.
const escapePipes = (raw: string) => raw.replace(/(\\*)\|/g, (all, slashes: string) => (slashes.length % 2 ? all : `${slashes}\\|`));

// A run of backslashes before a "$", and a character reference for "$" (as
// dollarEscape keeps them).
const DOLLAR_ESCAPE = /\\+(?=\$)|&(?:#0{0,5}36|#[xX]0{0,4}24|dollar);/g;

// A line that reads as a setext heading's underline or a table's delimiter
// row when it follows a line of a paragraph: indented less than four columns,
// which a tab can be after the prefix of a quote or list item ("> \t===").
const UNDERLINE = /^ {0,3}(?:\t[ \t]*)?(?:=+|(?:\|[ \t]*)?:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?)[ \t]*$/;
// A setext heading's underline, outside quotes, list items and footnote
// definitions (where a tab is four columns).
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;

/**
 * Handlers for remark-stringify: math is written as it is, and so are the
 * escapes that decide where math is (`text` wraps the handler it replaces).
 * While the editor writes a document, its inline math is in the text,
 * between two `marker()` characters (mathPlugin.ts), so a text node's value
 * alternates text and math.
 */
export function mathHandlers(text: Handle, marker: () => string): Record<string, Handle> {
  const math = (raw: string, state: StringifyState) => (state.stack.includes("tableCell") ? escapePipes(raw) : raw);
  const inlineMath: Handle = (node, _parent, state) => math(node.value!, state);
  inlineMath.peek = () => "$";
  // Milkdown's text handler writes text that ends in whitespace and holds no
  // "*", "_" or "\" as it is, so that a space typed at the end of a line is
  // not written "&#x20;". Text that math follows ends in whitespace as a
  // rule, and written so, a marker at the start of a line in it is left as
  // it is: "\- " before math would come back "- ", a list item. So text that
  // math (or an escape kept as written) follows is escaped as Milkdown
  // escapes other text, with the whitespace at its end kept as it is: a
  // "&#x20;" before a "$" would keep math from opening there.
  const write = (node: MdNode, parent: MdNode | undefined, state: StringifyState, info: Info, last: boolean) => {
    if (last) return text(node, parent, state, info);
    const value = node.value!;
    const space = /\s*$/.exec(value)![0];
    const body = value.slice(0, value.length - space.length);
    return (body ? state.safe(body, { ...info, after: space ? space[0] : info.after, encode: [] }) : "") + space;
  };
  // `last`: the text ends the text node (no math follows it).
  const plain = (node: MdNode, parent: MdNode | undefined, state: StringifyState, info: Info, last: boolean) => {
    const value = node.value!;
    const kept: Array<[number, number]> = [...value.matchAll(DOLLAR_ESCAPE)].map((m) => [m.index!, m.index! + m[0].length]);
    // Backslashes before math (or a "$") that comes next.
    const trailing = info.after === "$" ? /\\+$/.exec(value) : null;
    if (trailing) kept.push([trailing.index, value.length]);
    if (kept.length === 0) return write(node, parent, state, info, last);
    const part = (from: number, to: number) =>
      from < to
        ? write(
            { ...node, value: value.slice(from, to) },
            parent,
            state,
            { ...info, before: from > 0 ? value[from - 1] : info.before, after: to < value.length ? value[to] : info.after },
            last && to === value.length,
          )
        : "";
    let out = "";
    let at = 0;
    for (const [from, to] of kept) {
      out += part(at, from) + value.slice(from, to);
      at = to;
    }
    return out + part(at, value.length);
  };
  return {
    inlineMath,
    blockMath: (node) => node.value!,
    text(node, parent, state, info) {
      const parts = marker() ? node.value!.split(marker()) : [node.value!];
      return parts
        .map((value, k) => {
          if (k % 2 === 1) {
            // Math that starts a line of a paragraph must not read as an
            // underline where it is written. In a quote, list item or footnote
            // definition it is written after their prefix, which a lazy line
            // in the source has none of. Elsewhere a line of math reads as it
            // did, except one that would underline a heading, which a
            // paragraph only holds once moved out of a quote or list item. A
            // backslash would change the math, so such a line is indented four
            // spaces instead, which TeX ignores.
            const before = k > 1 || parts[0] ? parts[k - 1].slice(-1) : info.before;
            const prefixed = state.stack.some((name) => name === "blockquote" || name === "listItem" || name === "footnoteDefinition");
            const underline = /[\r\n]/.test(before) && (prefixed ? UNDERLINE : SETEXT).test(value);
            return (underline ? "    " : "") + math(value, state);
          }
          if (!value) return "";
          return plain(
            { ...node, value },
            parent,
            state,
            { ...info, before: k > 0 ? parts[k - 1].slice(-1) : info.before, after: k + 1 < parts.length ? parts[k + 1].charAt(0) : info.after },
            k + 1 === parts.length,
          );
        })
        .join("");
    },
    // As mdast-util-to-markdown's own (a space where a line cannot end), but
    // after a "$" the break is two spaces: a backslash there would keep math
    // that ends the line from closing. A break read as a backslash stays one
    // (markEscapedBreaks), as math did not close before it.
    break(node, _parent, state, info) {
      if (state.unsafe.some((pattern) => pattern.character === "\n" && inScope(state.stack, pattern))) {
        return /[ \t]/.test(info.before) ? "" : " ";
      }
      return info.before === "$" && !(node.data as { escaped?: boolean } | undefined)?.escaped ? "  \n" : "\\\n";
    },
  };
}
