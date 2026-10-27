import { type CellData, flushAllEditors, notebookStore } from "./store";
import { codeVisibility } from "./codeVisibility";
import { currentTheme, defaultTheme } from "./theme";
import {
  type DocCell,
  type JsonObject,
  type NotebookDocument,
  PYNOTE_KERNELSPEC,
  PYNOTE_LANGUAGE_INFO,
  cloneJson,
  isJsonObject,
  isPyNoteOwnedKernel,
} from "./formats/document";
import { buildNotebookSettings, readNotebookSettings, sanitizeCellMetadata, type PyNoteNotebookSettings } from "./formats/pynote-settings";

// Bridge between the app's live state and the format-neutral NotebookDocument.
// Every file format (.ipynb, .pynote, exports) goes through these two
// functions, so what PyNote saves is decided in one place.

/** Snapshot the open notebook as a document, exactly as a save writes it. */
export function documentFromApp(): NotebookDocument {
  // Editors that debounce their updates hand over their latest text first.
  flushAllEditors();

  const metadata = cloneJson(notebookStore.documentMetadata as JsonObject);
  if (!isJsonObject(metadata.kernelspec)) metadata.kernelspec = cloneJson(PYNOTE_KERNELSPEC);
  // language_info describes the kernel that ran the notebook. Refresh it for
  // notebooks PyNote owns; leave other tools' kernel details alone.
  if (isPyNoteOwnedKernel(metadata)) {
    const current = isJsonObject(metadata.language_info) ? metadata.language_info : {};
    metadata.language_info = { ...current, ...cloneJson(PYNOTE_LANGUAGE_INFO) };
  }

  const loadedPyNote = isJsonObject(metadata.PyNote) ? metadata.PyNote : null;
  metadata.PyNote = buildNotebookSettings({
    history: [...notebookStore.history],
    executionMode: notebookStore.executionMode,
    notebookAutorun: notebookStore.notebookAutorun,
    notebookAutorunOnRefresh: notebookStore.notebookAutorunOnRefresh,
    codeHiddenPlaceholder: notebookStore.codeHiddenPlaceholder,
    codeVisibility: { ...codeVisibility },
    theme: cloneJson({ ...currentTheme } as unknown as JsonObject) as unknown as NotebookSettingsTheme,
    defaultTheme,
    loaded: loadedPyNote,
  });

  const cells: DocCell[] = notebookStore.cells.map((cell) => {
    const doc: DocCell = {
      id: cell.id,
      type: cell.type,
      source: cell.content,
      metadata: cell.metadata ? cloneJson(cell.metadata as JsonObject) : {},
    };
    if (cell.type !== "code" && cell.attachments) doc.attachments = cloneJson(cell.attachments);
    return doc;
  });

  return { cells, metadata };
}

type NotebookSettingsTheme = Parameters<typeof buildNotebookSettings>[0]["theme"];

export interface AppNotebook {
  cells: CellData[];
  settings: PyNoteNotebookSettings;
  // The notebook-level metadata to keep for saving (NotebookState.documentMetadata).
  metadata: JsonObject;
  warnings: string[];
}

/** Turn a parsed document into store cells plus PyNote's validated settings. */
export function appNotebookFromDocument(doc: NotebookDocument): AppNotebook {
  const warnings: string[] = [];
  const cells: CellData[] = doc.cells.map((cell, index) => {
    const { metadata, dropped } = sanitizeCellMetadata(cell.metadata);
    if (dropped.length > 0) warnings.push(`Cell ${index + 1}: ignored invalid PyNote setting(s) ${dropped.join(", ")}.`);
    const out: CellData = {
      id: cell.id,
      type: cell.type,
      content: cell.source,
      isEditing: false,
    };
    if (Object.keys(metadata).length > 0) out.metadata = metadata as CellData["metadata"];
    if (cell.attachments) out.attachments = cloneJson(cell.attachments);
    return out;
  });
  return {
    cells,
    settings: readNotebookSettings(doc.metadata),
    metadata: cloneJson(doc.metadata),
    warnings,
  };
}
