# State Management

State in PyNote is split between the frontend (SolidJS store) and the Python side (StateManager in pynote_ui). This doc covers both.

## Frontend State

All notebook state lives in `src/lib/store.ts` using SolidJS's `createStore`.

<details>
<summary><strong>Background: SolidJS createStore</strong></summary>

`createStore` returns a reactive proxy object and a setter function. When you read a property, SolidJS tracks which component read it. When you write via the setter, only components that depend on that specific property re-render.

Unlike React's useState (which triggers full component re-renders), SolidJS updates are surgical: if you change `cells[2].isRunning`, only the DOM nodes that read `cells[2].isRunning` get updated.

The setter uses a path-based API:
```typescript
const [state, setState] = createStore({ cells: [...] });
setState("cells", 2, "isRunning", true);  // Update cells[2].isRunning
```

</details>

### Data Structures

**CellData** represents one cell:

```typescript
interface CellData {
  id: string;                    // nbformat cell id, kept from the file; new ones are 8 hex characters
  type: "code" | "markdown" | "raw";
  content: string;               // Source code or markdown text
  metadata?: {                   // Other tools' keys are kept as they are
    pynote?: {                   // PyNote's own cell settings
      codeview?: CellCodeVisibility;
      autorun?: boolean;
      autorunOnRefresh?: boolean;
      placeholder?: string;
    };
  };
  attachments?: JsonObject;      // Markdown and raw cell attachments (images pasted in Jupyter)
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

**NotebookState** is the whole notebook:

```typescript
interface NotebookState {
  cells: CellData[];
  filename: string;
  activeCellId: string | null;
  history: HistoryEntry[];       // Undo/redo log
  historyIndex: number;          // Current position (-1 = no history)
  presentationMode: boolean;     // Hide editing UI
  executionMode: "queue_all" | "hybrid" | "direct" | "reactive";
  executionQueue: string[];      // Cell IDs waiting to run
  sidebarAlignment: "top" | "center" | "bottom";
  documentMetadata: JsonObject;  // The loaded file's notebook metadata, written back on save
}
```

### Execution Queue

Four modes, set via toolbar:

| Mode | Behavior |
|:-----|:---------|
| **Queue All** | Every cell run joins a queue. Cells execute strictly one at a time. |
| **Hybrid** (default) | Cell queues only if the **immediately previous** cell (above it) is running or queued. Otherwise runs immediately. This preserves top-to-bottom execution order while allowing parallel execution of non-adjacent cells. |
| **Direct** | No queueing. Cells run immediately even if others are running. Can cause race conditions. |
| **Reactive** | Running a cell first analyzes which names it defines and uses, then queues every cell downstream of it (the cells that use its names, directly or through other cells), which run after it one at a time, in dependency order. |

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
| `D` | `D\|index\|type\|id\|metadata\|content` | Cell was deleted; `metadata` is the cell's metadata as JSON, escaped like the content (undo also reads the older `d\|index\|type\|id\|content`) |
| `m` | `m\|fromIndex\|toIndex\|id` | Cell was moved |
| `u` | `u\|id\|oldContent\|newContent` | Markdown content changed |
| `h` | `h\|id\|entryPos\|exitPos\|exitContent` | Code cell editor history position changed (`exitContent` serves redo when the cell was deleted and recreated, which loses its CodeMirror history) |
| `b` | `b\|[entry, ...]` | Several entries undone and redone as one (`beginBatch` and `endBatch`) |

<details>
<summary><strong>Why this format?</strong></summary>

Pipe-delimited strings are much smaller than JSON objects.
Since history gets saved to localStorage with the session, and into the notebook file (`metadata.PyNote.history`), compact format matters.
Pipes in content are escaped as `\|`, backslashes as `\\`.

A deleted cell's attachments stay out of its entry, which could grow by megabytes: undo takes them from memory, and the session's document data in IndexedDB still holds them by cell id, so a later load gives them back to the restored cell.

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
| `_instances` | `{uuid: object}`, every active UIElement |
| `_instances_by_cell` | `{cell_id: [uuid, ...]}`, which cell owns which components |
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

`src/lib/session.ts` keeps each notebook as a session, so a reload or a closed tab does not lose it.
A session lives in two browser stores, chosen for how they fail.
localStorage writes synchronously, so even the last edit before a reload or a closed tab is kept, but it holds only about 5 million characters for the whole site (every session and preference together).
IndexedDB holds gigabytes, but a write still pending when the page unloads can be dropped.

| Feature | Details |
|:--------|:--------|
| Multi-session | The 10 most recently used sessions, plus every session open in a tab |
| URL routing | Session ID in `?session=uuid` query param (`export-<id>` in an interactive web app export) |
| Autosave | On cell changes (add, edit, retype, delete, move, undo and redo, leaving edit mode, view options) and presentation mode, 300 ms after the last one (`AUTOSAVE_DEBOUNCE_MS` in `Notebook.tsx`); at once when the Theme or Code Visibility dialog saves, when a file opens, and when the page is hidden or unloads |
| LRU eviction | Beyond 10 sessions, or when storage is full, the least recently used sessions that no tab has open are dropped; a full storage drops sessions only when that makes the save fit |
| Warnings | "NOT AUTOSAVED" in the toolbar while the browser cannot store the notebook, and "ATTACHMENTS LOST" when the browser no longer has the attachments and metadata of the file the notebook was opened from |

### Storage Format

```
localStorage keys:
  pynote-sessions-index  → [{id, filename, lastAccessed, snippet?}, ...]
  pynote-session-{uuid}  → What PyNote edits (cells, history, settings, theme, code view)

IndexedDB databases (one object store each, keyed by session id):
  pynote-session-documents / documents  → {attachments, metadata}: what an opened file brought that PyNote never edits
  pynote-file-handles / handles         → The FileSystemFileHandle of the file Save writes to
```

Every autosave rewrites the localStorage entry.
It holds the cells (ids, types, sources and metadata, without outputs or transient flags such as running and editing), the undo history and its position, the active cell, the execution mode and the notebook's other settings, the session's own theme when it has one, the code visibility settings with their cell overrides, and the PyNote settings (`metadata.PyNote`) the document was opened with, without their copy of the undo history.

The document data in IndexedDB is the cells' attachments (by cell id) and the notebook metadata other than PyNote's (kernelspec, other tools' keys such as widget state), which can run to megabytes (images pasted into Jupyter).
It is written when a file is opened, and the new session refers to it (`documentData: "indexeddb"`) only once it is stored; autosaves then leave that data out.
The tab showing the session keeps the data in memory and writes it again if another tab drops the session (see [Sessions Open in a Tab](#sessions-open-in-a-tab)); its next save refers to the data while that write is under way.
A session whose document data the browser lost says so (`documentData: "lost"`, see [Restore Order](#restore-order)).
Where IndexedDB is unavailable, the data stays inline in the localStorage entry.
An interactive web app export carries that data itself, so its sessions leave it out as well.

The Files and Data panel's `/workspace` persists separately, through Pyodide's IDBFS (see [files-data-panel-architecture.md](files-data-panel-architecture.md)).

### Opening a File

A notebook opened from a file becomes a new session, and its document data goes to IndexedDB before anything refers to it.

- Through the File System Access API it opens in place: the notebook it replaces first writes its pending edits to its own session, then the URL switches to the new session, and the file handle goes to IndexedDB, so Save keeps writing to that file after reloads (asking for write permission again when the browser dropped it).
- Through the fallback file input (no handle), the notebook is stored as the new session and the page loads it, so Back returns to the previous notebook.
  When the browser cannot store it, it opens in place instead, with the warning showing.

A notebook opened in place does not inherit the ATTACHMENTS LOST warning of the notebook it replaces.

### Restore Order

On a page load with a `?session=` id, `restoreNotebook` (in `Notebook.tsx`):

1. Reads the localStorage entry; without one (or without cells), the page starts a new notebook, or the built-in notebook the URL names.
2. Holds the session's Web Lock, so other tabs leave it alone (see [Sessions Open in a Tab](#sessions-open-in-a-tab)), and once the lock is held, marks the session as used (`touchSession`): opening a session counts, not only saving it.
3. Applies the session's theme first, so the page never shows the notebook in the wrong theme while its document data loads, then its code visibility settings.
4. Reads the document data, from IndexedDB or from the web app export the notebook came from, with autosave paused while it loads, since the notebook is not in the store yet.
5. Restores the file handle from IndexedDB.
   If the document data is gone (the browser cleared IndexedDB but kept localStorage, or the page reloaded while its tab was writing the data again), the handle is deleted for good, so Save asks where to save instead of overwriting the file without its attachments and metadata.
   The toolbar then says "ATTACHMENTS LOST" (only its icon on narrow screens), whose tooltip says what is missing and that Save does not overwrite the opened file, which still has it.
   The session remembers the loss (`documentData: "lost"`), so the warning shows after later reloads too; a file the notebook is saved to after the loss becomes Save's target as usual.
6. Loads the cells without running state or outputs, with their attachments merged back by cell id, and the notebook metadata from the document data with the session's own over it.

A session without its own theme then gets the app theme, and cells autorun when their autorun settings cover a page refresh.

### Sessions Open in a Tab

Tabs share localStorage, so one tab could drop a session that another tab shows, and with it that session's document data and file handle.
To prevent that, each tab holds a shared Web Lock named after the session it shows (`pynote-session:<id>`): `holdSession` takes it with the tab's first save or restore, and lets go of the one the tab held before.
A tab learns which sessions are open from `navigator.locks.query()` (`refreshOpenSessions`): at startup, once its own lock is granted, when another tab changes the session index (a `storage` event), and after every save.
An older look never replaces a newer one, and `refreshOpenSessions` resolves once a look at least as recent as the call is in.
Neither the 10-session limit nor making room drops a session open in a tab, and no session is dropped before the tab's first look (`mayDropSessions`).
A tab that lets go of a session only it showed (it opened another notebook in place) stops counting that session as open, from the lock counts of its last look, so its next save can use the room; a session another tab also shows stays protected.

Web Locks are missing in older browsers and outside secure contexts, and refused for good where the page has no origin of its own (a sandboxed frame); such a tab works as in a browser without them, where any session but the one being saved may be dropped.
A tab whose session was dropped anyway (also by a tab that had not seen its lock yet) stores all of it again.
It remembers that it stored its session, and when an autosave finds the localStorage entry gone, it writes the document data back to IndexedDB from memory, and the file handle too, along with the entry; if IndexedDB refuses the document data, it goes inline in the entry instead.
The tab does this at once when it is shown again or comes back from the back/forward cache, so a reload before the next edit still finds the whole session.

### Quota and Eviction

`saveSession` writes the localStorage entry (`writeSession`) and returns whether the browser kept it.
When storage is full (`QuotaExceededError`), the save makes room only when that makes it fit:

1. The sessions that may go (`evictionCandidates`) are the stored ones other than the one being saved and those open in a tab: first those the index lost track of (an interrupted write), then the least recently used.
2. When the save would not fit even without all of them, it fails at once and takes none out.
3. Otherwise they are taken out of localStorage one at a time until the write fits, and then dropped for good (`dropSessions`): the index first, so it never lists a session whose data is gone, then each one's entry, document data and file handle.
4. When the write still does not fit, or another error comes up, they are all put back as they were, so a save that fails loses nothing.

Step 2 measures against the smallest total the browser has refused so far (`refusedTotal`, the characters of every key and value, as browsers count them), so typing in a notebook too big for the browser's storage does not take the other sessions out and put them back with every keystroke.
The write itself is always tried first, so a save that fits once the rest of storage has shrunk goes through.

A save that fails logs why and returns false.
The toolbar then shows "NOT AUTOSAVED" (only its icon on narrow screens), whose tooltip says that reloading or closing the tab would lose the latest changes, and to save the notebook to a file; the next autosave that succeeds hides it.
A notebook too big for localStorage is not autosaved anywhere, and the other sessions stay as they are.
When a save fails and the one before it did not, it is tried once more after the tab has looked at the locks again (`retryAutosave`), unless a newer save is due anyway: the room it needs may belong to a notebook whose tab has closed since the last look, which closing a tab does not announce.
After a save, `updateSessionIndex` keeps the 10 most recently used sessions, the one saved and every session open in a tab, and drops the rest (the index first, then their data); when only updating the index fails, the session is still stored.

Nothing prunes document data whose session was never stored (storage was full when the file opened, and the tab closed before an autosave succeeded): pruning entries the index does not list would race another tab that is opening a file at that moment.

### API

| Function | What it does |
|:---------|:-------------|
| `getSessionIdFromUrl()` | Extract session ID from URL |
| `setSessionIdInUrl(id)` | Update URL without page reload |
| `createNewSessionUrl()` | Generate URL for new session |
| `holdSession(id)` | Hold the Web Lock of the session this tab shows, letting go of the one it held before; resolves once the lock is held and the tab has looked again (at once without Web Locks) |
| `refreshOpenSessions()` | Look again at which sessions are open in a tab; resolves once a look at least as recent as the call is in |
| `mayDropSessions()` | Whether sessions may be dropped now: once this tab has looked at the locks, or at once without Web Locks |
| `getSessions()` | List all session metadata |
| `updateSessionIndex(meta)` | Put a session in the index as used now, keeping the 10 most recently used, it, and every session open in a tab |
| `touchSession(id, filename)` | Mark a session as used now (opening it counts, not only saving it) |
| `loadSession(id)` | Load the localStorage entry |
| `isStored(id)` | Whether the session's entry is in localStorage (it was not dropped) |
| `saveSession(id, data)` | Save and update the index, making room when storage is full; false when the browser could not keep it |
| `writeSession(id, json)` | Write the entry, making room only when that makes it fit; false when it is not stored |
| `saveDocumentData(id, data)` | Keep a session's document data in IndexedDB; false when it could not |
| `loadDocumentData(id)` | Read a session's document data (null when it is gone) |
| `evictionCandidates(keep)` | The sessions that may be dropped to make room for `keep`, first to last |
| `dropSessions(ids)` | Remove sessions: the index first, then each one's entry, document data and file handle |
| `deleteSession(id)` | Remove one session (`dropSessions([id])`) |
| `clearAllSessions()` | Delete every indexed session and the index |

`src/lib/idb-store.ts` is the small IndexedDB key-value store behind both databases: each call opens its database and closes it when done, and a write resolves once its transaction has committed.
`src/lib/file-handles.ts` keeps each session's file handle, from Open or from the save picker; storing one is best effort, since Save still works through the picker or a download.
