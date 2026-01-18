import { createStore, produce } from "solid-js/store";

export type CellType = "code" | "markdown";

export interface CellData {
  id: string;
  type: CellType;
  content: string;
  outputs?: {
    stdout: string[];
    stderr: string[];
    result?: string;
    error?: string;
  };
  isEditing?: boolean;
}

// Compact history format:
// a=add, d=delete, m=move
// Format: "action|data"
// Add: "a|index|type|id"
// Delete: "d|index|type|id|content"
// Move: "m|fromIndex|toIndex|id"
type HistoryEntry = string;

export interface NotebookState {
  cells: CellData[];
  filename: string;
  activeCellId: string | null;
  history: HistoryEntry[];
  historyIndex: number; // Current position in history (-1 = no history)
  presentationMode: boolean;
}

const MAX_HISTORY = 100;

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

  clearCellOutput: (id: string) => {
    setStore("cells", (c) => c.id === id, "outputs", undefined);
  },

  deleteCell: (id: string) => {
    const cell = store.cells.find(c => c.id === id);
    const idx = store.cells.findIndex((c) => c.id === id);

    if (idx !== -1 && cell) {
      // Add to history before deleting: "d|index|type|id|content"
      // Escape pipes in content
      const escapedContent = cell.content.replace(/\|/g, '\\|');
      addToHistory(`d|${idx}|${cell.type}|${id}|${escapedContent}`);

      setStore("cells", produce((cells) => {
        cells.splice(idx, 1);
      }));
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
      const content = contentParts.join('|').replace(/\\\|/g, '|');
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
    }
  },

  setActiveCell: (id: string | null) => {
    setStore("activeCellId", id);
    setStore("cells", (c) => c.id !== id, "isEditing", false);
  },

  // Internal callback for autosave, set by Notebook.tsx
  __autosaveCallback: undefined as undefined | (() => void),
  __setAutosaveCallback(cb: () => void) {
    (actions as any).__autosaveCallback = cb;
  },
  setEditing: (id: string, isEditing: boolean) => {
    setStore("cells", (c) => c.id === id, "isEditing", isEditing);
    // Call autosave only when leaving edit mode
    if (!isEditing && (actions as any).__autosaveCallback) {
      (actions as any).__autosaveCallback();
    }
  },

  loadNotebook: (cells: CellData[], filename: string, history?: HistoryEntry[]) => {
    setStore({
      cells,
      filename,
      history: history || [],
      historyIndex: history ? history.length - 1 : -1
    });
  },

  setPresentationMode: (enabled: boolean) => {
    setStore("presentationMode", enabled);
    // Clear active cell and exit edit mode when entering presentation
    if (enabled) {
      setStore("activeCellId", null);
      setStore("cells", () => true, "isEditing", false);
    }
  }
};
