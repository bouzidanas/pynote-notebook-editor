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
} from "./document";
import { isValidCellId, newCellId } from "./ids";
import { splitLinesKeepEnds, stableStringify } from "./json-stable";

// Jupyter notebook (.ipynb, nbformat 4) reader and writer.
//
// Reading keeps everything PyNote does not interpret: cell ids, cell and
// notebook metadata written by other tools, raw cells and attachments. The
// normalizations below are the complete list of what a read/write round trip
// changes, and the format tests hold the implementation to it:
//
// - `source` lists are joined into one string (and split back into lines,
//   Jupyter style, on write).
// - A missing, malformed or duplicate cell id is replaced with a new one.
// - Cell types other than code/markdown/raw become raw (nbformat 4 has no
//   other types), so their text survives unrendered.
// - Attachment entries that are not valid MIME bundles are dropped (they
//   would make the written file fail the nbformat schema).
// - Outputs and execution counts are dropped (PyNote does not persist
//   outputs yet), and the file is written as nbformat 4.5.
// - A notebook without kernelspec or language_info gets PyNote's.

export type ParseResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; error: string };

const CELL_TYPES: readonly DocCellType[] = ["code", "markdown", "raw"];

// nbformat mimebundle: JSON mimetypes may hold any value, every other
// mimetype a string or a list of strings.
const JSON_MIME = /^application\/(.*\+)?json$/;
const isMimeBundle = (value: unknown): value is JsonObject =>
  isJsonObject(value) &&
  Object.entries(value).every(([mime, data]) =>
    JSON_MIME.test(mime) || typeof data === "string" || (Array.isArray(data) && data.every((line) => typeof line === "string")));

const validAttachments = (value: JsonObject): { attachments: JsonObject; dropped: string[] } => {
  const entries = Object.entries(value);
  const kept = entries.filter(([, bundle]) => isMimeBundle(bundle));
  return {
    attachments: Object.fromEntries(kept.map(([name, bundle]) => [name, cloneJson(bundle)])),
    dropped: entries.filter(([, bundle]) => !isMimeBundle(bundle)).map(([name]) => name),
  };
};

// nbformat source lines are strings; anything else is rendered as its JSON
// text (String() would call a hostile toString and could throw).
const joinSource = (source: unknown): string => {
  if (typeof source === "string") return source;
  if (Array.isArray(source)) return source.map((part) => (typeof part === "string" ? part : JSON.stringify(part) ?? "")).join("");
  return "";
};

/** Parse .ipynb text. Never throws: malformed input yields `{ ok: false }`. */
export function parseIpynb(text: string): ParseResult<NotebookDocument> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  return fromIpynbJson(raw);
}

/** Convert an already-parsed .ipynb object into a document. */
export function fromIpynbJson(raw: unknown): ParseResult<NotebookDocument> {
  if (!isJsonObject(raw)) return { ok: false, error: "A notebook must be a JSON object." };
  if (Array.isArray(raw.worksheets)) {
    return { ok: false, error: "This is an nbformat 3 notebook. Open it in Jupyter and save it again to convert it to nbformat 4." };
  }
  if (!Array.isArray(raw.cells)) return { ok: false, error: "The notebook has no cells list." };
  if (typeof raw.nbformat === "number" && raw.nbformat !== 4) {
    return { ok: false, error: `nbformat ${raw.nbformat} notebooks are not supported (expected 4).` };
  }

  const warnings: string[] = [];
  const taken = new Set<string>();
  // Ids that are valid and unique are reserved up front, so a generated id
  // can never collide with an id that appears later in the file.
  const counts = new Map<string, number>();
  for (const c of raw.cells) {
    if (isJsonObject(c) && isValidCellId(c.id)) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  }
  for (const [id, n] of counts) if (n === 1) taken.add(id);

  const cells: DocCell[] = [];
  raw.cells.forEach((c, index) => {
    if (!isJsonObject(c)) {
      warnings.push(`Cell ${index + 1} is not an object and was skipped.`);
      return;
    }
    let id: string;
    if (isValidCellId(c.id) && counts.get(c.id) === 1) {
      id = c.id;
    } else {
      id = newCellId(taken);
      taken.add(id);
      if (c.id !== undefined) warnings.push(`Cell ${index + 1} had an invalid or duplicate id and got a new one.`);
    }
    let type: DocCellType;
    if (CELL_TYPES.includes(c.cell_type as DocCellType)) {
      type = c.cell_type as DocCellType;
    } else {
      type = "raw";
      warnings.push(`Cell ${index + 1} has unknown type ${JSON.stringify(c.cell_type)} and was kept as a raw cell.`);
    }
    const cell: DocCell = {
      id,
      type,
      source: joinSource(c.source),
      metadata: isJsonObject(c.metadata) ? cloneJson(c.metadata) : {},
    };
    if (type !== "code" && isJsonObject(c.attachments)) {
      const { attachments, dropped } = validAttachments(c.attachments);
      cell.attachments = attachments;
      if (dropped.length > 0) warnings.push(`Cell ${index + 1}: dropped malformed attachment(s) ${dropped.map((n) => JSON.stringify(n)).join(", ")}.`);
    }
    cells.push(cell);
  });

  const metadata: JsonObject = isJsonObject(raw.metadata) ? cloneJson(raw.metadata) : {};
  if (!isJsonObject(metadata.kernelspec)) metadata.kernelspec = cloneJson(PYNOTE_KERNELSPEC);
  if (!isJsonObject(metadata.language_info)) metadata.language_info = cloneJson(PYNOTE_LANGUAGE_INFO);

  return { ok: true, value: { cells, metadata }, warnings };
}

/** The nbformat 4.5 object for a document (before stringifying). */
export function toIpynbJson(doc: NotebookDocument): JsonObject {
  const cells: JsonValue[] = doc.cells.map((cell) => {
    const out: JsonObject = {
      cell_type: cell.type,
      id: cell.id,
      metadata: cloneJson(cell.metadata),
      source: splitLinesKeepEnds(cell.source),
    };
    if (cell.type === "code") {
      out.execution_count = null;
      out.outputs = [];
    } else if (cell.attachments) {
      out.attachments = cloneJson(cell.attachments);
    }
    return out;
  });
  return { cells, metadata: cloneJson(doc.metadata), nbformat: 4, nbformat_minor: 5 };
}

/** Serialize exactly as Jupyter does (sorted keys, 1-space indent, final newline). */
export function serializeIpynb(doc: NotebookDocument): string {
  return `${stableStringify(toIpynbJson(doc))}\n`;
}

/**
 * A copy of the document without PyNote's settings, for sharing with tools
 * that have no use for them: `metadata.PyNote` and every cell's
 * `metadata.pynote` are removed. Every other key stays, so a cell whose
 * metadata held only PyNote settings keeps an empty metadata object.
 */
export function stripPyNoteMetadata(doc: NotebookDocument): NotebookDocument {
  const metadata = cloneJson(doc.metadata);
  delete metadata.PyNote;
  const cells = doc.cells.map((cell): DocCell => {
    const copy: DocCell = { id: cell.id, type: cell.type, source: cell.source, metadata: cloneJson(cell.metadata) };
    delete copy.metadata.pynote;
    if (cell.attachments) copy.attachments = cloneJson(cell.attachments);
    return copy;
  });
  return { cells, metadata };
}
