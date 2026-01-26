# PyNote Documentation

PyNote is a browser-based Python notebook. It runs Python entirely in the browser using Pyodide—no server needed. The app uses SolidJS for the UI and includes a custom component system (`pynote_ui`) for interactive widgets.

## Getting Started

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

### UI Component System

| Doc | What it covers |
|:----|:---------------|
| [UI System Overview](ui-system/index.md) | How pynote_ui works, available components |
| [Communication Protocol](ui-system/protocol.md) | Message format specification |
| [State Synchronization](ui-system/state-sync.md) | Python ↔ SolidJS sync |
| [Adding Components](ui-system/adding-components.md) | How to create new components |

### Other

- [Debugging Guide](../DEBUGGING_GUIDE.md) — Troubleshooting tips
- [Tutorial Notebook](../src/lib/tutorial-notebook.ts) — Built-in examples

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

- Auto-saved to localStorage
- URL routing: `?session=<uuid>`
- Max 10 sessions (oldest evicted)

## Tech Stack

| Layer | Tech |
|:------|:-----|
| UI | SolidJS |
| Styling | TailwindCSS + DaisyUI |
| Editor | CodeMirror 6 |
| Python | Pyodide 0.26.0 |
| Build | Vite |
| Types | TypeScript |

## Key Files

```
src/
├── lib/
│   ├── store.ts           # State management
│   ├── pyodide.ts         # Kernel class (main thread)
│   ├── pyodide.worker.ts  # Worker + embedded pynote_ui
│   └── session.ts         # Persistence
├── components/
│   ├── Notebook.tsx       # Main container
│   ├── CodeCell.tsx       # Code cell
│   ├── Output.tsx         # Output parser/renderer
│   └── ui-renderer/       # pynote_ui component renderers
└── index.tsx              # Entry point
```
