# Pyodide Execution Environment

PyNote executes Python code entirely within the browser using [Pyodide](https://pyodide.org/). This document details how the runtime is initialized and managed.

## Initialization Process

The Pyodide runtime is hosted in a dedicated Web Worker (`src/lib/pyodide.worker.ts`) to prevent blocking the main UI thread during heavy computations.

### Startup Sequence

1.  **Worker Creation:** The main thread instantiates the worker.
2.  **Load Pyodide:** The worker fetches the Pyodide runtime from the CDN (`https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.mjs`).
3.  **Install Micropip:** Pyodide's package installer, `micropip`, is loaded.
4.  **Install `pynote_ui`:** The custom UI library is installed directly from the local server origin (`/packages/pynote_ui-0.1.0-py3-none-any.whl`).
5.  **Bridge Registration:** The worker registers a communication target with `pynote_ui` to enable bidirectional updates.
6.  **Ready State:** The worker posts `type: "ready"` to the main thread.

## Execution Model

Code execution is asynchronous via `pyodide.runPythonAsync(code)`.

### Stream Redirection

Standard output (`sys.stdout`) and error (`sys.stderr`) are captured by redirecting Pyodide's internal streams:

```typescript
// src/lib/pyodide.worker.ts
pyodide.setStdout({
  batched: (msg: string) => {
    postMessage({ id, type: "stdout", content: msg });
  }
});
```

### Result Processing

After execution, the worker checks for rich display representations. Specifically, it looks for `_repr_mimebundle_`. If present, this method is called to extract structured data (e.g., for `pynote_ui` elements) before sending the result back to the main thread.

## Package Management

Currently, the environment pre-installs `micropip` and `pynote_ui`. Users can dynamically install pure Python packages from PyPI inside the notebook using:

```python
import micropip
await micropip.install("pandas")
```

Note: Packages with C extensions must be pre-compiled for Pyodide/WASM to work.
