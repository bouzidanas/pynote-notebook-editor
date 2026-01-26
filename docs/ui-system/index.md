# UI System Overview

The `pynote_ui` package lets Python code create interactive UI components that render as native SolidJS/DaisyUI widgets in the browser. This doc explains how it works.

## The Core Idea

Python objects describe what UI should exist. The frontend renders and manages the actual DOM. They stay in sync via messages.

```
Python: slider = Slider(value=50)     →  JSON description sent to frontend
Frontend: renders <input type="range">  →  User drags slider
Python: slider.value becomes 75       ←  Interaction message received
```

The Python object is a "remote handle"—it controls a component that lives somewhere else (the DOM). This keeps logic in Python while using the browser's native UI capabilities.

<details>
<summary><strong>Background: Why not just inject HTML?</strong></summary>

You could have `_repr_html_()` return `<input type="range">` and inject it into the DOM. Problems:

1. **XSS risk** — User code could inject `<script>` tags
2. **No bidirectional binding** — How does Python know when the user moved the slider?
3. **Styling inconsistency** — Inline HTML doesn't pick up DaisyUI themes
4. **State management** — What happens when Python does `slider.value = 75`? You'd need to find the DOM element and update it manually

The JSON + message approach solves all of these: sanitized data only, explicit interaction events, native components, and reactive state sync.

</details>

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Worker                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Python Object (e.g., Slider)                            │  │
│  │  - Has UUID                                              │  │
│  │  - Registered with StateManager                          │  │
│  │  - _repr_mimebundle_() → JSON                            │  │
│  │  - send_update() → posts message to frontend             │  │
│  │  - handle_interaction() → receives user events           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                         postMessage
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Main Thread                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SolidJS Component (e.g., Slider.tsx)                    │  │
│  │  - Renders DaisyUI <input type="range">                  │  │
│  │  - Registers listener with Kernel                        │  │
│  │  - Sends interactions via kernel.sendInteraction()       │  │
│  │  - Updates signal when Python pushes changes             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | What it does |
|:-----|:-------------|
| `src/lib/pyodide.worker.ts` | Contains embedded `pynote_ui` Python code (core.py, elements.py) |
| `src/components/ui-renderer/UIOutputRenderer.tsx` | Receives JSON, looks up component, mounts it |
| `src/components/ui-renderer/ComponentRegistry.tsx` | Maps type names ("Slider") to SolidJS components |
| `src/components/ui-renderer/Slider.tsx`, etc. | Individual component implementations |
| `src/components/Output.tsx` | Parses stdout for UI markers, text, markdown |

## Lifecycle

1. **Python creates object:** `slider = Slider(value=50)` → generates UUID, registers with StateManager
2. **Cell displays result:** `_repr_mimebundle_()` returns `{"id": "...", "type": "Slider", "props": {...}}`
3. **Frontend renders:** `UIOutputRenderer` looks up "Slider" in registry, mounts the SolidJS component
4. **Component subscribes:** In `onMount`, calls `kernel.registerComponentListener(id, callback)`
5. **User interacts:** Moving slider triggers `kernel.sendInteraction(id, {value: 75})`
6. **Python receives:** Worker routes to `slider.handle_interaction({value: 75})`, internal state updates
7. **Python pushes update:** `slider.label = "New"` → `send_update(label="New")` → frontend callback fires → signal updates
8. **Cleanup:** When cell re-runs, `StateManager.clear_cell(id)` removes Python objects; `onCleanup` unregisters listeners

## StateManager

Lives in `pynote_ui/core.py`. Tracks all active components and routes messages.

| Attribute | Purpose |
|:----------|:--------|
| `_instances` | `{uuid: object}` — all active UIElements |
| `_instances_by_cell` | `{cell_id: [uuid, ...]}` — ownership tracking for GC |
| `_current_cell_id` | ContextVar — which cell is currently executing |

<details>
<summary><strong>Background: Why cell tracking?</strong></summary>

If you run `Slider()` 100 times, you'd have 100 orphaned objects. By tracking which cell created which components, `clear_cell(id)` can remove them all when the cell re-runs.

The cell ID is stored in a `contextvars.ContextVar` so it works correctly with async code—if Cell A awaits something while Cell B runs, they each keep their own cell ID.

</details>

## Output Markers

`pynote_ui` embeds UI in stdout using control character markers:

| Marker | What it contains |
|:-------|:-----------------|
| `\x02PYNOTE_UI\x02{json}\x02/PYNOTE_UI\x02` | UI component JSON |
| `\x02PYNOTE_MD_STYLED\x02{md}\x02/PYNOTE_MD_STYLED\x02` | Styled markdown (prose formatting) |
| `\x02PYNOTE_MD_PLAIN\x02{md}\x02/PYNOTE_MD_PLAIN\x02` | Plain markdown (monospace) |

`Output.tsx` parses these to render mixed content (text + UI + markdown).

The `display()` function uses these markers to output components inline during execution, not just as the cell's return value.

## Available Components

### Slider

```python
slider = Slider(value=50, min=0, max=100, step=1, label="Volume")
slider.value  # Read current value
slider.value = 75  # Update (pushes to frontend)
```

Props: `value`, `min`, `max`, `step`, `label`, `width`, `height`, `grow`, `shrink`, `force_dimensions`

### Text

```python
text = Text(content="Hello", align_h="center", align_v="center")
text.content = "Updated!"
```

Props: `content`, `align_h` ("left"/"center"/"right"), `align_v` ("top"/"center"/"bottom"), layout props

### Group

```python
row = Group([
    Slider(value=50, label="X"),
    Slider(value=50, label="Y"),
], layout="row", label="Position", border=True)
```

Props: `children`, `layout` ("row"/"col"), `label`, `border`, `padding`, `align`, layout props

## Utility Functions

### display()

Output components inline during execution:

```python
display(slider1, slider2)           # Vertical stack
display(a, b, inline=True, gap=2)   # Horizontal row
```

### print_md()

Output markdown:

```python
print_md("# Heading\n**Bold** text")      # Styled (prose formatting)
print_md("Debug output", styled=False)    # Plain (monospace)
```

## Layout System

All components support flex layout props:

| Prop | Effect |
|:-----|:-------|
| `width` | Fixed width (px number, CSS string, or "full" for 100%) |
| `height` | Fixed height (px number or CSS string) |
| `grow` | flex-grow value—how much to expand |
| `shrink` | flex-shrink value—how much to contract |
| `force_dimensions` | If True, width/height override flex sizing |

Without `grow`, components fit their content. With `grow`, they expand to fill available space.
