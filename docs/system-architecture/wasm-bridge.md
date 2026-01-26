# WASM Bridge (Communication Protocol)

PyNote runs Python in a Web Worker to keep the UI responsive. The "bridge" is how we send code to execute and receive results back. This document covers the message protocol and the `Kernel` class that manages it.

<details>
<summary><strong>Background: What is a Web Worker?</strong></summary>

A **Web Worker** is a JavaScript script that runs in a background thread, separate from the main thread. You create one using the Web Workers API (`new Worker('script.js')`).

**The main thread** is where your webpage lives—it handles DOM updates, user interactions (clicks, typing), and renders the UI. There's only one main thread, and it processes tasks sequentially. If any task takes too long (like running a complex Python computation), the page becomes unresponsive: buttons don't click, scrolling stutters, the tab might show "not responding."

**A Web Worker** runs in its own thread with its own event loop. It can do heavy computation without blocking the main thread. The tradeoff: workers can't access the DOM directly. They can only communicate with the main thread by sending messages back and forth (`postMessage` / `onmessage`).

**Where does it run?** Both threads run in the same browser process, on the same machine. The OS schedules them across CPU cores. The worker doesn't run on a server—it's entirely client-side, just in a different thread.

**Why PyNote uses one:** Pyodide (Python compiled to WebAssembly) can take seconds to execute code. Running it on the main thread would freeze the notebook UI. By running Pyodide in a worker, users can still scroll, edit other cells, or click buttons while Python executes.

</details>

<details>
<summary><strong>Background: What is Pyodide?</strong></summary>

**Pyodide** is the CPython interpreter compiled to WebAssembly (WASM). It lets you run actual Python code in the browser—not a subset, not a transpiler, but real Python 3.11+ with most of the standard library.

**How it works:** The CPython source code (written in C) gets compiled to WASM using Emscripten. The result is a ~10MB binary that browsers can execute. When you call `pyodide.runPython("print('hello')")`, it's running the same interpreter that would run on your machine, just compiled for a different target.

**What you get:**
- Full Python syntax and semantics
- Most standard library modules (some OS-specific ones don't make sense in a browser)
- NumPy, Pandas, Matplotlib, and many other packages (pre-compiled to WASM)
- `micropip` for installing pure-Python packages from PyPI at runtime

**What you don't get:**
- Native file system access (Pyodide has a virtual in-memory filesystem)
- Packages with C extensions that haven't been compiled for WASM
- Network access via sockets (but `fetch` works through JavaScript interop)

**The virtual filesystem:** Pyodide provides `pyodide.FS`, an Emscripten filesystem API. You can create directories and write files that Python code can then import. This is how we install `pynote_ui`—we write the .py files to `pynote_ui/` in the virtual filesystem root, which Python can import directly.

</details>

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        Main Thread                             │
│          (where SolidJS renders the notebook UI)               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     Kernel Class                         │  │
│  │        (main thread's interface to the worker)           │  │
│  │  - listeners: Map<requestId, callback>                   │  │
│  │  - componentListeners: Map<componentUid, callback>       │  │
│  │  - status: Signal<KernelStatus>                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                              │
                         postMessage
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                         Web Worker                             │
│              (where Pyodide runs Python code)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  - pyodide runtime                                       │  │
│  │  - pynote_ui module (written to virtual FS root)         │  │
│  │  - ContextAwareOutput (routes print() to correct cell)   │  │
│  │  - run_cell_code() (executes user code)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

The **Kernel class** lives in the main thread because it's what UI components interact with. When a CodeCell wants to run Python, it calls `kernel.run(code)`. The Kernel then sends a message to the Worker, and when results come back, it routes them to the right callback. It's the main thread's side of the bridge—the Worker never sees the Kernel class directly, only the messages it sends.

**Why a separate thread?** The browser's main thread can only do one thing at a time. If we ran Python there, the UI would freeze during execution. The Web Worker runs in a separate thread, so Python can compute while the UI stays responsive.

## Message Protocol

Messages are JSON objects used to pass instructions and data between the main thread and the worker. Every message has a `type` field that identifies what kind of message it is. Most messages also include a payload with the actual data (cell ID, code to run, results, etc.).

### Kernel (`pyodide.ts`) → Worker (`pyodide.worker.ts`)

These are messages the `Kernel` class sends to the worker's `onmessage` handler:

| Type | Payload | What it does |
|:-----|:--------|:-------------|
| `init` | None | Tells worker to load Pyodide and set up the Python environment |
| `run` | `{ id: string, code: string }` | Executes `code` in the cell identified by `id`. This is what happens when you run a code cell. |
| `interaction` | `{ uid: string, data: any }` | Forwards a UI event (like moving a slider) to the Python object that created that component |
| `set_cell_context` | `{ id: string }` | Sets which cell "owns" any UI components created next |
| `clear_cell_context` | `{ id: string }` | Cleans up UI components that belonged to a cell (when output is cleared) |

### Worker (`pyodide.worker.ts`) → Kernel (`pyodide.ts`)

These are messages the worker's `postMessage()` sends back to `Kernel.worker.onmessage`:

| Type | Payload | What it means |
|:-----|:--------|:--------------|
| `ready` | None | Pyodide finished loading. Kernel sets status to "ready" |
| `stdout` | `{ id: string, content: string }` | A `print()` statement produced output. `id` is the cell it came from |
| `stderr` | `{ id: string, content: string }` | An error or warning was printed to stderr |
| `success` | `{ id, result, mimebundle }` | Cell finished executing. `result` is the return value, `mimebundle` contains display representations |
| `error` | `{ id, error }` | Cell execution raised an exception. `error` is the formatted traceback |
| `component_update` | `{ uid: string, data: any }` | A Python object (like a Slider) pushed a state change to the frontend |

## The `run_cell_code()` Function

`run_cell_code(code, cell_id)` is a Python function defined in `pyodide.worker.ts` (as a string that gets executed when Pyodide initializes). It's the actual entry point for executing user code—when the worker receives a `run` message, it calls this function.

What it does:
1. **Sets cell context** — stores `cell_id` in two contextvars: one for `print()` routing, one for `StateManager` to track which cell owns new UI elements. Both use contextvars, so they work correctly even if user code does `await` and another cell starts running.
2. **Executes code** — calls `eval_code_async()` which handles top-level await and returns the last expression's value
3. **Auto-wraps UI lists** — if result is a list of UI elements, wraps them in a `Group` for display
4. **Catches exceptions** — formats tracebacks with internal Pyodide frames filtered out
5. **Returns result** — either the expression value or an error dict that the worker sends back to Kernel

Note: Before calling `run_cell_code()`, the worker's `runCode()` function calls `pyodide.loadPackagesFromImports(code)` to auto-install any imported packages.

<details>
<summary><strong>Background: Why <code>eval_code_async()</code> instead of <code>runPython()</code>?</strong></summary>

Pyodide offers several ways to execute Python code:

- **`runPython(code)`** — Simplest option. Executes code and returns the result. But it can't handle top-level `await`.
- **`runPythonAsync(code)`** — Can handle `await`, but doesn't return the value of the last expression (only explicit returns).
- **`eval_code_async(code, globals, locals, ...)`** — The most flexible. Supports `await`, returns the last expression's value, and gives you control over the execution context.

**Why we need `eval_code_async`:** In a notebook, users expect `x = 5` followed by `x` to display `5`. They also expect `await fetch(...)` to work at the top level. `eval_code_async` handles both: it returns whatever the last line evaluates to, and it properly awaits any async code.

Note: The default `return_mode` is `"last_expr"`, which means `x = 5` on its own won't display anything (you need a bare `x` to see the value). Pyodide also supports `return_mode="last_expr_or_assign"` for Jupyter-like behavior where assignments also return their value.

</details>

## Kernel Class API (`src/lib/pyodide.ts`)

The `Kernel` class owns the Worker instance and exposes methods for the rest of the app to interact with Python. It's a singleton—there's one Kernel for the whole app, accessed via `kernel` export.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `status` | `KernelStatus` | Current state: "loading" \| "ready" \| "running" \| "error" \| "stopped" |
| `id` | `string` | Unique kernel session ID |
| `executionCount` | `number` | How many cells have been executed (increments each time) |

### Methods

| Method | What it does |
|--------|--------------|
| `init()` | Creates the worker and sends `init` message (worker then loads Pyodide and writes pynote_ui) |
| `terminate()` | Kills the worker. Any pending `run()` calls get rejected |
| `restart()` | Calls terminate() then init(). Resets all Python state |
| `run(code, onUpdate)` | Sends code to execute. `onUpdate` callback receives stdout/stderr/result messages |
| `sendInteraction(uid, data)` | Sends a UI event to a Python component (e.g., slider value changed) |
| `setCellContext(cellId)` | Tells Python which cell is about to run (for output routing) |
| `clearCellState(cellId)` | Garbage collects UI components owned by a cell |
| `registerComponentListener(uid, cb)` | Subscribes to updates from a specific Python component |
| `unregisterComponentListener(uid)` | Removes the subscription |

## Data Serialization

Pyodide can't pass Python objects directly to JavaScript or vice versa. Data crossing the boundary needs conversion.

<details>
<summary><strong>Background: What is a PyProxy?</strong></summary>

When Python code returns an object to JavaScript (or vice versa), Pyodide doesn't copy the data. Instead, it creates a **proxy**—a thin wrapper that lets one language access the other's object.

- **PyProxy**: A JavaScript object that wraps a Python object. You can call methods on it, access attributes, etc., and Pyodide translates those operations to Python.
- **JsProxy**: A Python object that wraps a JavaScript object. Same idea, opposite direction.

**The problem:** Proxies hold references across the language boundary. JavaScript's garbage collector can't see into Python's heap, so it doesn't know when the Python object is safe to free. If you don't explicitly release PyProxies, you get memory leaks.

**The solution:** Call `.destroy()` on PyProxies when you're done with them, or convert them to native objects:
- `pyProxy.toJs()` — converts Python dict/list to JS object/array (deep copy)
- `pyodide.toPy(jsObj)` — converts JS object to Python dict (returns a PyProxy you must destroy)

In PyNote, we convert data at the boundary (using `toJs()` / `toPy()`) rather than passing proxies around, so we only need to worry about cleanup in the worker code.

</details>

### Python → JavaScript (e.g., component updates)

1. Python code calls `element.send_update(value=75)` which calls `StateManager.send_update(self.id, kwargs)`
2. StateManager invokes `_comm_target(uid, data)`—a callback registered by the worker during init
3. Worker's callback receives the PyProxy and converts: `data.toJs({ dict_converter: Object.fromEntries })`
4. Worker calls `postMessage({ type: "component_update", uid, data: jsData })`

### JavaScript → Python (e.g., slider interactions)

1. Kernel calls `worker.postMessage({ type: "interaction", uid, data })`
2. Worker converts: `pyodide.toPy(data)` turns the JS object into a PyProxy pointing to a Python dict
3. Worker calls `pynote_ui.handle_interaction(uid, pyData)` which routes to the right component
4. Worker calls `pyData.destroy()` — **this is required** because PyProxies hold references that prevent garbage collection

## Stream Handling (`print()` routing)

**The problem:** If two cells run concurrently and both call `print()`, which cell does the output belong to?

**The solution:** During Pyodide init, the worker replaces `sys.stdout` and `sys.stderr` with `ContextAwareOutput`, a custom class that checks which cell is currently executing:

```python
class ContextAwareOutput(io.TextIOBase):
    def __init__(self, name):
        self.name = name  # "stdout" or "stderr"

    def write(self, s):
        cell_id = current_cell_id.get()  # contextvar set by run_cell_code()
        if _publish_stream_callback and cell_id:
            _publish_stream_callback(cell_id, self.name, s)
        return len(s)
```

`current_cell_id` is a Python contextvar. `run_cell_code()` sets it before executing user code. Contextvars preserve their value across `await` boundaries, so even if a cell does `await asyncio.sleep(1)` and another cell starts running, each cell's `print()` still routes to the right place.

<details>
<summary><strong>Background: What are contextvars?</strong></summary>

Python's `contextvars` module (added in 3.7) provides context-local storage that works correctly with async code.

**The problem with globals:** If you store state in a global variable and two async tasks run concurrently, they'll overwrite each other:

```python
current_user = None  # global

async def handle_request(user):
    global current_user
    current_user = user
    await do_something()  # Another task might change current_user here!
    print(current_user)   # Might not be the user we set
```

**How contextvars fix this:** Each async task gets its own copy of the context. Changes in one task don't affect others:

```python
from contextvars import ContextVar
current_user = ContextVar('current_user', default=None)

async def handle_request(user):
    current_user.set(user)
    await do_something()  # Other tasks have their own current_user
    print(current_user.get())  # Always the user we set
```

**Why PyNote needs this:** When two cells run concurrently, each call to `print()` needs to know which cell it belongs to. By storing `cell_id` in a contextvar, each cell's execution context carries its own ID, even across `await` boundaries.

</details>

## Error Handling

When user code raises an exception, `run_cell_code()` catches it and formats a clean traceback:

```python
filtered_tb = []
for frame in tb_list:
    if "_pyodide/_base.py" in frame.filename:
        continue  # Skip Pyodide internals
    if frame.name == "run_cell_code":
        continue  # Skip our wrapper
    filtered_tb.append(frame)
```

This removes Pyodide's internal frames so users see a traceback pointing to their code, not the execution machinery.

`run_cell_code()` returns errors as `{ "__pynote_error__": traceback_string }`. The worker checks for this key—if present, it sends `type: "error"` to Kernel instead of `type: "success"`.

## Concurrent Execution

The worker's `onmessage` handler does **not** await `runCode()`:

```javascript
} else if (type === "run") {
    runCode(id, code);  // No await—fires and continues
}
```

`runCode()` is an async function, but we don't wait for it. This means if Kernel sends two `run` messages quickly, both executions start immediately—they don't queue. Each execution carries its `id`, and when results come back, Kernel uses that `id` to route to the correct callback.

This is what makes Direct and Hybrid execution modes possible. (In Queue mode, Kernel itself sequences the `run` messages so only one is in flight at a time.)
