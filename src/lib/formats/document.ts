// The canonical notebook document every format converts to and from.
//
// It mirrors the nbformat 4.5 notebook minus outputs: cells keep their id,
// type, source text, full metadata (including keys other tools wrote) and
// attachments, and the notebook keeps its full metadata. PyNote's own settings
// live inside that metadata (`metadata.PyNote` for the notebook,
// `metadata.pynote` for a cell), so a format that round-trips this structure
// round-trips everything PyNote saves.
//
// Outputs are not part of the document: PyNote does not persist outputs yet
// (see CONTRIBUTING.md, "Preserve notebook portability").

export type DocCellType = "code" | "markdown" | "raw";

export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export interface DocCell {
  id: string;
  type: DocCellType;
  source: string;
  metadata: JsonObject;
  // Markdown and raw cells only (nbformat allows them nowhere else).
  attachments?: JsonObject;
}

export interface NotebookDocument {
  cells: DocCell[];
  metadata: JsonObject;
}

// What PyNote writes for notebooks it creates. language_info.version is the
// CPython version bundled with the Pyodide release the kernel loads
// (src/lib/pyodide.worker.ts); keep the two in step when Pyodide is upgraded.
export const PYNOTE_KERNELSPEC: JsonObject = {
  display_name: "Python 3 (Pyodide)",
  language: "python",
  name: "python3",
};

export const PYNOTE_PYTHON_VERSION = "3.13.2";

export const PYNOTE_LANGUAGE_INFO: JsonObject = {
  name: "python",
  version: PYNOTE_PYTHON_VERSION,
};

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Define `key` as an own, enumerable data property. Plain assignment would run
 * the `__proto__` setter for a key named "__proto__" (valid JSON, and even a
 * valid nbformat cell id), silently dropping the key or replacing the object's
 * prototype.
 */
export const setOwn = (target: JsonObject, key: string, value: JsonValue): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

/** Deep copy of plain JSON data (documents never hold anything else). */
export const cloneJson = <T extends JsonValue>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/** Whether the document's kernelspec is the one PyNote writes. PyNote only
 *  refreshes `language_info` on notebooks it owns, so a notebook from
 *  Jupyter keeps the kernel details its author's tools wrote. */
export const isPyNoteOwnedKernel = (metadata: JsonObject): boolean => {
  const ks = metadata.kernelspec;
  return !isJsonObject(ks) || ks.display_name === PYNOTE_KERNELSPEC.display_name;
};
