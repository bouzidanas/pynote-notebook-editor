// Shared types for all built-in notebook collections
import type { CellData } from "../store";
import type { CodeVisibilitySettings } from "../codeVisibility";

// Code visibility overrides for built-in notebooks
export type NotebookCodeView = Partial<Omit<CodeVisibilitySettings, "saveToExport">>;

export interface NotebookConfig {
    cells: CellData[];
    filename: string;
    codeview?: NotebookCodeView;
    showTrailingAddButtons?: boolean;
}
