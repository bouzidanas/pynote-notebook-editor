import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
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
import { isValidCellId, newCellId } from "./ids";
import type { ParseResult } from "./ipynb";
import { stableStringify } from "./json-stable";

// The .pynote format: Markdown with YAML front matter, explicit cell markers
// and an optional trailer. The specification is docs/formats/pynote.md; this
// module implements it exactly, and the format tests hold both to the
// round-trip guarantee:
//
//   parsePynote(serializePynote(doc)) equals doc
//
// with one documented normalization: an empty undo history is not stored.

export const PYNOTE_FORMAT_VERSION = 1;

// --- Small helpers -----------------------------------------------------------

const deepEqual = (a: JsonValue | undefined, b: JsonValue | undefined): boolean =>
  JSON.stringify(a === undefined ? null : sortKeys(a)) === JSON.stringify(b === undefined ? null : sortKeys(b));

const sortKeys = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isJsonObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
};

// JSON on one line, with characters escaped that could end an HTML comment or
// split the line in some editors. Only string contents can contain them, so
// replacing them in the JSON text keeps it valid JSON.
const inlineJson = (value: JsonValue): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const longestBacktickRun = (text: string): number => {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return longest;
};

const fenceFor = (source: string) => "`".repeat(Math.max(3, longestBacktickRun(source) + 1));

// --- Attributes --------------------------------------------------------------

// Attribute names that map to keys under a cell's metadata.pynote. `meta`
// carries every other metadata key, and `source` holds a source that cannot be
// written as plain lines (see UNSAFE_SOURCE).
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const RESERVED_ATTRS = new Set(["meta", "source"]);

// Sources with a carriage return or a NUL are stored as an escaped `source`
// attribute instead of plain lines: line-ending conversion (git autocrlf,
// editors) would rewrite a raw "\r", and git treats a file with a NUL byte as
// binary. Every other character is written as is.
const UNSAFE_SOURCE = /[\r\0]/;
const KNOWN_CELL_KEYS = ["autorun", "autorunOnRefresh", "placeholder", "codeview"];

interface CellAttrs {
  id?: string;
  isCell: boolean; // `.cell` or an id was present
  values: Map<string, JsonValue>;
}

const attrsFor = (cell: DocCell): string => {
  const parts: string[] = [];
  const meta: JsonObject = { ...cell.metadata };
  const py = meta.pynote;
  const pyKeys = isJsonObject(py) ? Object.keys(py) : [];
  // PyNote's own cell settings read best as named attributes; fall back to
  // keeping them inside `meta` when a key cannot be an attribute name.
  if (isJsonObject(py) && pyKeys.length > 0 && pyKeys.every((k) => ATTR_NAME.test(k) && !RESERVED_ATTRS.has(k))) {
    const ordered = [...KNOWN_CELL_KEYS.filter((k) => k in py), ...pyKeys.filter((k) => !KNOWN_CELL_KEYS.includes(k))];
    for (const key of ordered) parts.push(`${key}=${inlineJson(py[key])}`);
    delete meta.pynote;
  } else if (isJsonObject(py) && pyKeys.length === 0) {
    // An empty `pynote` object stays in `meta` so it round-trips.
  }
  if (Object.keys(meta).length > 0) parts.push(`meta=${inlineJson(meta)}`);
  return parts.map((p) => ` ${p}`).join("");
};

// Scan one JSON value starting at `start`; returns the index just past it, or
// -1 if the text does not hold a complete value there.
const scanJson = (text: string, start: number): number => {
  const first = text[start];
  if (first === '"') {
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === "\\") { i++; continue; }
      if (text[i] === '"') return i + 1;
    }
    return -1;
  }
  if (first === "{" || first === "[") {
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
  return -1;
};

const parseValue = (raw: string): JsonValue => {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw; // a bare word is a string (handy when editing by hand)
  }
};

/** Parse the inside of an attribute block (no braces) or a cell comment tail. */
const parseAttrs = (text: string, allowBareId: boolean): CellAttrs | null => {
  const attrs: CellAttrs = { isCell: false, values: new Map() };
  let i = 0;
  let first = true;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    if (text[i] === "#" || (first && allowBareId && /[A-Za-z0-9_-]/.test(text[i]) && !/^[A-Za-z_][A-Za-z0-9_-]*=/.test(text.slice(i)))) {
      const start = text[i] === "#" ? i + 1 : i;
      let end = start;
      while (end < text.length && !/\s/.test(text[end])) end++;
      const id = text.slice(start, end);
      if (!isValidCellId(id) || attrs.id !== undefined) return null;
      attrs.id = id;
      attrs.isCell = true;
      i = end;
    } else if (text.startsWith(".cell", i) && (i + 5 === text.length || /\s/.test(text[i + 5]))) {
      attrs.isCell = true;
      i += 5;
    } else {
      const eq = text.indexOf("=", i);
      if (eq < 0) return null;
      const name = text.slice(i, eq);
      if (!ATTR_NAME.test(name) || attrs.values.has(name)) return null;
      let end: number;
      const startCh = text[eq + 1];
      if (startCh === '"' || startCh === "{" || startCh === "[") {
        end = scanJson(text, eq + 1);
        if (end < 0) return null;
      } else {
        end = eq + 1;
        while (end < text.length && !/\s/.test(text[end])) end++;
      }
      attrs.values.set(name, parseValue(text.slice(eq + 1, end)));
      i = end;
    }
    first = false;
  }
  return attrs;
};

// --- Markers -----------------------------------------------------------------

const FENCE_OPENER = /^(`{3,})(python|raw|markdown)[ \t]*\{(.*)\}[ \t]*$/;
const COMMENT_MARKER = /^<!-- cell(?:[ \t]+(.*?))?[ \t]*-->$/;
const TRAILER_START = /^<!-- pynote[ \t]*$/;

type Marker =
  | { kind: "fence"; fence: string; type: DocCellType; attrs: CellAttrs }
  | { kind: "comment"; attrs: CellAttrs }
  | { kind: "trailer" };

const FENCE_TYPES: Record<string, DocCellType> = { python: "code", raw: "raw", markdown: "markdown" };

const readMarker = (line: string): Marker | null => {
  const fence = FENCE_OPENER.exec(line);
  if (fence) {
    const attrs = parseAttrs(fence[3], false);
    if (attrs && attrs.isCell) return { kind: "fence", fence: fence[1], type: FENCE_TYPES[fence[2]], attrs };
    return null;
  }
  const comment = COMMENT_MARKER.exec(line);
  if (comment) {
    const attrs = parseAttrs(comment[1] ?? "", true);
    if (attrs) return { kind: "comment", attrs };
    return null;
  }
  if (TRAILER_START.test(line)) return { kind: "trailer" };
  return null;
};

// A markdown source must be fenced when one of its lines would read as a
// marker, otherwise the plain form would split it.
const needsFence = (source: string) => source.split("\n").some((line) => readMarker(line) !== null);

// --- Serialize ---------------------------------------------------------------

const RESERVED_FRONT_MATTER_KEYS = new Set(["pynote", "metadata"]);
const KNOWN_NOTEBOOK_KEYS = ["executionMode", "autorun", "autorunOnRefresh", "codeHiddenPlaceholder", "showTrailingAddButtons", "codeview", "theme"];

const cellBlock = (cell: DocCell): string => {
  const attrs = attrsFor(cell);
  if (UNSAFE_SOURCE.test(cell.source)) {
    const escaped = `${attrs} source=${inlineJson(cell.source)}`;
    if (cell.type === "markdown") return `<!-- cell ${cell.id}${escaped} -->`;
    const info = cell.type === "code" ? "python" : cell.type;
    return `\`\`\`${info} {#${cell.id}${escaped}}\n\`\`\``;
  }
  if (cell.type === "markdown" && !needsFence(cell.source)) {
    return `<!-- cell ${cell.id}${attrs} -->\n${cell.source}`;
  }
  const info = cell.type === "code" ? "python" : cell.type;
  const fence = fenceFor(cell.source);
  return `${fence}${info} {#${cell.id}${attrs}}\n${cell.source}\n${fence}`;
};

/** Serialize a document as .pynote text (deterministic, LF, final newline). */
export function serializePynote(doc: NotebookDocument): string {
  const front: Record<string, unknown> = { pynote: PYNOTE_FORMAT_VERSION };
  const rest: JsonObject = {};
  let history: JsonValue | undefined;

  for (const [key, value] of Object.entries(doc.metadata)) {
    if (key === "kernelspec" && deepEqual(value, PYNOTE_KERNELSPEC)) continue;
    if (key === "language_info" && deepEqual(value, PYNOTE_LANGUAGE_INFO)) continue;
    if (key !== "PyNote") setOwn(rest, key, cloneJson(value));
  }

  const py = doc.metadata.PyNote;
  if (isJsonObject(py)) {
    const settings: JsonObject = { ...py };
    if ("history" in settings) {
      history = settings.history;
      delete settings.history;
    }
    const keys = Object.keys(settings);
    if (keys.length === 0 && history === undefined) {
      rest.PyNote = {}; // keep an explicitly empty settings object
    } else if (keys.some((k) => RESERVED_FRONT_MATTER_KEYS.has(k))) {
      rest.PyNote = cloneJson(settings); // cannot sit at the top level; history still goes to the trailer
    } else {
      for (const key of [...KNOWN_NOTEBOOK_KEYS.filter((k) => k in settings), ...keys.filter((k) => !KNOWN_NOTEBOOK_KEYS.includes(k))]) {
        setOwn(front as JsonObject, key, cloneJson(settings[key]));
      }
    }
  } else if (py !== undefined) {
    rest.PyNote = cloneJson(py);
  }
  if (Object.keys(rest).length > 0) front.metadata = rest;

  // No block scalars: the yaml library writes some whitespace-only lines in
  // literal blocks that read back differently (" \n" becomes "\n"), while
  // double-quoted strings with escapes are always exact. No line folding and
  // no anchors either, so the output is stable and diff-friendly.
  const yaml = stringifyYaml(front, { lineWidth: 0, aliasDuplicateObjects: false, blockQuote: false });

  const trailer: JsonObject = {};
  const attachments: JsonObject = {};
  for (const cell of doc.cells) if (cell.attachments) setOwn(attachments, cell.id, cloneJson(cell.attachments));
  if (Object.keys(attachments).length > 0) trailer.attachments = attachments;
  // An empty history is not stored (the one normalization of this format).
  if (history !== undefined && !(Array.isArray(history) && history.length === 0)) trailer.history = cloneJson(history);

  const parts = [`---\n${yaml}---`, ...doc.cells.map(cellBlock)];
  if (Object.keys(trailer).length > 0) {
    const json = stableStringify(trailer).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
    parts.push(`<!-- pynote\n${json}\n-->`);
  }
  return `${parts.join("\n\n")}\n`;
}

// --- Parse -------------------------------------------------------------------

const cellMetadataFrom = (attrs: CellAttrs, warnings: string[], where: string): JsonObject => {
  const metadata: JsonObject = {};
  const meta = attrs.values.get("meta");
  if (meta !== undefined) {
    if (isJsonObject(meta)) for (const [key, value] of Object.entries(meta)) setOwn(metadata, key, cloneJson(value));
    else warnings.push(`${where}: ignored a "meta" attribute that is not a JSON object.`);
  }
  const pynote: JsonObject = isJsonObject(metadata.pynote) ? { ...metadata.pynote } : {};
  let hasPynoteAttrs = false;
  for (const [key, value] of attrs.values) {
    if (RESERVED_ATTRS.has(key)) continue;
    setOwn(pynote, key, cloneJson(value));
    hasPynoteAttrs = true;
  }
  if (hasPynoteAttrs) metadata.pynote = pynote;
  return metadata;
};

/** Parse .pynote text. Never throws: malformed input yields `{ ok: false }`. */
export function parsePynote(input: string): ParseResult<NotebookDocument> {
  const warnings: string[] = [];
  const text = input.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  // Front matter.
  if (lines[0] !== "---") return { ok: false, error: "A .pynote file starts with YAML front matter (a '---' line)." };
  const close = lines.indexOf("---", 1);
  if (close < 0) return { ok: false, error: "The front matter is not closed with a '---' line." };
  let front: unknown;
  try {
    // Each front matter line keeps its own newline: a "keep" block scalar
    // (|+, written by hand) includes trailing newlines up to the closing ---.
    front = parseYaml(lines.slice(1, close).map((line) => `${line}\n`).join(""));
  } catch (err) {
    return { ok: false, error: `The front matter is not valid YAML: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isJsonObject(front)) return { ok: false, error: "The front matter must be a YAML mapping." };
  const version = front.pynote;
  if (typeof version !== "number") return { ok: false, error: "The front matter has no 'pynote' format version." };
  if (version > PYNOTE_FORMAT_VERSION) {
    return { ok: false, error: `This file uses .pynote format ${version}; this version of PyNote reads format ${PYNOTE_FORMAT_VERSION}. Update PyNote to open it.` };
  }

  // Notebook metadata.
  const metadata: JsonObject = isJsonObject(front.metadata) ? cloneJson(front.metadata) : {};
  if (front.metadata !== undefined && !isJsonObject(front.metadata)) warnings.push("Ignored front matter 'metadata' that is not a mapping.");
  const settings: JsonObject = {};
  for (const [key, value] of Object.entries(front)) {
    if (!RESERVED_FRONT_MATTER_KEYS.has(key)) setOwn(settings, key, cloneJson(value as JsonValue));
  }
  if (Object.keys(settings).length > 0) {
    metadata.PyNote = isJsonObject(metadata.PyNote) ? { ...metadata.PyNote, ...settings } : settings;
  }
  if (!isJsonObject(metadata.kernelspec)) metadata.kernelspec = cloneJson(PYNOTE_KERNELSPEC);
  if (!isJsonObject(metadata.language_info)) metadata.language_info = cloneJson(PYNOTE_LANGUAGE_INFO);

  // Cells and trailer.
  type RawCell = { id?: string; type: DocCellType; source: string; metadata: JsonObject; line: number };
  const cells: RawCell[] = [];
  let trailer: JsonObject | null = null;
  // The file ends with "\n", so split() leaves one empty final element; it
  // plays the role of the separator after the last cell.
  let i = close + 1;
  if (lines[i] === "") i++;

  const regionEnd = (from: number): number => {
    let j = from;
    while (j < lines.length && readMarker(lines[j]) === null) j++;
    return j;
  };
  // A markdown region ends with the blank line that separates it from the
  // next cell (or the empty string after the file's final newline). Only that
  // blank line is dropped, so a hand edit that removed it loses no text.
  const regionSource = (region: string[]): string =>
    (region.length > 0 && region[region.length - 1] === "" ? region.slice(0, -1) : region).join("\n");
  // An escaped `source` attribute wins over the body (which the writer leaves empty).
  const sourceFrom = (attrs: CellAttrs, body: string, where: string): string => {
    const escaped = attrs.values.get("source");
    if (escaped === undefined) return body;
    if (typeof escaped !== "string") {
      warnings.push(`${where}: ignored a "source" attribute that is not a string.`);
      return body;
    }
    if (body !== "") warnings.push(`${where}: the cell has both a "source" attribute and a body; kept the attribute.`);
    return escaped;
  };

  while (i < lines.length) {
    const marker = readMarker(lines[i]);
    if (marker === null) {
      // Text without a marker (added by hand): an implicit markdown cell.
      const end = regionEnd(i);
      const source = regionSource(lines.slice(i, end));
      if (source.trim() !== "") {
        cells.push({ type: "markdown", source, metadata: {}, line: i + 1 });
        warnings.push(`Line ${i + 1}: text without a cell marker became a new markdown cell.`);
      }
      i = end;
      continue;
    }
    if (marker.kind === "trailer") {
      const end = lines.indexOf("-->", i + 1);
      if (end < 0) {
        warnings.push(`Line ${i + 1}: the trailer is not closed; ignored it.`);
        break;
      }
      try {
        const parsed = JSON.parse(lines.slice(i + 1, end).join("\n"));
        if (isJsonObject(parsed)) trailer = parsed;
        else warnings.push(`Line ${i + 1}: ignored a trailer that is not a JSON object.`);
      } catch {
        warnings.push(`Line ${i + 1}: ignored a trailer that is not valid JSON.`);
      }
      if (lines.slice(end + 1).some((l) => l.trim() !== "")) warnings.push(`Line ${end + 2}: ignored text after the trailer.`);
      break;
    }
    const where = `Line ${i + 1}`;
    if (marker.kind === "comment") {
      const end = regionEnd(i + 1);
      const source = sourceFrom(marker.attrs, regionSource(lines.slice(i + 1, end)), where);
      cells.push({ id: marker.attrs.id, type: "markdown", source, metadata: cellMetadataFrom(marker.attrs, warnings, where), line: i + 1 });
      i = end;
      continue;
    }
    // Fenced cell: the source is everything up to the closing fence, exactly.
    const closing = new RegExp(`^${marker.fence}\`*[ \\t]*$`);
    let end = i + 1;
    while (end < lines.length && !closing.test(lines[end])) end++;
    if (end >= lines.length) {
      return { ok: false, error: `${where}: the ${marker.type} cell's fence is never closed.` };
    }
    const body = lines.slice(i + 1, end).join("\n");
    cells.push({ id: marker.attrs.id, type: marker.type, source: sourceFrom(marker.attrs, body, where), metadata: cellMetadataFrom(marker.attrs, warnings, where), line: i + 1 });
    i = end + 1;
    if (lines[i] === "") i++; // the separator line
  }

  // Ids: keep valid unique ones, give the rest new ids.
  const counts = new Map<string, number>();
  for (const c of cells) if (c.id) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  const taken = new Set([...counts].filter(([, n]) => n === 1).map(([id]) => id));
  const docCells: DocCell[] = cells.map((c) => {
    let id = c.id;
    if (!id || counts.get(id) !== 1) {
      if (id) warnings.push(`Line ${c.line}: cell id ${id} appears more than once; this cell got a new id.`);
      id = newCellId(taken);
      taken.add(id);
    }
    return { id, type: c.type, source: c.source, metadata: c.metadata };
  });

  if (trailer) {
    if (trailer.history !== undefined) {
      metadata.PyNote = isJsonObject(metadata.PyNote) ? { ...metadata.PyNote, history: trailer.history } : { history: trailer.history };
    }
    if (isJsonObject(trailer.attachments)) {
      const byId = new Map(docCells.map((c) => [c.id, c]));
      for (const [id, value] of Object.entries(trailer.attachments)) {
        const cell = byId.get(id);
        if (cell && cell.type !== "code" && isJsonObject(value)) cell.attachments = cloneJson(value);
        else warnings.push(`Ignored attachments for ${cell ? "code cell" : "unknown cell"} ${id}.`);
      }
    }
  }

  return { ok: true, value: { cells: docCells, metadata }, warnings };
}
