# State Management

State in PyNote is split between the frontend (SolidJS store) and the Python side (StateManager in pynote_ui). This doc covers both.

## Frontend State

All notebook state lives in `src/lib/store.ts` using SolidJS's `createStore`.

<details>
<summary><strong>Background: SolidJS createStore</strong></summary>

`createStore` returns a reactive proxy object and a setter function. When you read a property, SolidJS tracks which component read it. When you write via the setter, only components that depend on that specific property re-render.

Unlike React's useState (which triggers full component re-renders), SolidJS updates are surgical—if you change `cells[2].isRunning`, only the DOM nodes that read `cells[2].isRunning` get updated.

The setter uses a path-based API:
```typescript
const [state, setState] = createStore({ cells: [...] });
setState("cells", 2, "isRunning", true);  // Update cells[2].isRunning
```

</details>

### Data Structures

**CellData** — represents one cell:

```typescript
interface CellData {
  id: string;                    // UUIDv4
  type: "code" | "markdown";
  content: string;               // Source code or markdown text
  outputs?: {
    stdout: string[];
    stderr: string[];
    result?: string;
    mimebundle?: any;
    error?: string;
    executionTime?: number;      // When execution started
    executionDuration?: number;  // How long it took (ms)
    executionCount?: number;     // [In] number
    executionKernelId?: string;  // Which kernel ran this
  };
  isEditing?: boolean;           // Currently in edit mode
  isRunning?: boolean;           // Currently executing
  isQueued?: boolean;            // Waiting in execution queue
  editorState?: any;             // CodeMirror/ProseMirror state (not persisted)
  preEditState?: {               // Snapshot for undo (markdown cells)
    content: string;
    editorState?: any;
  };
  targetHistoryPosition?: number; // For code cell undo navigation
  editorAction?: "undo" | "redo"; // Signal to trigger editor action
  canUndo?: boolean;
  canRedo?: boolean;
}
```

**NotebookState** — the whole notebook:

```typescript
interface NotebookState {
  cells: CellData[];
  filename: string;
  activeCellId: string | null;
  history: HistoryEntry[];       // Undo/redo log
  historyIndex: number;          // Current position (-1 = no history)
  presentationMode: boolean;     // Hide editing UI
  executionMode: "queue_all" | "hybrid" | "direct";
  executionQueue: string[];      // Cell IDs waiting to run
  sidebarAlignment: "top" | "center" | "bottom";
}
```

### Execution Queue

Three modes, set via toolbar:

| Mode | Behavior |
|:-----|:---------|
| **Queue All** | Every cell run joins a queue. Cells execute strictly one at a time. |
| **Hybrid** (default) | Cell queues only if the **immediately previous** cell (above it) is running or queued. Otherwise runs immediately. This preserves top-to-bottom execution order while allowing parallel execution of non-adjacent cells. |
| **Direct** | No queueing. Cells run immediately even if others are running. Can cause race conditions. |

### Actions

State mutations go through the `actions` object in `store.ts`:

| Action | What it does |
|:-------|:-------------|
| `addCell(type, index?)` | Create a cell, add to history for undo |
| `updateCell(id, content)` | Update cell content, trigger autosave |
| `deleteCell(id)` | Delete cell, clear its kernel state, add to history |
| `moveCell(from, to)` | Reorder cells, add to history |
| `runCell(id, runKernel)` | Execute cell (queues if needed based on mode) |
| `undo()` / `redo()` | Navigate history |
| `setEditing(id, bool)` | Toggle edit mode |
| `loadNotebook(...)` | Load notebook with recovery handling |

### Undo/Redo System

The history is a list of compact pipe-delimited strings:

| Code | Format | Meaning |
|:-----|:-------|:--------|
| `a` | `a\|index\|type\|id` | Cell was added |
| `d` | `d\|index\|type\|id\|content` | Cell was deleted |
| `m` | `m\|fromIndex\|toIndex\|id` | Cell was moved |
| `u` | `u\|id\|oldContent\|newContent` | Markdown content changed |
| `h` | `h\|id\|entryPos\|exitPos` | Code cell editor history position changed |

<details>
<summary><strong>Why this format?</strong></summary>

Pipe-delimited strings are much smaller than JSON objects. Since history gets saved to localStorage with the session, compact format matters. Pipes in content are escaped as `\|`, backslashes as `\\`.

</details>

**Edit session tracking:**
- **Markdown cells:** Snapshot content when edit starts (`preEditState`), compare when edit ends, record change if different
- **Code cells:** Track CodeMirror history position via `setCodeCellEntryPosition` and `commitCodeCellEditSession`

On `loadNotebook`, orphaned `preEditState` entries (from interrupted edits, like browser crash) are detected and committed to history.

## Python-Side State (StateManager)

The `StateManager` class in `pynote_ui/core.py` tracks all active UI components.

<details>
<summary><strong>Background: Why module-level state?</strong></summary>

Python's module system means that when you `import pynote_ui`, you get the same module object every time. Variables at module level act as singletons. StateManager uses class variables (not instance variables) so there's exactly one registry shared by all code.

</details>

### What it tracks

| Attribute | Purpose |
|:----------|:--------|
| `_instances` | `{uuid: object}` — every active UIElement |
| `_instances_by_cell` | `{cell_id: [uuid, ...]}` — which cell owns which components |
| `_current_cell_id` | ContextVar holding the currently executing cell's ID |
| `_comm_target` | Callback to send updates to the frontend |

<details>
<summary><strong>Background: contextvars</strong></summary>

`contextvars.ContextVar` is Python's way of having thread-local-like state that also works correctly with async/await. Each async task gets its own copy of the context, so if Cell A and Cell B run concurrently, they each have their own `_current_cell_id` value.

Without this, if Cell A creates a slider, then awaits something, then Cell B runs and creates a slider, Cell A's slider might get attributed to Cell B.

</details>

### Methods

| Method | What it does |
|:-------|:-------------|
| `set_current_cell(id)` | Set context for component registration |
| `clear_cell(id)` | Remove all components belonging to a cell |
| `register(instance)` | Add a new component, associate with current cell |
| `get(uid)` | Look up component by UUID |
| `update(uid, data)` | Route interaction to component's `handle_interaction` |
| `send_update(uid, data)` | Push update to frontend |

### Garbage Collection

When a cell is re-run:
1. Frontend sends `clear_cell_context` message with the cell ID
2. Worker calls `StateManager.clear_cell(id)`
3. StateManager looks up all UUIDs for that cell
4. Removes them from `_instances` and `_instances_by_cell`

This prevents accumulating orphaned widgets when you re-run a cell multiple times.

## Session Persistence

`src/lib/session.ts` saves notebooks to localStorage.

| Feature | Details |
|:--------|:--------|
| Multi-session | Up to 10 concurrent sessions |
| URL routing | Session ID in `?session=uuid` query param |
| Autosave | On cell add/edit/delete/move |
| LRU eviction | Oldest session removed when limit exceeded |

### Storage Format

```
localStorage keys:
  pynote-sessions-index  → [{id, filename, lastAccessed, snippet?}, ...]
  pynote-session-{uuid}  → Full notebook data (cells, filename, etc.)
```

### API

| Function | What it does |
|:---------|:-------------|
| `getSessionIdFromUrl()` | Extract session ID from URL |
| `setSessionIdInUrl(id)` | Update URL without page reload |
| `createNewSessionUrl()` | Generate URL for new session |
| `getSessions()` | List all session metadata |
| `loadSession(id)` | Load notebook data |
| `saveSession(id, data)` | Save and update index |
| `deleteSession(id)` | Remove session |
| `clearAllSessions()` | Delete everything |
