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
    // Notebook-level autorun toggle (built-in notebook default).
    // undefined -> inherit app-level setting
    // true / false -> opt this notebook in/out of autorun
    autorun?: boolean;
    // Notebook-level refresh-scope toggle (built-in notebook default).
    // undefined -> inherit app-level setting
    // true -> also autorun on page refresh / reload of the same session
    autorunOnRefresh?: boolean;
    // Custom placeholder text shown for code cells whose code is hidden.
    // Cell-level placeholder takes precedence; falls back to a built-in default.
    codeHiddenPlaceholder?: string;
    // Document execution mode (queue_all, hybrid, direct, reactive).
    // When set, overrides the app default for this notebook.
    executionMode?: ExecutionMode;
    // Output position relative to the code editor for code cells in this
    // notebook. Applied as a theme override when the built-in notebook is
    // first loaded (fresh session). Cell-level visibility is unaffected.
    outputLayout?: "above" | "below";
}
