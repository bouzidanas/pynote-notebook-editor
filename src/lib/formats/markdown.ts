import {
  type DocCell,
  type JsonObject,
  type NotebookDocument,
  PYNOTE_KERNELSPEC,
  PYNOTE_LANGUAGE_INFO,
  cloneJson,
} from "./document";
import { assignCellIds } from "./ids";
import type { ParseResult } from "./ipynb";

// Markdown export: a readable .md of the notebook (code as fenced python
// blocks), or, in pair mode, the prose half of a .py/.md pair where each cell
// is marked by an invisible HTML comment anchor. The specification is
// docs/formats/exports.md.

export interface MarkdownExportOptions {
  includeCode: boolean;
  /** Pair mode: anchors for every cell, code cells as anchors only. */
  pairAnchors?: boolean;
  /** Pair mode: file name of the code half, mentioned in the first line. */
  pairedWith?: string;
}

// `<!-- cell ID -->`, `<!-- code ID -->` or `<!-- raw ID -->` on a line of
// its own (trailing blanks allowed, since editors add them).
const ANCHOR = /^<!-- (cell|code|raw) ([A-Za-z0-9_-]{1,64}) -->[ \t]*$/;

// A prose line that reads exactly like an anchor gets one more space after
// "<!--" when written and loses it when read, so it can never be taken for
// an anchor. The mapping is reversible: every line of this shape with one or
// more spaces after "<!--" gains one. Both render as the same invisible
// comment.
const ANCHOR_LIKE = /^<!--( +)(?:cell|code|raw) [A-Za-z0-9_-]{1,64} -->[ \t]*$/;
const escapeAnchors = (source: string) => source.split("\n").map((line) => (ANCHOR_LIKE.test(line) ? `<!-- ${line.slice(4)}` : line)).join("\n");
const unescapeAnchor = (line: string) => (ANCHOR_LIKE.test(line) && line.startsWith("<!--  ") ? `<!--${line.slice(5)}` : line);

const NOTE = /^<!-- PyNote: .*-->[ \t]*$/;

const toLf = (text: string) => text.replace(/\r\n?/g, "\n");

const longestBacktickRun = (text: string): number => {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return longest;
};

const fenced = (source: string, info: string): string => {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(source) + 1));
  return source === "" ? `${fence}${info}\n${fence}` : `${fence}${info}\n${source}\n${fence}`;
};

// Raw cell formats as fence info strings, and back.
const RAW_INFO = new Map([["text/latex", "latex"], ["text/restructuredtext", "rst"], ["text/html", "html"]]);
const RAW_FORMAT = new Map([...RAW_INFO].map(([format, info]) => [info, format]));
const rawInfo = (cell: DocCell) => (typeof cell.metadata.format === "string" && RAW_INFO.get(cell.metadata.format)) || "text";

// A file name inside an HTML comment: on one line, unable to end the comment.
const commentSafe = (text: string) => text.replace(/[\r\n\u2028\u2029\u0085]+/g, " ").replace(/-->/g, "- ->");

/** Export a notebook as Markdown (deterministic, LF, one final newline). */
export function exportMarkdown(doc: NotebookDocument, options: MarkdownExportOptions): string {
  const blocks: string[] = [];
  if (options.pairAnchors) {
    const where = options.pairedWith === undefined ? "the paired .py file" : commentSafe(options.pairedWith);
    blocks.push(`<!-- PyNote: this is the prose half of a notebook whose code is in ${where}. -->`);
    for (const cell of doc.cells) {
      const source = toLf(cell.source);
      if (cell.type === "markdown") blocks.push(source === "" ? `<!-- cell ${cell.id} -->` : `<!-- cell ${cell.id} -->\n${escapeAnchors(source)}`);
      else if (cell.type === "code") blocks.push(`<!-- code ${cell.id} -->`);
      else blocks.push(`<!-- raw ${cell.id} -->\n${fenced(source, rawInfo(cell))}`);
    }
  } else {
    for (const cell of doc.cells) {
      const source = toLf(cell.source);
      if (cell.type === "markdown") {
        if (source.trim() !== "") blocks.push(escapeAnchors(source));
      } else if (cell.type === "code") {
        if (options.includeCode) blocks.push(fenced(source, "python"));
      } else {
        blocks.push(fenced(source, rawInfo(cell)));
      }
    }
  }
  if (blocks.length === 0) return "";
  // One final newline: trailing line breaks of the last cell are not kept.
  return `${blocks.join("\n\n").replace(/\n+$/, "")}\n`;
}

// --- Parse -------------------------------------------------------------------

// A fence opener (CommonMark: up to three spaces of indentation; a backtick
// fence's info string has no backticks) and the closer that matches it.
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const opensFence = (line: string): { fence: string; indent: string; info: string } | null => {
  const m = FENCE_OPEN.exec(line);
  if (!m || (m[2][0] === "`" && m[3].includes("`"))) return null;
  return { indent: m[1], fence: m[2], info: m[3].trim() };
};
const closesFence = (line: string, fence: string): boolean =>
  new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`).test(line);

/** Index of the line that closes the fence opened at `open`, or -1. */
const fenceEnd = (lines: string[], open: number, fence: string): number => {
  for (let j = open + 1; j < lines.length; j++) if (closesFence(lines[j], fence)) return j;
  return -1;
};

/** Whether the text has a pair anchor outside fenced code blocks. */
function hasAnchors(lines: string[]): boolean {
  for (let i = 0; i < lines.length; i++) {
    const open = opensFence(lines[i]);
    if (open) {
      const end = fenceEnd(lines, i, open.fence);
      if (end < 0) return false; // an unclosed fence runs to the end
      i = end;
    } else if (ANCHOR.test(lines[i])) {
      return true;
    }
  }
  return false;
}

export interface MarkdownCells {
  /** "pair" when the text has cell anchors; then every code cell is an anchor. */
  mode: "pair" | "plain";
  cells: Array<Omit<DocCell, "id"> & { id?: string; line: number }>;
  warnings: string[];
}

/** The cells of a Markdown text, before ids are made unique. */
export function readMarkdownCells(input: string): MarkdownCells {
  const lines = toLf(input.replace(/^\ufeff/, "")).split("\n");
  // A pair half starts with PyNote's note (all it has for an empty notebook)
  // or, edited by hand, at least has anchors.
  return NOTE.test(lines[0]) || hasAnchors(lines) ? readPair(lines) : readPlain(lines);
}

// The one blank line that separates two blocks, at the end of a region, is
// not part of the cell; other blank lines are kept exactly.
const dropSeparator = (region: string[]) => (region.length > 0 && region[region.length - 1] === "" ? region.slice(0, -1) : region);
const isBlank = (region: string[]) => region.every((line) => line.trim() === "");

function readPair(lines: string[]): MarkdownCells {
  const cells: MarkdownCells["cells"] = [];
  const warnings: string[] = [];
  const nextAnchor = (from: number) => {
    let j = from;
    while (j < lines.length && !ANCHOR.test(lines[j])) j++;
    return j;
  };
  // Prose that belongs to no anchor (typed by hand) becomes a new markdown
  // cell rather than being lost.
  const stray = (from: number, to: number, after: string) => {
    const region = lines.slice(from, to);
    if (isBlank(region)) return;
    while (region[0].trim() === "") region.shift();
    while (region[region.length - 1].trim() === "") region.pop();
    cells.push({ type: "markdown", source: region.map(unescapeAnchor).join("\n"), metadata: {}, line: from + 1 });
    warnings.push(`Line ${from + 1}: text ${after} became a new markdown cell.`);
  };

  const start = NOTE.test(lines[0] ?? "") ? 1 : 0;
  let i = nextAnchor(start);
  stray(start, i, "before the first cell anchor");
  while (i < lines.length) {
    const [, kind, id] = ANCHOR.exec(lines[i])!;
    const line = i + 1;
    if (kind === "cell") {
      const end = nextAnchor(i + 1);
      cells.push({ id, type: "markdown", source: dropSeparator(lines.slice(i + 1, end)).map(unescapeAnchor).join("\n"), metadata: {}, line });
      i = end;
    } else if (kind === "code") {
      // The code itself is in the .py half; mergePair fills it in.
      cells.push({ id, type: "code", source: "", metadata: {}, line });
      const end = nextAnchor(i + 1);
      stray(i + 1, end, `after the anchor of code cell ${id}`);
      i = end;
    } else {
      const open = opensFence(lines[i + 1] ?? "");
      const close = open ? fenceEnd(lines, i + 1, open.fence) : -1;
      if (open && close >= 0) {
        const metadata: JsonObject = {};
        const format = RAW_FORMAT.get(open.info);
        if (format) metadata.format = format;
        cells.push({ id, type: "raw", source: lines.slice(i + 2, close).join("\n"), metadata, line });
        const end = nextAnchor(close + 1);
        stray(close + 1, end, `after raw cell ${id}`);
        i = end;
      } else {
        const end = nextAnchor(i + 1);
        cells.push({ id, type: "raw", source: dropSeparator(lines.slice(i + 1, end)).join("\n"), metadata: {}, line });
        warnings.push(`Line ${line}: raw cell ${id} is not a fenced block; kept its text as is.`);
        i = end;
      }
    }
  }
  return { mode: "pair", cells, warnings };
}

// Python code blocks start at the left margin, as PyNote writes them and as
// jupytext reads them; an indented fence belongs to a list or quote.
const PYTHON_INFO = /^python/i;

function readPlain(lines: string[]): MarkdownCells {
  const cells: MarkdownCells["cells"] = [];
  let proseStart = 0;
  let afterCode = false;
  const prose = (to: number) => {
    let region = lines.slice(proseStart, to);
    // Exactly the blank line after the previous code block and the one before
    // the next block (or the empty string after the final newline).
    if (afterCode && region[0] === "") region = region.slice(1);
    region = dropSeparator(region);
    if (!isBlank(region)) cells.push({ type: "markdown", source: region.map(unescapeAnchor).join("\n"), metadata: {}, line: proseStart + 1 });
  };
  for (let i = 0; i < lines.length; i++) {
    const open = opensFence(lines[i]);
    if (!open) continue;
    const close = fenceEnd(lines, i, open.fence);
    const end = close < 0 ? lines.length : close;
    if (open.indent === "" && PYTHON_INFO.test(open.info)) {
      prose(i);
      cells.push({ type: "code", source: lines.slice(i + 1, end).join("\n"), metadata: {}, line: i + 1 });
      proseStart = end + 1;
      afterCode = true;
    }
    i = end;
  }
  if (proseStart < lines.length) prose(lines.length);
  return { mode: "plain", cells, warnings: [] };
}

const defaultMetadata = (): JsonObject => ({ kernelspec: cloneJson(PYNOTE_KERNELSPEC), language_info: cloneJson(PYNOTE_LANGUAGE_INFO) });

/** Parse Markdown (a pair's prose half, or any Markdown file). Never throws. */
export function parseMarkdown(input: string): ParseResult<NotebookDocument> {
  try {
    const { cells, warnings } = readMarkdownCells(input);
    return { ok: true, value: { cells: assignCellIds(cells, warnings), metadata: defaultMetadata() }, warnings };
  } catch (err) {
    return { ok: false, error: `Could not read the Markdown file: ${err instanceof Error ? err.message : String(err)}` };
  }
}
