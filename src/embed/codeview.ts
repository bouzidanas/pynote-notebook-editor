import { actions, notebookStore, type CellCodeVisibility } from "../lib/store";

// The view options of one embedded cell (pynote.codeview in its metadata,
// read by PyNote's code cell). Each option changes on its own: a prop, an
// attribute or the menu's Show/Hide Code sets one and keeps the others, and
// undefined takes it back to the notebook's setting.

export const CODEVIEW_KEYS = ["showCode", "showStdout", "showStderr", "showResult", "showError", "showStatusDot"] as const;

export type CodeviewKey = (typeof CODEVIEW_KEYS)[number];
export type CodeviewChanges = Partial<Record<CodeviewKey, boolean | undefined>>;

/** `current` with `changes` applied (undefined removes an option); undefined when no option is left. */
export function mergeCodeview(current: CellCodeVisibility | undefined, changes: CodeviewChanges): CellCodeVisibility | undefined {
  const next: CellCodeVisibility = { ...current };
  for (const key of CODEVIEW_KEYS) {
    if (!(key in changes)) continue;
    const value = changes[key];
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Change some of a cell's view options, keeping the others. */
export function changeCellCodeview(id: string, changes: CodeviewChanges): void {
  const cell = notebookStore.cells.find((c) => c.id === id);
  if (!cell) return;
  const next = mergeCodeview(cell.metadata?.pynote?.codeview, changes);
  if (next) actions.setCellCodeVisibility(id, next);
  else actions.clearCellCodeVisibility(id);
}
