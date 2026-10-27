import { Marked, type RendererExtension, type Token, type TokenizerExtension } from "marked";
import { BLOCK_MATH, DISPLAY_MATH, INLINE_MATH, displayMathStart, inlineMathStart } from "../markdown-math";

// Markdown rendered as Python comment lines, for markdown cells in .py
// exports. The goal is a comment that reads like the rendered cell and is
// still equivalent Markdown once the "# " prefixes are stripped, so a .py file
// can be imported back as a notebook. The rules are specified in
// docs/formats/exports.md ("Comment wrapping"):
//
// - paragraphs (also inside lists and quotes) are reflowed to the width, never
//   breaking inside code spans, links, images, autolinks, inline math or
//   inline HTML, and never letting a wrapped line start with something
//   Markdown would read as the start of a new block;
// - headings, code blocks, HTML blocks, math blocks, rules, link definitions
//   and front matter are kept verbatim;
// - tables are re-aligned, never wrapped.
//
// marked has quirks a rewrap can trip (some tokens are built from rewritten
// text, a paragraph stops at anything that looks like a table start), so the
// result is checked: when the comment would not render exactly like the
// cell, the cell is written as is. This never throws, and the comment is
// always equivalent Markdown.

// --- Lexing ------------------------------------------------------------------

// A private marked instance: the app's global `marked` gets KaTeX extensions
// once the markdown renderer loads, so lexing through it would make the
// output depend on import order. These extensions recognize math exactly
// where PyNote renders it, with the rules the renderers use
// (src/lib/markdown-math.ts), tried in the same order.

// For the equivalence check, math renders as its exact source, whitespace
// included (it is otherwise normalized away; a LaTeX "%" comment depends on
// line breaks, and KaTeX quotes the source in its error messages). Trailing
// line breaks are not part of the math (a block's raw text takes in the line
// break after it).
const mathHtml = (raw: string) =>
  `<math>${raw.trimEnd().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\s/g, (ch) => `&#${ch.codePointAt(0)};`)}</math>`;

const inlineMath: TokenizerExtension & RendererExtension = {
  name: "inlineMath",
  level: "inline",
  start: inlineMathStart,
  tokenizer(src: string) {
    const match = INLINE_MATH.exec(src);
    return match ? { type: "inlineMath", raw: match[0] } : undefined;
  },
  renderer: (token) => mathHtml(token.raw),
};

const blockMath: TokenizerExtension & RendererExtension = {
  name: "blockMath",
  level: "block",
  tokenizer(src: string) {
    const match = BLOCK_MATH.exec(src);
    return match ? { type: "blockMath", raw: match[0] } : undefined;
  },
  renderer: (token) => mathHtml(token.raw),
};

const displayMath: TokenizerExtension & RendererExtension = {
  name: "displayMath",
  level: "inline",
  start: displayMathStart,
  tokenizer(src: string) {
    const match = DISPLAY_MATH.exec(src);
    return match ? { type: "displayMath", raw: match[0] } : undefined;
  },
  renderer: (token) => mathHtml(token.raw),
};

const markdown = new Marked({ gfm: true, breaks: false, pedantic: false });
markdown.use({ extensions: [inlineMath, blockMath, displayMath] });

// --- Output model ------------------------------------------------------------

// Rendered content lines, without the "# " prefix. SEP is a blank line between
// blocks: runs of them collapse to one and they never start or end a block of
// output, while "" is a blank line that belongs to a block (a code block's
// empty line) and is kept as is.
const SEP = null;
type Out = Array<string | typeof SEP>;

const finish = (out: Out): string[] => {
  const lines: string[] = [];
  let pendingSep = false;
  for (const line of out) {
    if (line === SEP) {
      pendingSep = lines.length > 0;
      continue;
    }
    if (pendingSep) lines.push("");
    pendingSep = false;
    lines.push(line);
  }
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
};

// A blank line as Markdown defines it: nothing but spaces and tabs. (trim()
// also drops other characters, such as U+FEFF, that make a line a paragraph.)
const isBlank = (line: string): boolean => /^[ \t]*$/.test(line);

// Width in code points (what a reader counts), not UTF-16 units.
const width = (text: string): number => {
  let n = 0;
  for (const _ of text) n++;
  return n;
};

/** A token's raw text as lines, plus whether a blank line followed it. */
const rawLines = (raw: string): { lines: string[]; blankAfter: boolean } => {
  const lines = raw.split("\n");
  let popped = 0;
  while (lines.length > 0 && isBlank(lines[lines.length - 1])) {
    lines.pop();
    popped++;
  }
  // One popped line is the empty string after the token's own line break.
  return { lines, blankAfter: popped >= 2 };
};

const pushLines = (out: Out, lines: string[], blankAfter: boolean) => {
  out.push(...lines);
  if (blankAfter) out.push(SEP);
};

// --- Blocks ------------------------------------------------------------------

/** Render `markdown` as Python comment lines that fit in `lineWidth` columns. */
export function markdownToComment(markdown: string, lineWidth = 79): string[] {
  // CommonMark replaces NUL with U+FFFD; doing it here also keeps the comment
  // valid Python (CPython refuses source code that contains a NUL byte).
  const text = markdown.replace(/\r\n?/g, "\n").replace(/\0/g, "\uFFFD");
  let body: string[];
  try {
    body = renderDocument(text, lineWidth - 2);
    // The safety net: marked has quirks (a paragraph stops at anything that
    // looks like a table start, even one it then rejects) that rewrapping can
    // trip; when the comment does not render exactly like the cell, the cell
    // is kept as written.
    if (rendered(body.join("\n")) !== rendered(text)) throw new Error("not equivalent");
  } catch {
    // The cell exactly as written (only blank lines at its ends dropped).
    const lines = text.split("\n");
    while (lines.length > 0 && isBlank(lines[0])) lines.shift();
    while (lines.length > 0 && isBlank(lines[lines.length - 1])) lines.pop();
    body = lines;
  }
  return body.map((line) => (line === "" ? "#" : `# ${line}`));
}

const BLOCK_TAGS = /\s*(<\/?(?:p|li|ul|ol|blockquote|h[1-6]|table|thead|tbody|tr|th|td|pre|hr|br|input)\b[^>]*>)\s*/g;

/** HTML for Markdown, with whitespace normalized the way a browser lays it out. */
const rendered = (md: string): string =>
  markdown.parse(md, { async: false }).replace(/\s+/g, " ").replace(BLOCK_TAGS, "$1").trim();

/**
 * Whether every container's tokens add up to exactly its text. marked builds
 * some tokens from rewritten text (a quote split at lazy lines, a task box
 * in front of a table), and their raw text is then not the source: such a
 * cell is kept as written rather than rebuilt from tokens.
 */
function consistent(tokens: Token[], text: string): boolean {
  if (tokens.map((t) => t.raw).join("") !== text) return false;
  for (const token of tokens) {
    if (token.type === "blockquote" && !consistent(token.tokens ?? [], token.text)) return false;
    if (token.type === "list") {
      for (const item of token.items as Array<ListItemToken & { text: string }>) {
        // marked removes a task box from the item's text and adds it back as
        // a token of its own (or at the start of the first paragraph).
        const head = item.tokens[0];
        const box = head?.type === "checkbox" ? head.raw : head && "tokens" in head && head.tokens?.[0]?.type === "checkbox" ? head.tokens[0].raw : "";
        if (!consistent(item.tokens, box + item.text)) return false;
      }
    }
  }
  return true;
}

function renderDocument(text: string, avail: number): string[] {
  const lines = text.split("\n");
  const out: Out = [];
  const end = frontMatterEnd(lines);
  let rest = text;
  if (end > 0) {
    out.push(...lines.slice(0, end));
    const remaining = lines.slice(end);
    if (remaining.length > 0 && isBlank(remaining[0])) out.push(SEP);
    rest = remaining.join("\n");
  }
  const tokens = markdown.lexer(rest);
  if (!consistent(tokens, rest)) throw new Error("tokens do not match the text");
  out.push(...renderBlocks(tokens, avail));
  return finish(out);
}

// YAML (---) or TOML (+++) front matter at the very top of a cell: an opening
// line, a first line that looks like a key, no blank lines, a closing line.
// Kept verbatim (Markdown would read it as a rule and a setext heading).
function frontMatterEnd(lines: string[]): number {
  const open = lines[0]?.trimEnd();
  if (open !== "---" && open !== "+++") return 0;
  const key = open === "---" ? /^[A-Za-z0-9_][\w .-]*:(\s|$)/ : /^[A-Za-z0-9_][\w.-]*\s*=/;
  if (!key.test(lines[1] ?? "")) return 0;
  for (let k = 2; k < lines.length; k++) {
    const line = lines[k].trimEnd();
    if (line === open || (open === "---" && line === "...")) return k + 1;
    if (line === "") return 0;
  }
  return 0;
}

function renderBlocks(tokens: Token[], avail: number): Out {
  const out: Out = [];
  for (const token of tokens) {
    if (token.type === "space") {
      out.push(SEP);
      continue;
    }
    const { lines, blankAfter } = rawLines(token.raw);
    let block: string[];
    try {
      block = renderBlock(token, avail);
    } catch {
      block = lines; // the block exactly as written
    }
    pushLines(out, block, blankAfter);
  }
  return out;
}

function renderBlock(token: Token, avail: number): string[] {
  switch (token.type) {
    case "paragraph":
    case "text":
      return renderText(token as TextToken, avail);
    case "blockquote": {
      // marked processes a quote in chunks split at lazy lines (lines without
      // ">"), which can end a nested list or quote early; making those lines
      // explicit would join what marked kept apart, so such a quote is kept
      // as written.
      const lazy = rawLines(token.raw).lines.some((line) => !/^ {0,3}>/.test(line));
      if (lazy && (token.tokens ?? []).some((t) => t.type === "list" || t.type === "blockquote")) throw new Error("lazy quote");
      const inner = finish(renderBlocks(token.tokens ?? [], avail - 2)).map((line) => (line === "" ? ">" : `> ${line}`));
      // A quote that ends with an empty quote line keeps it: it stops the
      // next line from continuing the quote's last paragraph lazily.
      const lines = rawLines(token.raw).lines;
      if (inner.length === 0 || /^ {0,3}>[ \t]*$/.test(lines[lines.length - 1] ?? "")) inner.push(">");
      return inner;
    }
    case "list":
      return renderList(token.items, avail);
    case "table":
      return renderTable(rawLines(token.raw).lines);
    case "code":
      return closeFence(rawLines(token.raw).lines);
    default:
      // Headings, rules, HTML blocks, math blocks, link definitions: verbatim.
      return rawLines(token.raw).lines;
  }
}

/** A paragraph (or a list item's text), with `lead` (a task box) glued to its first word. */
interface TextToken {
  raw: string;
  text: string;
  tokens?: Token[];
}

function renderText(token: TextToken, avail: number, lead = ""): string[] {
  // marked merges an indented line that follows text in a list item into the
  // text with its indentation removed (and the blank lines after it), losing
  // what kept the line from reading as a block; such text is kept as written.
  if (token.raw.replace(/\n+$/, "") !== token.text || /\n[ \t]*\n/.test(token.text)) throw new Error("transformed text");
  return wrapParagraph(token.text, token.tokens ?? [], avail, lead);
}

// An unclosed fence runs to the end of its container. Closing it explicitly
// renders the same, and keeps a reader that looks for fences (jupytext does,
// inside markdown cells) from running on into the next cell.
function closeFence(lines: string[]): string[] {
  const open = /^( {0,3})(`{3,}|~{3,})/.exec(lines[0] ?? "");
  if (!open) return lines; // an indented code block
  const [, indent, fence] = open;
  const closer = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
  if (lines.length > 1 && closer.test(lines[lines.length - 1])) return lines;
  return [...lines, indent + fence];
}

// --- Lists -------------------------------------------------------------------

interface ListItemToken {
  raw: string;
  task: boolean;
  tokens: Token[];
}

const expandTabs = (text: string, column: number): string => {
  let out = "";
  let col = column;
  for (const ch of text) {
    if (ch === "\t") {
      const added = 4 - (col % 4);
      out += " ".repeat(added);
      col += added;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
};

function renderList(items: ListItemToken[], avail: number): string[] {
  const out: Out = [];
  items.forEach((item, index) => {
    out.push(...renderListItem(item, avail));
    // A blank line after an item (it ends the item's raw text) makes the list
    // loose; keeping exactly those keeps it loose or tight.
    const tail = item.raw.slice(item.raw.trimEnd().length);
    if (index < items.length - 1 && (tail.match(/\n/g) ?? []).length >= 2) out.push(SEP);
  });
  return finish(out);
}

function renderListItem(item: ListItemToken, avail: number): string[] {
  const first = item.raw.split("\n", 1)[0];
  const bullet = /^( {0,3})(\d{1,9}[.)]|[*+-])/.exec(first);
  if (!bullet) throw new Error("list item without a marker");
  // The content offset, computed as marked computes it: the spaces after the
  // marker (tabs expanded), or one when there are more than four (the item
  // then starts with an indented code block) or none (an empty first line).
  const after = expandTabs(first.slice(bullet[0].length), bullet[0].length);
  const spaces = after.trim() === "" ? 1 : after.search(/[^ ]/);
  const marker = `${bullet[1]}${bullet[2]}${" ".repeat(spaces > 4 ? 1 : spaces)}`;

  let tokens = item.tokens;
  let checkbox = "";
  if (item.task) {
    // marked takes the checkbox out of the item's first block when that block
    // is text, and adds it back as its own token or at the start of the first
    // paragraph. It is glued to the first word (a box alone on its line is no
    // box). When the first block is something else (a heading), the box text
    // is still in it, and the added token is dropped.
    const [head, next, ...rest] = tokens;
    const isText = (t: Token | undefined) => t?.type === "paragraph" || t?.type === "text";
    if (head?.type === "checkbox") {
      if (isText(next)) checkbox = head.raw;
      tokens = next ? [next, ...rest] : [];
    } else if (isText(head) && "tokens" in head && head.tokens?.[0]?.type === "checkbox") {
      const box = head.tokens[0].raw;
      if (!head.text.startsWith(box) || !head.raw.startsWith(box)) throw new Error("unexpected checkbox layout");
      if (head.text === box) {
        tokens = next ? [next, ...rest] : [];
      } else {
        checkbox = box;
        tokens = [{ ...head, raw: head.raw.slice(box.length), text: head.text.slice(box.length), tokens: head.tokens.slice(1) } as Token, ...(next ? [next, ...rest] : [])];
      }
    }
  }

  // Wrapped text hangs at the item's content offset. Hanging it further (under
  // the text after a task box) would indent it by four, and marked reads
  // such lines in a list item as indented code merged into the text.
  const offset = width(marker);
  let body: string[];
  if (checkbox) {
    const [first, ...others] = tokens;
    const { lines, blankAfter } = rawLines(first.raw);
    let head: string[];
    try {
      head = renderText(first as TextToken, avail - offset, checkbox);
    } catch {
      head = [checkbox + (lines[0] ?? ""), ...lines.slice(1)];
    }
    body = finish([...head, ...(blankAfter ? [SEP] : []), ...renderBlocks(others, avail - offset)]);
  } else {
    body = finish(renderBlocks(tokens, avail - offset));
  }
  if (body.length === 0) return [marker.trimEnd()];
  return body.map((line, i) => (i === 0 ? marker + line : line === "" ? "" : " ".repeat(offset) + line));
}

// --- Tables ------------------------------------------------------------------

// Cells split on unescaped pipes, exactly as marked (GFM) splits them; the
// cell text itself is kept verbatim, escapes included.
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "|") continue;
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) backslashes++;
    if (backslashes % 2 === 1) continue;
    cells.push(line.slice(start, i));
    start = i + 1;
  }
  cells.push(line.slice(start));
  if (cells[0].trim() === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((cell) => cell.trim());
}

type Align = "left" | "right" | "center" | null;

const alignOf = (cell: string): Align =>
  /^:-+:$/.test(cell) ? "center" : /^-+:$/.test(cell) ? "right" : /^:-+$/.test(cell) ? "left" : null;

const pad = (text: string, size: number, align: Align): string => {
  const room = size - width(text);
  if (align === "right") return " ".repeat(room) + text;
  if (align === "center") return " ".repeat(Math.floor(room / 2)) + text + " ".repeat(Math.ceil(room / 2));
  return text + " ".repeat(room);
};

const delimiter = (align: Align, size: number): string => {
  if (align === "center") return `:${"-".repeat(size - 2)}:`;
  if (align === "right") return `${"-".repeat(size - 1)}:`;
  if (align === "left") return `:${"-".repeat(size - 1)}`;
  return "-".repeat(size);
};

function renderTable(lines: string[]): string[] {
  const [header, delims, ...body] = lines.map(splitRow);
  const columns = header.length;
  if (!delims || delims.length !== columns) throw new Error("not a table");
  const align = delims.map(alignOf);
  // Short rows are padded with empty cells (rendered the same); cells past
  // the header's count are kept, though GFM ignores them.
  const rows = body.map((row) => (row.length < columns ? [...row, ...Array<string>(columns - row.length).fill("")] : row));
  const sizes: number[] = [];
  for (const row of [header, ...rows]) {
    row.forEach((cell, c) => {
      sizes[c] = Math.max(sizes[c] ?? 3, width(cell));
    });
  }
  const line = (row: string[]) => `| ${row.map((cell, c) => pad(cell, sizes[c], align[c] ?? null)).join(" | ")} |`;
  return [line(header), `| ${align.map((a, c) => delimiter(a, sizes[c])).join(" | ")} |`, ...rows.map(line)];
}

// --- Paragraphs --------------------------------------------------------------

interface Atom {
  start: number;
  end: number;
  // Display math spanning lines keeps its line structure (a LaTeX "%"
  // comment would swallow a joined line); other atoms are joined with spaces.
  keepLines: boolean;
}

/** Positions of unbreakable atoms and hard line breaks in a paragraph's text. */
function inlineLayout(text: string, tokens: Token[]): { atoms: Atom[]; breaks: Set<number> } {
  const atoms: Atom[] = [];
  const breaks = new Set<number>(); // index of the "\n" of each hard break
  const walk = (list: Token[], from: number): number => {
    let pos = from;
    for (const token of list) {
      if (!text.startsWith(token.raw, pos)) throw new Error("token does not match its text");
      const end = pos + token.raw.length;
      switch (token.type) {
        case "text":
        case "escape":
          break;
        case "br":
          breaks.add(end - 1);
          break;
        case "em":
        case "strong":
        case "del": {
          const inner = token.tokens ?? [];
          const innerLength = inner.reduce((n, t) => n + t.raw.length, 0);
          const delimiterLength = (token.raw.length - innerLength) / 2;
          if (!Number.isInteger(delimiterLength) || delimiterLength < 0) throw new Error("unexpected emphasis");
          if (walk(inner, pos + delimiterLength) !== pos + delimiterLength + innerLength) throw new Error("unexpected emphasis");
          break;
        }
        case "displayMath":
          atoms.push({ start: pos, end, keepLines: token.raw.includes("\n") });
          break;
        default:
          // Code spans, links, images, autolinks, inline HTML, inline math,
          // and anything unknown: never broken.
          atoms.push({ start: pos, end, keepLines: false });
      }
      pos = end;
    }
    return pos;
  };
  if (walk(tokens, 0) !== text.length) throw new Error("tokens do not cover the text");
  return { atoms, breaks };
}

// A word that must not begin a wrapped line, because Markdown would read the
// line as a new block: a list or quote marker, a heading, a rule, a setext
// underline, a table delimiter row, a fence, an HTML block, a math block. A
// "%%" word is included because "# %%" reads as a cell marker in .py files.
const BLOCK_START = /^(?:[-+*=_#>~:|`$]+$|[><]|%%|`{3}|~{3}|\d{1,9}[.)]$)/;

// A line ending in an unescaped backslash is a hard line break.
const endsWithBackslash = (word: string): boolean => {
  let n = 0;
  for (let i = word.length - 1; i >= 0 && word[i] === "\\"; i--) n++;
  return n % 2 === 1;
};

const isSpace = (ch: string) => ch === " " || ch === "\t" || ch === "\n";

function wrapParagraph(text: string, tokens: Token[], avail: number, lead: string): string[] {
  const { atoms, breaks } = inlineLayout(text, tokens);
  const atomAt = new Int32Array(text.length).fill(-1);
  atoms.forEach((atom, i) => atomAt.fill(i, atom.start, atom.end));

  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineEnd = (line: number) => (line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : text.length);
  const lineOf = (pos: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  // Lines kept exactly as written: those of multi-line display math, grown
  // to whole atoms so no atom is split between kept and reflowed text.
  const kept = new Uint8Array(lineStarts.length);
  for (const atom of atoms) if (atom.keepLines) kept.fill(1, lineOf(atom.start), lineOf(atom.end - 1) + 1);
  for (let changed = true; changed; ) {
    changed = false;
    for (const atom of atoms) {
      const a = lineOf(atom.start);
      const b = lineOf(Math.max(atom.start, atom.end - 1));
      if (kept.subarray(a, b + 1).some((k) => k === 1) && kept.subarray(a, b + 1).some((k) => k === 0)) {
        kept.fill(1, a, b + 1);
        changed = true;
      }
    }
  }

  const out: string[] = [];
  for (let line = 0; line < lineStarts.length; ) {
    let next = line;
    while (next < lineStarts.length && kept[next] === kept[line]) next++;
    if (kept[line]) {
      for (let k = line; k < next; k++) out.push((k === 0 ? lead : "") + text.slice(lineStarts[k], lineEnd(k)));
    } else {
      out.push(...reflow(text, lineStarts[line], lineEnd(next - 1), line === 0 ? lead : null, atoms, atomAt, breaks, avail));
    }
    line = next;
  }
  return out;
}

interface Word {
  text: string;
  hardBefore: boolean; // a hard line break precedes this word
  breakAfter: string; // the trailing spaces of a hard line break after it
  indent: string; // the original indentation, for a word that starts a line
  endsLine: boolean; // the last word on its line in the source
}

/**
 * Reflow text[start, end) (whole lines, none kept verbatim). `lead` is set
 * when the text starts the paragraph: it is glued to the first word.
 */
function reflow(
  text: string, start: number, end: number, lead: string | null,
  atoms: Atom[], atomAt: Int32Array, breaks: Set<number>, avail: number,
): string[] {
  const words: Word[] = [];
  const free = (i: number) => isSpace(text[i]) && atomAt[i] < 0;
  let i = start;
  while (i < end && free(i)) i++;
  // The first line's indentation matters only when it does not start the
  // paragraph: a line after display math keeps the original's indentation.
  let indent = lead !== null ? lead : text.slice(start, i);
  let hardBefore = false;
  while (i < end) {
    const wordStart = i;
    while (i < end && !free(i)) i++;
    let word = text.slice(wordStart, i).replace(/\n/g, " ");
    const atom = atomAt[wordStart] >= 0 ? atoms[atomAt[wordStart]] : undefined;
    // A "$" that is not math here could become math once lines are joined
    // (a span cannot hold a line break); "\$" renders as "$".
    if (!atom && word.startsWith("$") && INLINE_MATH.test(text.slice(wordStart, end).replace(/\n/g, " "))) word = `\\${word}`;
    words.push({ text: word, hardBefore, breakAfter: "", indent, endsLine: true });
    const gapStart = i;
    while (i < end && free(i)) i++;
    if (i < end && !text.slice(gapStart, i).includes("\n")) words[words.length - 1].endsLine = false;
    hardBefore = false;
    indent = "";
    for (let p = gapStart; p < i; p++) {
      if (!breaks.has(p)) continue;
      // The break marker (trailing spaces, or nothing when the backslash is
      // part of the word) stays on its line; the next line keeps its
      // indentation, which may be what kept it from reading as a block.
      words[words.length - 1].breakAfter = text.slice(gapStart, p);
      hardBefore = true;
      indent = text.slice(p + 1, i);
      break;
    }
  }
  // A hard break right after this text (before kept lines) stays too.
  if (breaks.has(end) && words.length > 0) {
    words[words.length - 1].breakAfter = text.slice(start + text.slice(start, end).trimEnd().length, end);
  }

  const lines: string[] = [];
  let units: string[] = [];
  const flush = () => {
    let current = "";
    for (const unit of units) {
      if (current === "") current = unit;
      else if (width(current) + 1 + width(unit) <= avail) current += ` ${unit}`;
      else {
        lines.push(current);
        current = unit;
      }
    }
    if (units.length > 0) lines.push(current);
    units = [];
  };
  // A line also must not end right after a block-start word that begins it
  // ("--- a" is a paragraph, "---" alone a rule; "<span> a" is text, "<span>"
  // alone an HTML block), so the first unit of a line takes words until it
  // holds one that is not a block start. A bare list marker is the opposite:
  // it begins a line of its own in the source (an empty item cannot
  // interrupt a paragraph, "+ a" could), so it keeps that line to itself.
  let absorbing = false;
  words.forEach((word, k) => {
    if (k === 0 || word.hardBefore) {
      flush();
      // A line that starts with "%%" would read as a cell marker; "\%"
      // renders as "%".
      units.push(word.indent + (word.text.startsWith("%%") ? `\\${word.text}` : word.text) + word.breakAfter);
      absorbing = BLOCK_START.test(word.text);
      if ((lead === null || k > 0) && word.endsLine && /^(?:[-+*]|\d{1,9}[.)])$/.test(word.text)) {
        flush();
        absorbing = false;
      }
      return;
    }
    const startsBlock = BLOCK_START.test(word.text);
    // After a bare marker's line the word began a line in the source too.
    if (units.length > 0 && (absorbing || startsBlock || endsWithBackslash(words[k - 1].text))) {
      units[units.length - 1] += ` ${word.text}${word.breakAfter}`;
      absorbing = absorbing && startsBlock;
    } else {
      units.push(word.text + word.breakAfter);
      absorbing = false;
    }
  });
  flush();
  return lines;
}
