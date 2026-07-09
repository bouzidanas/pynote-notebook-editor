export type FilesPanelViewMode = "list" | "tree";

export const FILES_PANEL_VIEW_MODE_STORAGE_KEY = "pynote-files-panel-view-mode";

export const loadPersistedFilesPanelViewMode = (): FilesPanelViewMode => {
  try {
    const stored = localStorage.getItem(FILES_PANEL_VIEW_MODE_STORAGE_KEY);
    return stored === "tree" ? "tree" : "list";
  } catch {
    return "list";
  }
};
