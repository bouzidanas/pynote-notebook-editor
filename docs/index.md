# PyNote Documentation

PyNote is a browser-based Python notebook. It runs Python entirely in the browser using Pyodide, so no server is needed. The app uses SolidJS for the UI and includes a custom component system (`pynote_ui`) for interactive widgets.

## Running locally

```bash
npm install
npm run dev
# Open http://localhost:5173
```

## Documentation

### System Architecture

| Doc | What it covers |
|:----|:---------------|
| [Architecture Overview](system-architecture/architecture-spec.md) | High-level system design, pynote_ui basics |
| [WASM Bridge](system-architecture/wasm-bridge.md) | Message protocol between main thread and worker |
| [Pyodide Execution](system-architecture/pyodide-execution.md) | How Python code runs, context-aware output |
| [State Management](system-architecture/state-management.md) | SolidJS store, undo/redo, sessions |
| [Export System](system-architecture/export-system.md) | File formats, the Export dialog, web app exports, the embeddable `pynote` package |

### File Formats

| Doc | What it covers |
|:----|:---------------|
| [The .pynote Format](formats/pynote.md) | Specification of PyNote's Markdown-based notebook file |
| [Text Exports](formats/exports.md) | The `.py`, `.md` and `.py`/`.md` pair exports, and how they read back |

### UI Component System

| Doc | What it covers |
|:----|:---------------|
| [UI System Overview](ui-system/index.md) | How pynote_ui works, available components |
| [Communication Protocol](ui-system/protocol.md) | Message format specification |
| [State Synchronization](ui-system/state-sync.md) | Python ↔ SolidJS sync |
| [Adding Components](ui-system/adding-components.md) | How to create new components |

### Other

- [Debugging Guide](../DEBUGGING_GUIDE.md) for troubleshooting tips
- [Tutorial Notebook](../src/lib/tutorial-notebook.ts) with built-in examples

## Quick Reference

### Cell Types

- **Code cells:** Python with syntax highlighting (CodeMirror)
- **Markdown cells:** Rich text with live preview

### Execution Modes

| Mode | What happens |
|:-----|:-------------|
| **hybrid** (default) | Queue if the previous cell is running/queued, otherwise run immediately |
| **queue_all** | All cells queue, strict sequential execution |
| **direct** | Run immediately, even if other cells running (can cause races) |
| **reactive** | Running a cell also reruns the cells that use the names it defines, in dependency order |

### UI Components

```python
from pynote_ui import Slider, Text, Group

slider = Slider(value=50, label="Volume")
text = Text(content="Hello")

def on_change(data):
    text.content = f"Value: {data['value']}"

slider.on_update(on_change)
Group([slider, text], layout="col")
```

### Sessions

- Autosaved: localStorage keeps what you edit (cells, undo history, settings, theme, view); IndexedDB keeps an opened file's attachments and other tools' metadata, and the handle of the file Save writes to
- URL routing: `?session=<uuid>`
- The 10 most recently used sessions are kept, and every session open in a tab: when there are more, the least recently used that no tab has open are dropped, and when storage is full, only as many as make the save fit
- The toolbar says NOT AUTOSAVED when the browser cannot store the notebook, and ATTACHMENTS LOST when the browser no longer has an opened file's attachments and metadata (Save then asks where to save, so the file keeps them)

## Tech Stack

| Layer | Tech |
|:------|:-----|
| UI | SolidJS |
| Styling | TailwindCSS + DaisyUI |
| Editor | CodeMirror 6 |
| Python | Pyodide (the version pinned by `PYODIDE_VERSION` in `src/lib/pyodide-config.ts`) |
| Build | Vite |
| Types | TypeScript |

## Source layout

```
src/
├── lib/
│   ├── store.ts           # State management
│   ├── pyodide.ts         # Kernel class (main thread)
│   ├── pyodide.worker.ts  # Worker: loads Pyodide, runs cells
│   ├── python-runtime/    # Python the worker writes into Pyodide (pynote_ui, init code)
│   └── session.ts         # Sessions (localStorage and IndexedDB)
├── components/
│   ├── Notebook.tsx       # Main container
│   ├── CodeCell.tsx       # Code cell
│   ├── Output.tsx         # Output parser/renderer
│   └── ui-renderer/       # pynote_ui component renderers
└── index.tsx              # Entry point
```
