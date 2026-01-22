import { createStore, produce } from "solid-js/store";
import { kernel } from "./pyodide";

export type CellType = "code" | "markdown";

export interface CellData {
  id: string;
  type: CellType;
  content: string;
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
}

// Compact history format:
// a=add, d=delete, m=move, u=update
// Format: "action|data"
// Add: "a|index|type|id"
// Delete: "d|index|type|id|content"
// Move: "m|fromIndex|toIndex|id"
// Update: "u|id|oldContent|newContent"
type HistoryEntry = string;

export interface NotebookState {
  cells: CellData[];
  filename: string;
  activeCellId: string | null;
  history: HistoryEntry[];
  historyIndex: number; // Current position in history (-1 = no history)
  presentationMode: boolean;
  executionMode: "queue_all" | "hybrid" | "direct";
  executionQueue: string[]; // List of cell IDs waiting to run
  sidebarAlignment: "top" | "center" | "bottom";
}

const MAX_HISTORY = 100;

// Internal cache to track content at the start of an edit session
const editSessionStartContent = new Map<string, string>();

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
const commitEditSession = (id: string, currentContent: string) => {
  const startContent = editSessionStartContent.get(id);
  // Only commit if we actually have a start snapshot
  if (startContent !== undefined) {
    if (startContent !== currentContent) {
      // Content changed! Push to global history
      addToHistory(`u|${id}|${escapeContent(startContent)}|${escapeContent(currentContent)}`);
    }
    // Cleanup
    editSessionStartContent.delete(id);
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
  executionMode: "hybrid", // Default to Hybrid as requested
  executionQueue: [],
  sidebarAlignment: "top"
});

export const notebookStore = store;

// Helper to add to history
const addToHistory = (entry: HistoryEntry) => {
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
    const parts = entry.split('|');
    const action = parts[0];

    setStore("historyIndex", store.historyIndex - 1);

    // Reverse the action
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
        setStore("cells", (c) => c.id === updateData.id, "content", updateData.oldContent);
      }
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
    const parts = entry.split('|');
    const action = parts[0];

    // Replay the action
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
      }
    }    // Autosave after redo
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  setActiveCell: (id: string | null) => {
    // Commit any active edit sessions before switching
    store.cells.forEach(cell => {
      if (cell.isEditing && cell.id !== id) {
        commitEditSession(cell.id, cell.content);
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
        // Start of edit session: Cache the current content
        // Only if not already tracking (avoid overwriting start state on double calls)
        if (!editSessionStartContent.has(id)) {
          editSessionStartContent.set(id, cell.content);
        }
      } else {
        // End of edit session: Check for changes
        commitEditSession(id, cell.content);
      }
    }

    setStore("cells", (c) => c.id === id, "isEditing", isEditing);
    // Call autosave only when leaving edit mode
    if (!isEditing && (actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  setCellRunning: (id: string, isRunning: boolean) => {
    setStore("cells", (c) => c.id === id, "isRunning", isRunning);
  },

  setCellQueued: (id: string, isQueued: boolean) => {
    setStore("cells", (c) => c.id === id, "isQueued", isQueued);
  },

  setExecutionMode: (mode: NotebookState["executionMode"]) => {
    setStore("executionMode", mode);
  },

  runCell: (id: string, runKernel: (content: string, id: string) => Promise<void>) => {
    const cell = store.cells.find(c => c.id === id);
    if (!cell || cell.type !== "code" || cell.isRunning || cell.isQueued) return;

    const mode = store.executionMode;
    const isKernelRunning = store.cells.some(c => c.isRunning);
    const isKernelLoading = kernel.status === "loading";
    const prevIndex = store.cells.findIndex(c => c.id === id) - 1;
    const prevCell = prevIndex >= 0 ? store.cells[prevIndex] : null;
    const isPrevRunningOrQueued = prevCell && (prevCell.isRunning || prevCell.isQueued);

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

  executeCell: async (id: string, runKernel: (content: string, id: string) => Promise<void>) => {
    actions.setCellRunning(id, true);
    const cell = store.cells.find(c => c.id === id);
    if (!cell) return;

    const previousOutputs = cell.outputs;

    try {
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

    // Add to history as multiple deletes? Or just clear?
    // For simplicity, let's just clear. Or better, create a special 'clear all' history event if we wanted robust undo.
    // For now, I'll just clear the cells.
    // If we want undo, we could iterate and delete, but that might spam history.
    // Let's just clear for now, maybe add a "bulk delete" history type later if needed.
    // Actually, user might expect undo. Let's do it safe:
    // We can't easily undo a full clear with the current "single action" history logic without spamming.
    // I'll skip history for 'deleteAll' for now or just treat it as a non-undoable action unless I expand history logic.
    // Wait, the user asked for features, didn't explicitly demand undo for them, but it's good practice.
    // Given the constraints, I'll just implement the action.
    setStore("cells", []);
    // Autosave
    if ((actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  loadNotebook: (cells: CellData[], filename: string, history?: HistoryEntry[], historyIndex?: number, activeCellId?: string | null) => {
    setStore({
      cells,
      filename,
      activeCellId: activeCellId || null,
      history: history || [],
      historyIndex: historyIndex !== undefined ? historyIndex : (history ? history.length - 1 : -1)
    });
  },

  setPresentationMode: (enabled: boolean) => {
    setStore("presentationMode", enabled);
    // Clear active cell and exit edit mode when entering presentation
    if (enabled) {
      // Commit pending edits
      store.cells.forEach(cell => {
        if (cell.isEditing) {
          commitEditSession(cell.id, cell.content);
        }
      });
      setStore("activeCellId", null);
      setStore("cells", () => true, "isEditing", false);
    }
  }
};
