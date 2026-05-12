// Shared types for all built-in notebook collections
import type { CellData, ExecutionMode } from "../store";
import type { CodeVisibilitySettings } from "../codeVisibility";

// Code visibility overrides for built-in notebooks
export type NotebookCodeView = Partial<Omit<CodeVisibilitySettings, "saveToExport">>;

export interface NotebookConfig {
    cells: CellData[];
    filename: string;
    codeview?: NotebookCodeView;
    showTrailingAddButtons?: boolean;
    // When false, don't auto-run all cells on a fresh session for this notebook.
    // Cells with cell-level autorun=true still run individually.
    // When true or undefined, the global autorun-on-new-session behavior applies.
    autorun?: boolean;
    // Custom placeholder text shown for code cells whose code is hidden.
    // Cell-level placeholder takes precedence; falls back to a built-in default.
    codeHiddenPlaceholder?: string;
    // Document execution mode (queue_all, hybrid, direct, reactive).
    // When set, overrides the app default for this notebook.
    executionMode?: ExecutionMode;
}
