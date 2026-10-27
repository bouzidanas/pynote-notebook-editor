import { parse as parseYaml } from "yaml";
import {
  type DocCell,
  type DocCellType,
  type JsonObject,
  type JsonValue,
  type NotebookDocument,
  PYNOTE_KERNELSPEC,
  PYNOTE_LANGUAGE_INFO,
  cloneJson,
  isJsonObject,
  setOwn,
} from "./document";
import { markdownToComment } from "./comment-wrap";
import { assignCellIds, isValidCellId } from "./ids";
import type { ParseResult } from "./ipynb";
import { EXECUTION_MODES, type ExecutionModeName } from "./pynote-settings";

// Python script export in the "py:percent" format (`# %%` cell markers, read
// by VS Code, PyCharm, Spyder and jupytext) and the matching reader. The
// specification is docs/formats/exports.md; the format tests hold this module
// to it. The script runs top to bottom: with dependency information, code
// cells are emitted in an order where every name is defined before it is
// used, which is how reactive mode runs a notebook.

export interface DependencyInfo {
  definitions: readonly string[];
  references: readonly string[];
}

export interface PythonExportOptions {
  /** Markdown and raw cells as comment cells; false writes code cells only. */
  includeMarkdown: boolean;
  /** By cell id. Absent: notebook order. */
  dependencies?: ReadonlyMap<string, DependencyInfo>;
  /** Pair mode: code markers carry `id="<cell id>"`. */
  cellIds?: boolean;
  /** Pair mode: file name of the markdown half, mentioned in the header. */
  pairedWith?: string;
  /** Comment wrapping width; default 79. */
  lineWidth?: number;
}

export interface PythonExportResult {
  text: string;
  /** Code cell ids in emitted order. */
  codeOrder: string[];
  /**
   * Each code cell's marker line in `text` (1-based), in emitted order. Code
   * is written as it is, so a line of code can look like a marker: only the
   * exporter knows where each cell starts.
   */
  codeStarts: Array<{ id: string; line: number }>;
  /** Code cell ids emitted at a different position (among the code cells) than in the notebook. */
  moved: string[];
  /** Why notebook order was kept despite dependencies. */
  orderNote?: "duplicates" | "cycle";
  duplicateDefinitions: Array<{ name: string; cellIds: string[] }>;
}

// A line that starts a cell: "#", at most one space, "%%", then a space, a
// tab or the end of the line. Every tool that reads py:percent accepts this
// form; a code line of this shape cannot be written losslessly.
export const CELL_MARKER = /^# ?%%(?=[ \t]|$)/;

// Comment lines of markdown and raw cells whose text starts with "%%" (after
// optional spaces) would read as markers, so the writer adds one space after
// "# " and the reader removes it. The mapping is reversible: a text that
// starts with spaces and "%%" always gets one more space.
const escapePercent = (text: string) => (/^ *%%/.test(text) ? ` ${text}` : text);
const unescapePercent = (text: string) => (/^ +%%/.test(text) ? text.slice(1) : text);

const toLf = (text: string) => text.replace(/\r\n?/g, "\n");

// Names starting with "_" are cell-local in reactive mode, like marimo.
const isShared = (name: string) => !name.startsWith("_");

// --- Order -------------------------------------------------------------------

interface CodeOrder {
  order: DocCell[];
  orderNote?: "duplicates" | "cycle";
  duplicateDefinitions: Array<{ name: string; cellIds: string[] }>;
}

/** Binary min-heap of notebook positions. */
class MinHeap {
  private items: number[] = [];
  get size() { return this.items.length; }
  push(value: number) {
    const items = this.items;
    items.push(value);
    for (let i = items.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (items[parent] <= items[i]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l] < items[m]) m = l;
        if (r < items.length && items[r] < items[m]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
}

function planCodeOrder(code: DocCell[], dependencies: ReadonlyMap<string, DependencyInfo> | undefined): CodeOrder {
  if (!dependencies) return { order: code, duplicateDefinitions: [] };

  const definers = new Map<string, number[]>();
  code.forEach((cell, position) => {
    for (const name of new Set(dependencies.get(cell.id)?.definitions ?? [])) {
      if (!isShared(name)) continue;
      const list = definers.get(name);
      if (list) list.push(position);
      else definers.set(name, [position]);
    }
  });
  const duplicateDefinitions = [...definers]
    .filter(([, positions]) => positions.length > 1)
    .map(([name, positions]) => ({ name, cellIds: positions.map((p) => code[p].id) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // Reordering relies on reactive mode's rule that each name has one
  // defining cell; with several, the notebook's order is the only safe one.
  if (duplicateDefinitions.length > 0) return { order: code, orderNote: "duplicates", duplicateDefinitions };

  // Edge A -> B when B reads a name A defines.
  const successors = code.map(() => new Set<number>());
  const indegree = code.map(() => 0);
  code.forEach((cell, b) => {
    for (const name of new Set(dependencies.get(cell.id)?.references ?? [])) {
      const a = isShared(name) ? definers.get(name)?.[0] : undefined;
      if (a === undefined || a === b || successors[a].has(b)) continue;
      successors[a].add(b);
      indegree[b]++;
    }
  });

  // Kahn's algorithm, always taking the earliest ready cell: the result is
  // the notebook order whenever that order is already valid, and otherwise
  // moves as little as the dependencies require.
  const ready = new MinHeap();
  indegree.forEach((d, position) => { if (d === 0) ready.push(position); });
  const order: DocCell[] = [];
  while (ready.size > 0) {
    const a = ready.pop();
    order.push(code[a]);
    for (const b of successors[a]) if (--indegree[b] === 0) ready.push(b);
  }
  if (order.length < code.length) return { order: code, orderNote: "cycle", duplicateDefinitions };
  return { order, duplicateDefinitions };
}

// --- Export ------------------------------------------------------------------

// The pair note is part of the header (YAML comments): text between the
// header and the first marker would be read back as a cell, by PyNote and by
// jupytext alike.
const oneLine = (text: string) => text.replace(/[\r\n\u2028\u2029\u0085]+/g, " ").replace(/\0/g, "\uFFFD");

// The execution mode the header records. Reactive, since the script runs its
// cells in an order where every name is defined before it is used, as
// reactive mode does. When the notebook's order had to be kept instead (a name
// defined in several cells, or a cycle), the notebook's own mode: reactive
// mode would reject that notebook, so reopening the script must not switch it.
function headerMode(doc: NotebookDocument, orderNote: PythonExportResult["orderNote"]): string | undefined {
  if (!orderNote) return "reactive";
  const settings = doc.metadata.PyNote;
  const mode = isJsonObject(settings) ? settings.executionMode : undefined;
  return EXECUTION_MODES.includes(mode as ExecutionModeName) ? (mode as string) : undefined;
}

function header(pairedWith: string | undefined, mode: string | undefined): string {
  const lines = ["# ---", ...(mode ? ["# pynote:", `#   executionMode: ${mode}`] : ["# pynote: {}"])];
  if (pairedWith !== undefined) {
    lines.push(`# # This is the code half of a notebook whose prose is in ${oneLine(pairedWith)}.`);
  }
  lines.push("# ---");
  return lines.join("\n");
}

const commentLines = (lines: string[]) => lines.map((line) => (line === "#" ? line : `# ${escapePercent(line.slice(2))}`));

function cellBlock(cell: DocCell, options: PythonExportOptions): string {
  if (cell.type === "code") {
    const marker = options.cellIds ? `# %% id=${JSON.stringify(cell.id)}` : "# %%";
    const source = toLf(cell.source);
    return source === "" ? marker : `${marker}\n${source}`;
  }
  const lines = cell.type === "markdown"
    ? markdownToComment(cell.source, options.lineWidth ?? 79)
    : toLf(cell.source).replace(/\0/g, "\uFFFD").split("\n").map((line) => (line === "" ? "#" : `# ${line}`));
  // An empty raw source is no lines, not one empty line.
  const body = cell.type === "raw" && cell.source === "" ? [] : commentLines(lines);
  return [`# %% [${cell.type}]`, ...body].join("\n");
}

/** Export a notebook as a py:percent script (deterministic, LF, one final newline). */
export function exportPython(doc: NotebookDocument, options: PythonExportOptions): PythonExportResult {
  const code = doc.cells.filter((cell) => cell.type === "code");
  const { order, orderNote, duplicateDefinitions } = planCodeOrder(code, options.dependencies);

  // Prose before the first code cell stays at the top, prose after the last
  // one at the end, and every other prose cell travels with the code cell
  // that follows it.
  const top: DocCell[] = [];
  const tail: DocCell[] = [];
  const before = new Map<DocCell, DocCell[]>();
  let pending: DocCell[] = [];
  let seenCode = false;
  for (const cell of doc.cells) {
    if (cell.type !== "code") {
      if (options.includeMarkdown) pending.push(cell);
      continue;
    }
    if (seenCode) before.set(cell, pending);
    else top.push(...pending);
    pending = [];
    seenCode = true;
  }
  if (seenCode) tail.push(...pending);
  else top.push(...pending);

  const emitted = [...top, ...order.flatMap((cell) => [...(before.get(cell) ?? []), cell]), ...tail];
  const blocks = [header(options.pairedWith, headerMode(doc, orderNote)), ...emitted.map((cell) => cellBlock(cell, options))];
  const text = blocks.join("\n\n");

  // Blocks are separated by one blank line; a block starts with its marker.
  const codeStarts: PythonExportResult["codeStarts"] = [];
  let line = 1;
  blocks.forEach((block, i) => {
    const cell = emitted[i - 1]; // blocks[0] is the header
    if (cell?.type === "code") codeStarts.push({ id: cell.id, line });
    line += block.split("\n").length + 1;
  });

  return {
    // The file ends with exactly one newline, so trailing line breaks of the
    // last cell are not kept (documented).
    text: `${text.replace(/\n+$/, "")}\n`,
    codeOrder: order.map((cell) => cell.id),
    codeStarts,
    moved: order.filter((cell, i) => code[i] !== cell).map((cell) => cell.id),
    ...(orderNote ? { orderNote } : {}),
    duplicateDefinitions,
  };
}

// --- Parse -------------------------------------------------------------------

/** Scan one JSON string, object or array at `start`; index past it or -1. */
function scanJson(text: string, start: number): number {
  const first = text[start];
  if (first === '"') {
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === "\\") i++;
      else if (text[i] === '"') return i + 1;
    }
    return -1;
  }
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const end = scanJson(text, i);
      if (end < 0) return -1;
      i = end - 1;
    } else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const parseValue = (raw: string): JsonValue => {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw; // a bare word reads as a string
  }
};

interface Marker {
  type: DocCellType;
  id?: string;
  metadata: JsonObject;
}

const TYPE_TAGS = new Map<string, DocCellType>([["[markdown]", "markdown"], ["[md]", "markdown"], ["[raw]", "raw"]]);
const KEY = /^([A-Za-z_][\w.-]*)=/;
const isBlank = (ch: string) => ch === " " || ch === "\t";

/**
 * The text after "%%" on a marker line, in jupytext's syntax: an optional
 * title, an optional [markdown], [md] or [raw], and key=value metadata whose
 * values are JSON (or bare words). A JSON object may stand for the metadata.
 */
function readMarker(rest: string, warnings: string[], where: string): Marker {
  const marker: Marker = { type: "code", metadata: {} };
  const title: string[] = [];
  let i = 0;
  while (i < rest.length) {
    while (i < rest.length && isBlank(rest[i])) i++;
    if (i >= rest.length) break;
    const word = /^[^ \t]+/.exec(rest.slice(i))![0];
    const key = KEY.exec(rest.slice(i));
    const tag = TYPE_TAGS.get(word);
    if (tag && marker.type === "code") {
      marker.type = tag;
      i += word.length;
    } else if (key) {
      const valueStart = i + key[0].length;
      const ch = rest[valueStart];
      let end = ch === '"' || ch === "{" || ch === "[" ? scanJson(rest, valueStart) : -1;
      if (end < 0) {
        end = valueStart;
        while (end < rest.length && !isBlank(rest[end])) end++;
      }
      const value = parseValue(rest.slice(valueStart, end));
      if (key[1] === "id") {
        if (isValidCellId(value)) marker.id = value;
        else warnings.push(`${where}: ignored an invalid cell id ${JSON.stringify(rest.slice(valueStart, end))}.`);
      } else {
        setOwn(marker.metadata, key[1], value);
      }
      i = end;
    } else if (word.startsWith("{") && scanJson(rest, i) > 0) {
      const end = scanJson(rest, i);
      const value = parseValue(rest.slice(i, end));
      if (isJsonObject(value)) for (const [k, v] of Object.entries(value)) setOwn(marker.metadata, k, v);
      else title.push(rest.slice(i, end));
      i = end;
    } else {
      title.push(word);
      i += word.length;
    }
  }
  // jupytext keeps a marker's title in the cell metadata; so does PyNote.
  if (title.length > 0) setOwn(marker.metadata, "title", title.join(" "));
  return marker;
}

/** Strip the comment prefix of a markdown or raw cell line. */
const uncomment = (line: string) => unescapePercent(line.startsWith("# ") ? line.slice(2) : line.startsWith("#") ? line.slice(1) : line);

const HEADER_LINE = /^#[ \t]*---[ \t]*$/;

/** The YAML header's settings and the index of the first line after it, if there is one. */
function readHeader(lines: string[], warnings: string[]): { end: number; settings: JsonObject } | null {
  if (!HEADER_LINE.test(lines[0] ?? "")) return null;
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].startsWith("#")) return null;
    if (HEADER_LINE.test(lines[i])) {
      close = i;
      break;
    }
  }
  if (close < 0) return null;
  let yaml: unknown;
  try {
    yaml = parseYaml(lines.slice(1, close).map((line) => (line.startsWith("# ") ? line.slice(2) : line.slice(1))).join("\n"));
  } catch {
    return null; // comment lines that only look like a header stay code
  }
  // Only a mapping is a header; "# ---\n# Title\n# ---" is a decorated comment.
  if (!isJsonObject(yaml)) return null;
  const settings: JsonObject = {};
  const pynote = yaml.pynote;
  if (pynote !== undefined) {
    if (isJsonObject(pynote)) {
      const mode = pynote.executionMode;
      if (EXECUTION_MODES.includes(mode as ExecutionModeName)) settings.executionMode = mode as string;
      else if (mode !== undefined) warnings.push(`Ignored an unknown execution mode ${JSON.stringify(mode)} in the header.`);
    } else {
      warnings.push("Ignored a 'pynote' header entry that is not a mapping.");
    }
  }
  // Other keys (jupytext's "jupyter:" block, titles) are not PyNote settings.
  return { end: close + 1, settings };
}

/** Parse a py:percent script (or any Python script). Never throws. */
export function parsePython(input: string): ParseResult<NotebookDocument> {
  try {
    return parse(input);
  } catch (err) {
    return { ok: false, error: `Could not read the script: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function parse(input: string): ParseResult<NotebookDocument> {
  const warnings: string[] = [];
  const lines = toLf(input.replace(/^\ufeff/, "")).split("\n");

  const metadata: JsonObject = { kernelspec: cloneJson(PYNOTE_KERNELSPEC), language_info: cloneJson(PYNOTE_LANGUAGE_INFO) };
  let i = 0;
  const head = readHeader(lines, warnings);
  if (head) {
    if (Object.keys(head.settings).length > 0) metadata.PyNote = head.settings;
    i = head.end;
    if (lines[i] === "") i++; // the blank line after the header
  }

  type RawCell = { id?: string; type: DocCellType; source: string; metadata: JsonObject; line: number };
  const cells: RawCell[] = [];
  // A cell's text ends with the one blank line that separates it from the
  // next cell (or with the empty string after the file's final newline).
  // Only that line is dropped, so other blank lines are kept exactly.
  const regionEnd = (from: number) => {
    let j = from;
    while (j < lines.length && !CELL_MARKER.test(lines[j])) j++;
    return j;
  };
  const body = (from: number, to: number) => {
    const region = lines.slice(from, to);
    if (region.length > 0 && region[region.length - 1] === "") region.pop();
    return region;
  };

  // Text before the first marker (a plain script is all such text).
  const first = regionEnd(i);
  const preamble = body(i, first);
  if (preamble.some((line) => line.trim() !== "")) {
    cells.push({ type: "code", source: preamble.join("\n"), metadata: {}, line: i + 1 });
  }

  for (i = first; i < lines.length; ) {
    const where = `Line ${i + 1}`;
    const marker = readMarker(lines[i].replace(CELL_MARKER, ""), warnings, where);
    const end = regionEnd(i + 1);
    const region = body(i + 1, end);
    const source = marker.type === "code" ? region.join("\n") : region.map(uncomment).join("\n");
    cells.push({ id: marker.id, type: marker.type, source, metadata: marker.metadata, line: i + 1 });
    i = end;
  }

  return { ok: true, value: { cells: assignCellIds(cells, warnings), metadata }, warnings };
}
