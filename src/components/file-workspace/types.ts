export type EntryType = "file" | "dir";

export interface FileEntry {
  name: string;
  path: string;
  type: EntryType;
  size: number;
  mtime: number;
}

export interface ListResult {
  path: string;
  entries: FileEntry[];
  persistent: boolean;
}

export interface ReadTextResult {
  text: string;
  truncated: boolean;
}

export interface DownloadResult {
  name: string;
  mime: string;
  data_base64: string;
}

export type MoveConflictChoice = "replace" | "keep_both" | "skip";
export type FileListViewMode = "list" | "tree";

export interface ClipboardEntry {
  sourcePath: string;
  name: string;
}

export interface TreeVisibleRow {
  entry: FileEntry;
  depth: number;
}

export interface FileWorkspacePanelProps {
  mode: "side" | "dialog";
  viewMode: FileListViewMode;
  onViewModeChange: (nextMode: FileListViewMode) => void;
}
