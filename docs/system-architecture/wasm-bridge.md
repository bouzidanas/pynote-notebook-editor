# WASM Bridge (Backend -> Frontend)

The Bridge is the communication layer between the Main Thread (SolidJS UI) and the Web Worker (Pyodide Python Runtime). It uses the browser's `postMessage` API.

## Message Protocol

Messages are JSON objects with a `type` field.

### Main Thread → Worker

| Type | Payload | Description |
| :--- | :--- | :--- |
| `init` | `None` | Starts the Pyodide initialization sequence. |
| `run` | `{ id: string, code: string }` | Executes a Python code block. |
| `interaction` | `{ uid: string, data: any }` | Sends UI events (e.g., slider move) to a Python object. |
| `set_cell_context` | `{ id: string }` | Sets the current Cell ID for upcoming object creation. |
| `clear_cell_context` | `{ id: string }` | Triggers Garbage Collection for a specific Cell ID. |

### Worker → Main Thread

| Type | Payload | Description |
| :--- | :--- | :--- |
| `ready` | `None` | Runtime is loaded and ready. |
| `stdout` | `{ id: string, content: string }` | Chunk of standard output. |
| `stderr` | `{ id: string, content: string }` | Chunk of standard error. |
| `success` | `{ id, result, mimebundle }` | Execution completed successfully. |
| `error` | `{ id, error }` | Execution failed with an exception. |
| `component_update` | `{ uid: string, data: any }` | Programmatic update from Python to a UI component. |

## Data Serialization

Data crossing the bridge is serialized automatically by the browser's structured clone algorithm for basic types.

*   **Python to JS:** `pyodide.toJs(obj)` is used to convert Python dictionaries to JavaScript objects.
*   **JS to Python:** `pyodide.toPy(obj)` converts JS objects to Python dictionaries.

### Proxy Objects
When sending interaction data, care is taken to destroy Proxy objects (`pyData.destroy()`, `pkg.destroy()`) on the Worker side to prevent memory leaks in the Pyodide heap.
