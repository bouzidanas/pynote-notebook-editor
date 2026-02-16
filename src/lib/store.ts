import { createStore, produce } from "solid-js/store";
import { kernel } from "./pyodide";

export type CellType = "code" | "markdown";

// Execution mode type and app-level default
export type ExecutionMode = "queue_all" | "hybrid" | "direct" | "reactive";
export const APP_DEFAULT_EXECUTION_MODE: ExecutionMode = "hybrid";

// Quick edit mode: single-click to edit code cells (default: on)
export const APP_QUICK_EDIT_MODE = true;

// Cell-level visibility metadata (for code cells only)
// These override document/app settings for this specific cell
// true = force show, false = force hide, undefined = use global setting
export interface CellCodeVisibility {
  showCode?: boolean;
  showStdout?: boolean;
  showStderr?: boolean;
  showResult?: boolean;
  showError?: boolean;
  showStatusDot?: boolean;
}

export interface CellData {
  id: string;
  type: CellType;
  content: string;
  // Cell metadata (for code visibility overrides, etc.)
  metadata?: {
    pynote?: {
      codeview?: CellCodeVisibility;
    };
  };
  outputs?: {
    stdout: string[];
    stderr: string[];
    result?: string;
    mimebundle?: any;
    error?: string;
    executionTime?: number; // timestamp
    executionDuration?: number; // ms
    executionCount?: number;
    executionKernelId?: string;
  };
  isEditing?: boolean;
  isRunning?: boolean;
  isQueued?: boolean;
  // Editor state persistence (session-only, not saved to localStorage)
  editorState?: any; // EditorState JSON from CodeMirror/ProseMirror
  lastEditTimestamp?: number;
  // For code cells: track position in internal history for global undo
  targetHistoryPosition?: number | undefined; // Target position to navigate to (set by global undo)
  // For markdown cells (and fallback): snapshot of state before editing
  preEditState?: {
    content: string;
    editorState?: any;
  };
  // Transient action used to signal editor components (undo/redo)
  // This avoids direct DOM manipulation
  editorAction?: "undo" | "redo" | undefined;

  // Local editor capabilities (reported by editor)
  canUndo?: boolean;
  canRedo?: boolean;
}

// Compact history format:
// a=add, d=delete, m=move, u=update, h=history-position (code cells only)
// Format: "action|data"
// Add: "a|index|type|id"
// Delete: "d|index|type|id|content"
// Move: "m|fromIndex|toIndex|id"
// Update (markdown): "u|id|oldContent|newContent"
// History Position (code): "h|id|entryPosition|exitPosition|exitContent"
//   - exitContent is needed for redo when cell was deleted and recreated (CodeMirror history is lost)
type HistoryEntry = string;

// Reactive execution mode: cell dependency tracking (Marimo-style)
export interface CellDependencyInfo {
  definitions: Set<string>;  // Variables this cell defines/assigns
  references: Set<string>;   // Variables this cell references (external to cell)
}

export interface NotebookState {
  cells: CellData[];
  filename: string;
  activeCellId: string | null;
  history: HistoryEntry[];
  historyIndex: number; // Current position in history (-1 = no history)
  presentationMode: boolean;
  executionMode: ExecutionMode;
  executionQueue: string[]; // List of cell IDs waiting to run
  sidebarAlignment: "top" | "center" | "bottom";
  // Reactive execution mode state (Marimo-style DAG)
  cellDependencies: Map<string, CellDependencyInfo>;
  dependenciesStale: boolean; // True when switching to reactive mode, need to analyze all cells
}

const MAX_HISTORY = 100;

// Internal cache to track start state at the start of an edit session
const editSessionStart = new Map<string, { content?: string; position?: number }>();

// --- Batch Transaction State ---
// When batching is active, history entries are collected here instead of added directly
let batchingActive = false;
let batchedEntries: HistoryEntry[] = [];

// --- History Storage Utilities ---
// Robust string escaping for pipe-delimited format
const escapeContent = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
const unescapeContent = (s: string) => s.replace(/\\\|/g, '|').replace(/\\\\/g, '\\');

// Helper to parse "u|id|old|new" which has two escaped distinct content blocks
const parseUpdateEntry = (entry: string): { id: string, oldContent: string, newContent: string } | null => {
  // skip "u|" (2 chars)
  const firstPipe = entry.indexOf('|');
  const secondPipe = entry.indexOf('|', firstPipe + 1);
  if (firstPipe === -1 || secondPipe === -1) return null;

  const id = entry.substring(firstPipe + 1, secondPipe);
  const contentParams = entry.substring(secondPipe + 1);

  // scan for the middle separator
  let splitIdx = -1;
  for (let i = 0; i < contentParams.length; i++) {
    if (contentParams[i] === '|') {
      let backslashCount = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (contentParams[j] === '\\') backslashCount++;
        else break;
      }
      if (backslashCount % 2 === 0) {
        splitIdx = i;
        break;
      }
    }
  }

  if (splitIdx === -1) return null;

  return {
    id,
    oldContent: unescapeContent(contentParams.substring(0, splitIdx)),
    newContent: unescapeContent(contentParams.substring(splitIdx + 1))
  };
};

// Helper to commit an edit session (check for changes and update history)
const commitEditSession = (id: string, currentContent: string, currentPosition?: number) => {
  const cell = defaultStore.cells.find(c => c.id === id);
  const startState = editSessionStart.get(id);

  // Only commit if we actually have a start snapshot
  if (cell && startState) {
    if (cell.type === "code" && startState.position !== undefined && currentPosition !== undefined) {
      // For code cells: check if history position changed
      if (startState.position !== currentPosition) {
        // Before adding to history, check if we need to truncate forward history
        // If historyIndex is not at the end, it means user undid and then made new edits
        // The forward history (redo branch) should be discarded
        const currentHistoryIndex = defaultStore.historyIndex;
        if (currentHistoryIndex < defaultStore.history.length - 1) {
          setStore("history", defaultStore.history.slice(0, currentHistoryIndex + 1));
        }

        // Include exit content for redo (needed when cell is deleted+recreated and CodeMirror history is lost)
        addToHistory(`h|${id}|${startState.position}|${currentPosition}|${escapeContent(currentContent)}`);
      }
    } else if (cell.type === "markdown" && startState.content !== undefined) {
      // For markdown cells: use content comparison
      if (startState.content !== currentContent) {
        // Same truncation logic for markdown cells
        const currentHistoryIndex = defaultStore.historyIndex;
        if (currentHistoryIndex < defaultStore.history.length - 1) {
          setStore("history", defaultStore.history.slice(0, currentHistoryIndex + 1));
        }

        addToHistory(`u|${id}|${escapeContent(startState.content)}|${escapeContent(currentContent)}`);
      }
    }

    // Cleanup
    editSessionStart.delete(id);
  }
};

export const defaultCells: CellData[] = [
  {
    id: crypto.randomUUID(),
    type: "markdown",
    content: "# Welcome to PyNote\n\nThis is a **modern** notebook running Python in your browser via WebAssembly (Pyodide).\n\nDouble click a cell to edit. Drag handle to reorder."
  },
  {
    id: crypto.randomUUID(),
    type: "code",
    content: "print('Hello from Pyodide!')\nimport sys\nprint(sys.version)"
  }
];

const [store, setStore] = createStore<NotebookState>({
  cells: [],
  filename: "untitled.ipynb",
  activeCellId: null,
  history: [],
  historyIndex: -1,
  presentationMode: false,
  executionMode: APP_DEFAULT_EXECUTION_MODE,
  executionQueue: [],
  sidebarAlignment: "top",
  // Reactive execution mode (Marimo-style DAG)
  cellDependencies: new Map(),
  dependenciesStale: false
});

export const notebookStore = store;
const defaultStore = store; // Reference for commitEditSession

// Helper to add to history (respects batching mode)
const addToHistory = (entry: HistoryEntry) => {
  // If batching is active, collect entries instead of adding directly
  if (batchingActive) {
    batchedEntries.push(entry);
    return;
  }

  setStore(produce((state) => {
    // Remove any future history if we're not at the end
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }

    // Add new entry
    state.history.push(entry);

    // Limit history size
    if (state.history.length > MAX_HISTORY) {
      state.history.shift();
    } else {
      state.historyIndex++;
    }
  }));
};

// Helper to add a finalized entry directly (bypasses batching, used by endBatch)
const addToHistoryDirect = (entry: HistoryEntry) => {
  setStore(produce((state) => {
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push(entry);
    if (state.history.length > MAX_HISTORY) {
      state.history.shift();
    } else {
      state.historyIndex++;
    }
  }));
};

// --- Undo/Redo Single Entry Helpers ---
// These handle individual history entries (used by undo/redo, including for batch sub-entries)

const undoSingleEntry = (entry: HistoryEntry) => {
  const parts = entry.split('|');
  const action = parts[0];

  if (action === 'a') {
    // Undo add: delete the cell
    const [, indexStr, ,] = parts;
    const idx = parseInt(indexStr);
    setStore("cells", produce((cells) => {
      cells.splice(idx, 1);
    }));
  } else if (action === 'd') {
    // Undo delete: re-add the cell
    const [, indexStr, type, id, ...contentParts] = parts;
    const idx = parseInt(indexStr);
    // Join remaining parts in case content contained pipe (legacy fallback)
    const content = unescapeContent(contentParts.join('|'));

    setStore("cells", produce((cells) => {
      cells.splice(idx, 0, {
        id,
        type: type as CellType,
        content,
        isEditing: false
      });
    }));
  } else if (action === 'm') {
    // Undo move: move back
    const [, fromIndexStr, toIndexStr] = parts;
    const fromIndex = parseInt(fromIndexStr);
    const toIndex = parseInt(toIndexStr);
    setStore("cells", produce((cells) => {
      const [moved] = cells.splice(toIndex, 1);
      cells.splice(fromIndex, 0, moved);
    }));
  } else if (action === 'u') {
    const updateData = parseUpdateEntry(entry);
    if (updateData) {
      // Find the cell to get its pre-edit snapshot
      const cell = store.cells.find(c => c.id === updateData.id);

      // Restore content
      setStore("cells", (c) => c.id === updateData.id, "content", updateData.oldContent);

      // Restore pre-edit editor state if available
      if (cell?.preEditState) {
        setStore("cells", (c) => c.id === updateData.id, "editorState", cell.preEditState.editorState);
      } else {
        // No pre-edit snapshot, clear the editor state
        // Note: We access actions via closure since this helper is defined before actions
        setStore("cells", (c) => c.id === updateData.id, "editorState", undefined);
        setStore("cells", (c) => c.id === updateData.id, "lastEditTimestamp", undefined);
      }
    }
  } else if (action === 'h') {
    // Code cell history position entry: "h|id|entryPosition|exitPosition"
    const [, id, entryPosStr] = parts;
    const entryPosition = parseInt(entryPosStr);
    setStore("cells", (c) => c.id === id, "targetHistoryPosition", entryPosition);
  }
};

const redoSingleEntry = (entry: HistoryEntry) => {
  const parts = entry.split('|');
  const action = parts[0];

  if (action === 'a') {
    const [, indexStr, type, id] = parts;
    const idx = parseInt(indexStr);
    setStore("cells", produce((cells) => {
      cells.splice(idx, 0, {
        id,
        type: type as CellType,
        content: "",
        isEditing: false
      });
    }));
  } else if (action === 'd') {
    const [, indexStr] = parts;
    const idx = parseInt(indexStr);
    setStore("cells", produce((cells) => {
      cells.splice(idx, 1);
    }));
  } else if (action === 'm') {
    const [, fromIndexStr, toIndexStr] = parts;
    const fromIndex = parseInt(fromIndexStr);
    const toIndex = parseInt(toIndexStr);
    setStore("cells", produce((cells) => {
      const [moved] = cells.splice(fromIndex, 1);
      cells.splice(toIndex, 0, moved);
    }));
  } else if (action === 'u') {
    const updateData = parseUpdateEntry(entry);
    if (updateData) {
      setStore("cells", (c) => c.id === updateData.id, "content", updateData.newContent);
      // Clear pre-edit state on redo since we're moving forward past the edit
      setStore("cells", (c) => c.id === updateData.id, "editorState", undefined);
      setStore("cells", (c) => c.id === updateData.id, "lastEditTimestamp", undefined);
    }
  } else if (action === 'h') {
    // Code cell history position entry: "h|id|entryPosition|exitPosition|exitContent"
    // We need to handle two cases:
    // 1. Cell exists with intact CodeMirror history -> navigate to exitPosition
    // 2. Cell was deleted+recreated -> CodeMirror history is gone, restore content directly
    const [, id, , exitPosStr, ...contentParts] = parts;
    const exitPosition = parseInt(exitPosStr);
    const exitContent = contentParts.length > 0 ? unescapeContent(contentParts.join('|')) : undefined;

    // First, restore content directly (handles case 2, and case 1 content should match anyway)
    if (exitContent !== undefined) {
      setStore("cells", (c) => c.id === id, "content", exitContent);
      // Clear editor state since content was restored externally
      setStore("cells", (c) => c.id === id, "editorState", undefined);
    }

    // Also set target position in case CodeMirror history is intact
    setStore("cells", (c) => c.id === id, "targetHistoryPosition", exitPosition);
  }
};

export const actions = {
  addCell: (type: CellType, index?: number) => {
    const id = crypto.randomUUID();
    const insertIndex = index !== undefined ? index : store.cells.length;

    setStore("cells", produce((cells) => {
      const newCell: CellData = {
        id,
        type,
        content: "",
        isEditing: true
      };
      if (index !== undefined) {
        cells.splice(index, 0, newCell);
      } else {
        cells.push(newCell);
      }
    }));

    // Add to history: "a|index|type|id"
    addToHistory(`a|${insertIndex}|${type}|${id}`);

    // Initialize edit session tracking since cell starts in edit mode
    // This ensures any edits before exiting edit mode will be recorded
    // Note: Only set if not already present - CodeEditor's effect may have already set the position
    if (type === "code") {
      // For code cells: position will be set when editor reports it
      if (!editSessionStart.has(id)) {
        editSessionStart.set(id, {});
      }
    } else {
      // For markdown cells: track empty content as starting point
      editSessionStart.set(id, { content: "" });
    }

    actions.setActiveCell(id);
    // Autosave after adding a cell
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  updateCell: (id: string, content: string) => {
    setStore("cells", (c) => c.id === id, "content", content);
    // Autosave after editing cell content
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  updateCellOutput: (id: string, output: any) => {
    setStore("cells", (c) => c.id === id, "outputs", output);
  },

  changeCellType: (id: string, type: CellType) => {
    setStore("cells", (c) => c.id === id, "type", type);
    // Clear incompatible editor state when changing cell type
    actions.clearCellEditorState(id);
    // Autosave
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  clearCellOutput: (id: string) => {
    setStore("cells", (c) => c.id === id, "outputs", undefined);
  },

  deleteCell: (id: string) => {
    const cell = store.cells.find(c => c.id === id);
    const idx = store.cells.findIndex((c) => c.id === id);

    if (idx !== -1 && cell) {
      // Clear UI state
      kernel.clearCellState(id);

      // Clear editor state before deleting
      actions.clearCellEditorState(id);

      // Reactive mode: remove from dependency tracking
      if (store.executionMode === "reactive") {
        actions.removeCellDependencies(id);
      }

      // Add to history before deleting: "d|index|type|id|content"
      addToHistory(`d|${idx}|${cell.type}|${id}|${escapeContent(cell.content)}`);

      setStore("cells", produce((cells) => {
        cells.splice(idx, 1);
      }));

      if (store.activeCellId === id) {
        setStore("activeCellId", null);
      }
    }
    // Autosave after deleting a cell
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  moveCell: (fromIndex: number, toIndex: number) => {
    const cell = store.cells[fromIndex];
    if (!cell) return;

    // Add to history: "m|fromIndex|toIndex|id"
    addToHistory(`m|${fromIndex}|${toIndex}|${cell.id}`);

    setStore("cells", produce((cells) => {
      const [moved] = cells.splice(fromIndex, 1);
      cells.splice(toIndex, 0, moved);
    }));
    // Autosave after moving a cell
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  undo: () => {
    if (store.historyIndex < 0) return;

    const entry = store.history[store.historyIndex];
    const action = entry[0];

    setStore("historyIndex", store.historyIndex - 1);

    // Handle batch entries: undo all sub-entries in reverse order
    if (action === 'b') {
      const subEntries: HistoryEntry[] = JSON.parse(entry.substring(2));
      // Process in reverse order for undo
      for (let i = subEntries.length - 1; i >= 0; i--) {
        undoSingleEntry(subEntries[i]);
      }
    } else {
      undoSingleEntry(entry);
    }

    // Autosave after undo
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  redo: () => {
    if (store.historyIndex >= store.history.length - 1) return;

    setStore("historyIndex", store.historyIndex + 1);
    const entry = store.history[store.historyIndex];
    const action = entry[0];

    // Handle batch entries: redo all sub-entries in order
    if (action === 'b') {
      const subEntries: HistoryEntry[] = JSON.parse(entry.substring(2));
      for (const subEntry of subEntries) {
        redoSingleEntry(subEntry);
      }
    } else {
      redoSingleEntry(entry);
    }

    // Autosave after redo
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  // --- Batch Transaction API ---
  // Wrap multiple actions in beginBatch/endBatch to make them a single undo unit
  beginBatch: () => {
    if (batchingActive) {
      console.warn('[beginBatch] Already in a batch, ignoring nested beginBatch');
      return;
    }
    batchingActive = true;
    batchedEntries = [];
  },

  endBatch: () => {
    if (!batchingActive) {
      console.warn('[endBatch] Not in a batch, ignoring endBatch');
      return;
    }
    batchingActive = false;

    // Only add to history if there were actual entries
    if (batchedEntries.length > 0) {
      // Create compound entry: "b|[entry1, entry2, ...]"
      const batchEntry = `b|${JSON.stringify(batchedEntries)}`;
      addToHistoryDirect(batchEntry);
    }

    batchedEntries = [];
  },

  // Check if currently in a batch (useful for debugging)
  isBatching: () => batchingActive,

  setActiveCell: (id: string | null) => {
    // Commit any active edit sessions before switching
    store.cells.forEach(cell => {
      if (cell.isEditing && cell.id !== id) {
        // Only commit markdown cells directly here
        // Code cells will be committed via CodeEditor's readOnly effect
        if (cell.type === "markdown") {
          commitEditSession(cell.id, cell.content);
        }
      }
    });

    setStore("activeCellId", id);
    setStore("cells", (c) => c.id !== id, "isEditing", false);
  },

  // Internal callback for autosave, set by Notebook.tsx
  __autosaveCallback: undefined as undefined | (() => void),
  __setAutosaveCallback(cb: () => void) {
    (actions as any).__autosaveCallback = cb;
  },

  setEditing: (id: string, isEditing: boolean) => {
    // Session State Tracking for Undo/Redo
    const cell = store.cells.find(c => c.id === id);
    if (cell) {
      if (isEditing) {
        // Start of edit session
        // Only if not already tracking (avoid overwriting start state on double calls)
        if (!editSessionStart.has(id)) {
          if (cell.type === "code") {
            // For code cells: Position will be set when editor reports it
            editSessionStart.set(id, {}); // Placeholder, position set later
          } else {
            // For markdown cells: Save content snapshot
            editSessionStart.set(id, { content: cell.content });
            setStore("cells", (c) => c.id === id, "preEditState", {
              content: cell.content,
              editorState: cell.editorState
            });
          }
        }
      } else {
        // End of edit session: Check for changes
        // For code cells, position will be passed from CodeEditor via commitCodeCellEditSession
        // For markdown cells, commit now with content
        if (cell.type === "markdown") {
          commitEditSession(id, cell.content);
          // Cleanup for markdown (commitEditSession already deletes, but being explicit)
          editSessionStart.delete(id);
        }
        // Note: For code cells, cleanup happens in commitCodeCellEditSession after it reads the Map
      }
    }

    setStore("cells", (c) => c.id === id, "isEditing", isEditing);
    // Call autosave only when leaving edit mode
    if (!isEditing && (actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  updateCellEditorState: (id: string, state: any) => {
    setStore("cells", (c) => c.id === id, "editorState", state);
    setStore("cells", (c) => c.id === id, "lastEditTimestamp", Date.now());
  },

  clearCellEditorState: (id: string) => {
    setStore("cells", (c) => c.id === id, "editorState", undefined);
    setStore("cells", (c) => c.id === id, "lastEditTimestamp", undefined);
  },

  // Set cell-level code visibility metadata
  setCellCodeVisibility: (id: string, codeview: CellCodeVisibility) => {
    setStore("cells", (c) => c.id === id, "metadata", {
      pynote: { codeview }
    });
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  // Clear cell-level code visibility metadata
  clearCellCodeVisibility: (id: string) => {
    setStore("cells", (c) => c.id === id, "metadata", undefined);
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  // Called by CodeEditor when entering edit mode to save entry position
  setCodeCellEntryPosition: (id: string, position: number) => {
    const existing = editSessionStart.get(id);
    editSessionStart.set(id, { ...existing, position });
  },

  // Called by CodeEditor when exiting edit mode to commit with exit position
  commitCodeCellEditSession: (id: string, exitPosition: number) => {
    const cell = store.cells.find(c => c.id === id);
    if (cell && cell.type === "code") {
      commitEditSession(id, cell.content, exitPosition);
    }
  },

  // Update the target history position (for navigation during undo/redo)
  // This is called by global undo/redo handlers to tell the editor where to navigate
  setCodeCellTargetPosition: (id: string, position: number | undefined) => {
    setStore("cells", (c) => c.id === id, "targetHistoryPosition", position);
  },

  setCellRunning: (id: string, isRunning: boolean) => {
    setStore("cells", (c) => c.id === id, "isRunning", isRunning);
  },

  setCellQueued: (id: string, isQueued: boolean) => {
    setStore("cells", (c) => c.id === id, "isQueued", isQueued);
  },

  setExecutionMode: (mode: NotebookState["executionMode"]) => {
    const oldMode = store.executionMode;
    setStore("executionMode", mode);

    // When switching TO reactive mode, mark dependencies as stale so we analyze all cells
    if (mode === "reactive" && oldMode !== "reactive") {
      setStore("dependenciesStale", true);
    }
  },

  // --- Reactive Execution Mode (Marimo-style DAG) ---

  // Update cell dependencies after analysis
  setCellDependencies: (cellId: string, definitions: string[], references: string[]) => {
    const newMap = new Map(store.cellDependencies);
    newMap.set(cellId, {
      definitions: new Set(definitions),
      references: new Set(references)
    });
    setStore("cellDependencies", newMap);
  },

  // Remove cell from dependency tracking
  removeCellDependencies: (cellId: string) => {
    const newMap = new Map(store.cellDependencies);
    newMap.delete(cellId);
    setStore("cellDependencies", newMap);
  },

  // Clear stale flag after analyzing all cells
  setDependenciesStale: (stale: boolean) => {
    setStore("dependenciesStale", stale);
  },

  // Build dependency graph: returns Map<cellId, Set<dependentCellIds>>
  // An edge A → B means "B depends on A" (B references what A defines)
  getDependencyGraph: (): Map<string, Set<string>> => {
    const graph = new Map<string, Set<string>>();
    const deps = store.cellDependencies;

    // Initialize all cells with empty sets
    for (const cell of store.cells) {
      if (cell.type === "code") {
        graph.set(cell.id, new Set());
      }
    }

    // Build variable → defining cell mapping
    const variableToCell = new Map<string, string>();
    for (const [cellId, info] of deps) {
      for (const varName of info.definitions) {
        variableToCell.set(varName, cellId);
      }
    }

    // For each cell, find cells that depend on its definitions
    for (const [cellId, info] of deps) {
      for (const refVar of info.references) {
        const definingCell = variableToCell.get(refVar);
        if (definingCell && definingCell !== cellId) {
          // definingCell → cellId (cellId depends on definingCell)
          if (!graph.has(definingCell)) {
            graph.set(definingCell, new Set());
          }
          graph.get(definingCell)!.add(cellId);
        }
      }
    }

    return graph;
  },

  // Get all downstream cells (cells that depend on the given cell, transitively)
  // Returns cells in topological order (safe execution order)
  getDownstreamCells: (cellId: string): string[] => {
    const graph = actions.getDependencyGraph();
    const visited = new Set<string>();
    const result: string[] = [];

    // BFS to find all reachable cells
    const queue = [cellId];
    visited.add(cellId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependents = graph.get(current) || new Set();

      for (const dep of dependents) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
          result.push(dep);
        }
      }
    }

    // Topological sort the result (Kahn's algorithm on the subgraph)
    // This ensures cells are executed in dependency order
    if (result.length <= 1) return result;

    // Build in-degree map for the subgraph
    const subgraphNodes = new Set(result);
    const inDegree = new Map<string, number>();
    const subgraphEdges = new Map<string, Set<string>>();

    for (const node of result) {
      inDegree.set(node, 0);
      subgraphEdges.set(node, new Set());
    }

    // Count in-degrees within the subgraph
    for (const node of result) {
      const dependents = graph.get(node) || new Set();
      for (const dep of dependents) {
        if (subgraphNodes.has(dep)) {
          subgraphEdges.get(node)!.add(dep);
          inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
        }
      }
    }

    // Also count edges from the source cell
    const sourceEdges = graph.get(cellId) || new Set();
    for (const dep of sourceEdges) {
      if (subgraphNodes.has(dep)) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }

    // Kahn's algorithm
    const sorted: string[] = [];
    const zeroInDegree = result.filter(n => inDegree.get(n) === 0);

    while (zeroInDegree.length > 0) {
      const node = zeroInDegree.shift()!;
      sorted.push(node);

      for (const dep of subgraphEdges.get(node) || new Set()) {
        const newDegree = (inDegree.get(dep) || 1) - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) {
          zeroInDegree.push(dep);
        }
      }
    }

    // If sorted doesn't include all nodes, there's a cycle - return in BFS order
    return sorted.length === result.length ? sorted : result;
  },


  runCell: (id: string, runKernel: (content: string, id: string) => Promise<void>, analyzeCell?: (cellId: string, content: string) => Promise<void>) => {
    console.log(`[runCell] id=${id}, analyzeCell provided:`, !!analyzeCell);
    const cell = store.cells.find(c => c.id === id);
    if (!cell || cell.type !== "code" || cell.isRunning || cell.isQueued) return;

    const mode = store.executionMode;
    console.log(`[runCell] mode=${mode}`);
    const isKernelRunning = store.cells.some(c => c.isRunning);
    const isKernelLoading = kernel.status === "loading";
    const prevIndex = store.cells.findIndex(c => c.id === id) - 1;
    const prevCell = prevIndex >= 0 ? store.cells[prevIndex] : null;
    const isPrevRunningOrQueued = prevCell && (prevCell.isRunning || prevCell.isQueued);

    // Reactive mode: analyze this cell first (JIT), then queue downstream cells
    if (mode === "reactive") {
      // Store the analyzeCell callback for use by executeCell
      if (analyzeCell) {
        (actions as any).__pendingAnalyzeCell = analyzeCell;
        console.log(`[runCell] Stored analyzeCell callback`);
      } else {
        console.log(`[runCell] WARNING: No analyzeCell callback provided in reactive mode!`);
      }

      // If kernel is busy, queue this cell (analysis will happen when it executes)
      if (isKernelLoading || isKernelRunning) {
        actions.addToQueue(id);
      } else {
        // Execute immediately (will analyze JIT in executeCell)
        // Pass false for isReactiveCascade since this is user-initiated
        actions.executeCell(id, runKernel, false);
      }
      return;
    }

    // Non-reactive modes (queue_all, hybrid, direct)
    const shouldQueue =
      isKernelLoading ||
      (mode === "queue_all" ? isKernelRunning :
        mode === "hybrid" ? isPrevRunningOrQueued :
          false);

    if (shouldQueue) {
      actions.addToQueue(id);
    } else {
      actions.executeCell(id, runKernel);
    }
  },

  executeCell: async (id: string, runKernel: (content: string, id: string) => Promise<void>, isReactiveCascade: boolean = true) => {
    console.log(`[executeCell] id=${id}, isReactiveCascade=${isReactiveCascade}, mode=${store.executionMode}`);
    actions.setCellRunning(id, true);
    const cell = store.cells.find(c => c.id === id);
    if (!cell) return;

    const previousOutputs = cell.outputs;

    try {
      // Reactive mode: JIT analysis before execution
      // Only analyze and queue downstream for user-initiated runs, not cascade runs
      if (store.executionMode === "reactive" && !isReactiveCascade) {
        console.log(`[executeCell] Reactive mode, analyzing cell ${id}`);
        const analyzeCell = (actions as any).__pendingAnalyzeCell;
        console.log(`[executeCell] analyzeCell callback exists:`, !!analyzeCell);
        if (analyzeCell) {
          // Analyze this cell and update its dependencies
          await analyzeCell(id, cell.content);

          // Now queue downstream cells based on fresh dependencies
          const downstream = actions.getDownstreamCells(id);
          console.log(`[executeCell] Downstream cells:`, downstream);
          for (const depId of downstream) {
            // Only queue if not already queued/running
            const depCell = store.cells.find(c => c.id === depId);
            if (depCell && !depCell.isRunning && !depCell.isQueued) {
              actions.addToQueue(depId);
            }
          }
        }
      }

      // Clear old UI state for this cell
      kernel.clearCellState(id);
      // Set context for new UI elements
      kernel.setCellContext(id);

      await runKernel(cell.content, id);
    } catch (e) {
      console.error(e);
      // If the run failed/interrupted without producing any new output, clear the stale output
      const currentCell = store.cells.find(c => c.id === id);
      if (currentCell && currentCell.outputs === previousOutputs) {
        actions.clearCellOutput(id);
      }
    } finally {
      actions.setCellRunning(id, false);

      // Process next in queue
      const nextId = actions.popFromQueue();
      if (nextId) {
        // Default isReactiveCascade=true handles reactive mode correctly
        actions.executeCell(nextId, runKernel);
      }
    }
  },

  addToQueue: (id: string) => {
    if (!store.executionQueue.includes(id)) {
      setStore("executionQueue", produce(q => q.push(id)));
      actions.setCellQueued(id, true);
    }
  },

  popFromQueue: () => {
    const id = store.executionQueue[0];
    if (id) {
      setStore("executionQueue", produce(q => q.shift()));
      actions.setCellQueued(id, false);
      return id;
    }
    return null;
  },

  clearAllOutputs: () => {
    setStore("cells", {}, "outputs", undefined);
  },

  resetExecutionState: () => {
    setStore("executionQueue", []);
    setStore("cells", {}, (cell) => ({ ...cell, isRunning: false, isQueued: false }));
  },

  deleteAllCells: () => {
    if (store.cells.length === 0) return;

    // Use batching to make this a single undoable action
    actions.beginBatch();
    try {
      // Delete cells from last to first to preserve indices in history
      const ids = store.cells.map(c => c.id);
      for (let i = ids.length - 1; i >= 0; i--) {
        actions.deleteCell(ids[i]);
      }
    } finally {
      actions.endBatch();
    }

    // Autosave
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  loadNotebook: (cells: CellData[], filename: string, history?: HistoryEntry[], historyIndex?: number, activeCellId?: string | null, executionMode?: ExecutionMode) => {
    setStore({
      cells,
      filename,
      activeCellId: activeCellId || null,
      history: history || [],
      historyIndex: historyIndex !== undefined ? historyIndex : (history ? history.length - 1 : -1),
      // Use document's execution mode if provided, otherwise use app default
      executionMode: executionMode || APP_DEFAULT_EXECUTION_MODE,
      // Reset reactive mode state when loading a new notebook
      cellDependencies: new Map(),
      dependenciesStale: executionMode === "reactive" // Need to analyze if loading in reactive mode
    });

    // Recovery Phase: Check for interrupted edits (orphaned preEditState)
    // This happens if the page was reloaded/closed while a Markdown cell was in edit mode.
    // The content is saved, but the history entry for the change wasn't committed.

    store.cells.forEach(cell => {
      if (cell.type === "markdown" && cell.preEditState && !cell.isEditing) {
        const oldContent = cell.preEditState.content;
        const newContent = cell.content;

        // Only add history if there was an actual change
        if (oldContent !== newContent) {
          // Add to history so user can Undo the change they made before reload
          addToHistory(`u|${cell.id}|${escapeContent(oldContent)}|${escapeContent(newContent)}`);
        }

        // Clean up the dangling state
        setStore("cells", (c) => c.id === cell.id, "preEditState", undefined);
      }
    });
  },

  setPresentationMode: (enabled: boolean) => {
    setStore("presentationMode", enabled);
    // Clear active cell and exit edit mode when entering presentation
    if (enabled) {
      // Commit pending edits
      store.cells.forEach(cell => {
        if (cell.isEditing) {
          // Only commit markdown cells directly here
          // Code cells will be committed via CodeEditor's readOnly effect
          if (cell.type === "markdown") {
            commitEditSession(cell.id, cell.content);
          }
        }
      });
      setStore("activeCellId", null);
      setStore("cells", () => true, "isEditing", false);
    }
  },

  dispatchEditorAction: (id: string, action: "undo" | "redo") => {
    setStore("cells", (c) => c.id === id, "editorAction", action);
  },

  clearEditorAction: (id: string) => {
    setStore("cells", (c) => c.id === id, "editorAction", undefined);
  },

  updateEditorCapabilities: (id: string, canUndo: boolean, canRedo: boolean) => {
    setStore("cells", (c) => c.id === id, { canUndo, canRedo });
  }
};
