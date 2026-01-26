# Communication Protocol

This doc details the message format between the main thread and the Web Worker. For the higher-level architecture, see [wasm-bridge.md](../system-architecture/wasm-bridge.md).

## Message Flow

```
Main Thread                              Worker
    │                                      │
    │ ─── { type: "run", ... } ──────────▶ │  Execute code
    │                                      │
    │ ◀── { type: "stdout", ... } ──────── │  Print output
    │ ◀── { type: "stderr", ... } ──────── │  Errors
    │ ◀── { type: "result", ... } ──────── │  Done
    │                                      │
    │ ─── { type: "interaction", ... } ──▶ │  User moved slider
    │                                      │
    │ ◀── { type: "component_update", ... }│  Python updated component
```

## Main Thread → Worker Messages

Sent by `Kernel` class (`pyodide.ts`) to the worker's `onmessage` handler.

### `init`

Tells worker to load Pyodide and set up the Python environment.

```typescript
{ type: "init" }
```

### `run`

Execute Python code for a cell.

```typescript
{
  type: "run",
  id: string,      // Cell UUID
  code: string     // Python source code
}
```

### `interaction`

Forward a user interaction to a Python component.

```typescript
{
  type: "interaction",
  uid: string,     // Component UUID
  data: any        // Event payload, e.g., { value: 75 }
}
```

### `set_cell_context`

Set which cell owns subsequently created UI components.

```typescript
{
  type: "set_cell_context",
  id: string       // Cell UUID
}
```

### `clear_cell_context`

Clean up UI components belonging to a cell.

```typescript
{
  type: "clear_cell_context",
  id: string       // Cell UUID
}
```

## Worker → Main Thread Messages

Sent by worker's `postMessage()` to `Kernel.worker.onmessage`.

### `ready`

Pyodide finished loading. Kernel sets status to "ready".

```typescript
{ type: "ready" }
```

### `stdout`

A `print()` statement produced output.

```typescript
{
  type: "stdout",
  id: string,        // Cell UUID (which cell produced this)
  content: string    // The text (may contain UI markers)
}
```

### `stderr`

Error or warning output.

```typescript
{
  type: "stderr",
  id: string,
  content: string
}
```

### `result`

Cell execution finished.

```typescript
{
  type: "result",
  id: string,        // Cell UUID
  result?: {
    type: string,           // MIME type
    content: string | null, // Serialized content
    isUiElement?: boolean   // True if it's a pynote_ui component
  }
}
```

### `component_update`

A Python component pushed a state update.

```typescript
{
  type: "component_update",
  uid: string,          // Component UUID
  data: any             // Updated properties, e.g., { value: 75 }
}
```

## stdout Markers

The stdout stream contains special markers for mixed content:

```
\x02PYNOTE_UI\x02{json}\x02/PYNOTE_UI\x02          → UI component JSON
\x02PYNOTE_MD_STYLED\x02{md}\x02/PYNOTE_MD_STYLED\x02  → Styled markdown
\x02PYNOTE_MD_PLAIN\x02{md}\x02/PYNOTE_MD_PLAIN\x02    → Plain markdown (monospace)
```

`\x02` is STX (start of text). Markers use a self-closing XML-like pattern: `\x02TYPE\x02content\x02/TYPE\x02`. `Output.tsx` parses these to render mixed content.

<details>
<summary><strong>Parsing logic</strong></summary>

```
stdout text
    │
    ▼
Check for \x02 marker
    │
    ├── No marker → render as plain text
    │
    └── Has marker → extract until \x02/TYPE\x02 closing marker
            │
            ├── PYNOTE_UI → parse JSON, render component
            ├── PYNOTE_MD_STYLED → render markdown with prose styling
            └── PYNOTE_MD_PLAIN → render markdown monospace
```

</details>

## Example: Running a Cell

```
Main                                     Worker
  │                                        │
  │ { type:"run", id:"abc", code:"..." }   │
  │ ─────────────────────────────────────▶ │
  │                                        │
  │                                 set context
  │                                 run code
  │                                        │
  │ { type:"stdout", id:"abc",             │
  │   content:"Hello\n" }                  │
  │ ◀───────────────────────────────────── │
  │                                        │
  │ { type:"result", id:"abc",             │
  │   result: { type:"text/plain",         │
  │             content:"42" } }           │
  │ ◀───────────────────────────────────── │
```

## Example: UI Component Interaction

```
Main                                     Worker
  │                                        │
  │  User drags slider                     │
  │                                        │
  │ { type:"interaction",                  │
  │   uid:"slider-xyz",                    │
  │   data: { value: 75 } }                │
  │ ─────────────────────────────────────▶ │
  │                                        │
  │                           StateManager.update()
  │                           slider._value = 75
  │                           callback runs
  │                                        │
  │                           (if callback does slider.label = "New")
  │                                        │
  │ { type:"component_update",             │
  │   uid:"slider-xyz",                    │
  │   data: { label: "New" } }             │
  │ ◀───────────────────────────────────── │
```

## Example: Python Pushes Update

```python
slider.value = 80  # In Python
```

```
Worker                                   Main
  │                                        │
  │  property setter triggers              │
  │  send_update(value=80)                 │
  │                                        │
  │ { type:"component_update",             │
  │   uid:"slider-xyz",                    │
  │   data: { value: 80 } }                │
  │ ─────────────────────────────────────▶ │
  │                                        │
  │                           Kernel routes to listener
  │                           signal updates
  │                           UI re-renders
```
