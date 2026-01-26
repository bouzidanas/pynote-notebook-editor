# Architecture Overview

PyNote is a browser-based Python notebook. It runs Python entirely in the browser using Pyodide (Python compiled to WebAssembly), with no backend server needed. The app uses SolidJS for the UI, TailwindCSS + DaisyUI for styling, and a custom UI component system called `pynote_ui` that lets Python code create interactive widgets.

<details>
<summary><strong>Background: Why run Python in the browser?</strong></summary>

Traditional notebooks (Jupyter) run Python on a server and communicate via WebSocket. That means:
- You need a server running somewhere
- Your code and data travel over the network
- Latency depends on connection quality

PyNote runs everything client-side. The Python interpreter itself runs in your browser as WebAssembly. Benefits:
- **No server needed** — works offline, no infrastructure to maintain
- **Privacy** — code and data never leave your machine
- **Instant startup** — no kernel connection to establish

The tradeoff is initial load time (a few seconds to download and initialize Pyodide, cached after first visit) and some packages that need native C extensions won't work unless they've been compiled for WASM.

</details>

## System Map

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────────────────┐    ┌────────────────────────┐    │
│  │   Main Thread (UI)   │    │   Web Worker           │    │
│  │                      │    │                        │    │
│  │  SolidJS + DaisyUI   │◄──►│  Pyodide + pynote_ui   │    │
│  │  Store (state)       │    │  Python execution      │    │
│  │  CodeMirror          │    │  Package management    │    │
│  │  Session persistence │    │                        │    │
│  └──────────────────────┘    └────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Main Thread:** Renders the notebook UI. SolidJS components, CodeMirror editors, cell management, undo/redo, session persistence. This is what users see and interact with.

**Web Worker:** Runs Pyodide and executes Python code. Lives in a separate thread so Python can compute without freezing the UI. Hosts the `pynote_ui` module that Python code uses to create widgets.

**The Bridge:** Messages sent via `postMessage()` between threads. The `Kernel` class (main thread) manages this communication. See [wasm-bridge.md](wasm-bridge.md) for the full protocol spec.

## The pynote_ui System

`pynote_ui` is a Python package that lets users create interactive UI components from Python code. When you write `Slider(value=50)`, it creates a Python object that tells the frontend to render a slider.

<details>
<summary><strong>Background: Why not just use ipywidgets?</strong></summary>

ipywidgets is the standard Jupyter widget library, but it:
- Has a massive dependency tree
- Relies on the Jupyter Comms protocol (designed for server-client, not worker-main-thread)
- Would require significant adaptation for a Pyodide environment

We built `pynote_ui` from scratch to be lightweight and fit the worker↔main-thread architecture naturally.

</details>

### How it works

1. **Python creates an object:** `slider = Slider(value=50)` creates a Python instance with a UUID
2. **Object registers itself:** The `StateManager` tracks all active UI objects and which cell created them
3. **Display produces JSON:** When the cell result is displayed, `_repr_mimebundle_()` emits JSON describing the component
4. **Frontend renders it:** `UIOutputRenderer` reads the JSON and mounts the corresponding SolidJS component
5. **Two-way sync:** User interactions go back to Python; Python property changes push to the frontend

### Why JSON instead of HTML?

The component's `_repr_mimebundle_()` returns JSON like:
```json
{
  "id": "abc123",
  "type": "Slider",
  "props": { "min": 0, "max": 100, "value": 50 }
}
```

Not HTML. Reasons:
- **Security:** No XSS risk from Python code injecting arbitrary HTML
- **Performance:** SolidJS mounts components from data faster than parsing HTML strings
- **Consistency:** Components use DaisyUI styling automatically, no inline styles needed

### StateManager and cell ownership

`StateManager` is a module-level registry in `pynote_ui/core.py`. It tracks:
- `_instances`: UUID → Python object mapping
- `_instances_by_cell`: Cell ID → list of component UUIDs

When you re-run a cell, the frontend tells the worker to clear that cell's components (`clear_cell_context`). StateManager removes all objects associated with that cell, preventing memory leaks from accumulating widgets.

<details>
<summary><strong>Background: Why track cell ownership?</strong></summary>

Without cell tracking, if you run `Slider()` 100 times, you'd have 100 slider objects in memory with no way to clean them up. By associating each component with the cell that created it, we can garbage collect them when the cell is re-run or deleted.

The current cell ID is stored in a `contextvars.ContextVar`, which correctly handles async code—if you `await` something in the middle of creating widgets, the cell ID is preserved in that async context.

</details>

## Frontend State

<details>
<summary><strong>Background: SolidJS stores</strong></summary>

SolidJS uses fine-grained reactivity. Instead of re-rendering entire component trees (like React), it tracks exactly which DOM nodes depend on which pieces of state and updates only those nodes.

`createStore` creates a reactive object. When you modify it (via the setter function), only components that read the modified properties re-render. This makes the UI very efficient even with frequent updates.

</details>

All notebook state lives in `src/lib/store.ts`. The main pieces:

**CellData** — one cell's state:
```typescript
{
  id: string,              // UUIDv4
  type: "code" | "markdown",
  content: string,         // source code or markdown text
  outputs: { ... },        // stdout, stderr, result, timing info
  isRunning: boolean,
  isQueued: boolean,
  // ... editor state, undo tracking
}
```

**NotebookState** — the whole notebook:
```typescript
{
  cells: CellData[],
  filename: string,
  activeCellId: string | null,
  history: HistoryEntry[],  // undo/redo log
  executionMode: "queue_all" | "hybrid" | "direct",
  executionQueue: string[], // cells waiting to run
  // ...
}
```

### Execution modes

| Mode | What happens when you run a cell |
|:-----|:---------------------------------|
| **Queue All** | Cell joins a queue. Cells run one at a time, in queue order. |
| **Hybrid** (default) | Cell queues only if the **immediately previous** cell (above it) is running or queued. Otherwise runs immediately. This preserves top-to-bottom order while allowing parallel execution of non-adjacent cells. |
| **Direct** | Cell runs immediately, even if other cells are running. Can cause race conditions. |

### Undo/Redo

The notebook maintains a compact action log. Each entry is a pipe-delimited string:

| Code | Meaning |
|:-----|:--------|
| `a\|index\|type\|id` | Cell added |
| `d\|index\|type\|id\|content` | Cell deleted (stores content for restore) |
| `m\|from\|to\|id` | Cell moved |
| `u\|id\|old\|new` | Markdown content changed |
| `h\|id\|entry\|exit` | Code cell editor history position changed |

This is compact because undo/redo gets saved to localStorage with each session.

## Session Persistence

`src/lib/session.ts` saves notebooks to localStorage:
- Up to 10 sessions stored
- URL routing via `?session=uuid` query parameter  
- Autosave on cell add/edit/delete/move
- LRU eviction when limit exceeded

## File Layout

Key files and what they do:

| File | Purpose |
|:-----|:--------|
| `src/lib/store.ts` | SolidJS store, all state and actions |
| `src/lib/pyodide.ts` | `Kernel` class, main-thread side of the bridge |
| `src/lib/pyodide.worker.ts` | Worker script, Pyodide setup, `pynote_ui` module |
| `src/lib/session.ts` | localStorage session management |
| `src/components/Notebook.tsx` | Main notebook component |
| `src/components/CodeCell.tsx` | Code cell rendering and execution |
| `src/components/Output.tsx` | Parses and renders cell output (text, UI, markdown) |
| `src/components/ui-renderer/` | SolidJS components for `pynote_ui` widgets |

## Available UI Components

From Python:
```python
from pynote_ui import Slider, Text, Group, display, print_md
```

| Component | What it does |
|:----------|:-------------|
| `Slider` | Range input with optional label |
| `Text` | Text display box with alignment options |
| `Group` | Container for layout (row/column), can have label and border |

All components support layout props: `width`, `height`, `grow`, `shrink`, `force_dimensions`

Utility functions:
- `display(a, b, ...)` — output multiple components inline
- `print_md("# Heading")` — output styled markdown
