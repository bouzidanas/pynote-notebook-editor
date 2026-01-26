# Pyodide Execution

This doc covers how Python code actually runs: the initialization sequence, the `run_cell_code()` helper, context-aware output routing, and package management.

For the message protocol between threads, see [wasm-bridge.md](wasm-bridge.md).

## Initialization

When the app loads, the `Kernel` class creates a Web Worker and sends an `init` message. The worker then:

1. **Loads Pyodide** from CDN (~10MB download)
   ```typescript
   pyodide = await loadPyodide({
     indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/"
   });
   ```

2. **Pre-loads micropip** — the package installer is loaded at startup
   ```typescript
   await pyodide.loadPackage("micropip");
   ```

3. **Writes pynote_ui to the virtual filesystem**
   ```typescript
   pyodide.FS.mkdir('pynote_ui');
   pyodide.FS.writeFile('pynote_ui/core.py', coreCode);
   pyodide.FS.writeFile('pynote_ui/elements.py', elementsCode);
   pyodide.FS.writeFile('pynote_ui/__init__.py', initCode);
   ```

4. **Sets up context-aware output capture** — replaces `sys.stdout` and `sys.stderr` with custom classes that route output to the correct cell

5. **Sends `ready` message** — Kernel sets status to "ready", UI can now run code

<details>
<summary><strong>Background: Pyodide's virtual filesystem</strong></summary>

Pyodide uses Emscripten's virtual filesystem (`pyodide.FS`). It's an in-memory filesystem that Python code can read/write normally. When you `import pynote_ui`, Python looks for `pynote_ui/__init__.py` in the filesystem—we write those files there during initialization.

The filesystem is ephemeral. If you restart the kernel (terminate and recreate the worker), it's gone. That's why we write `pynote_ui` fresh on every init.

</details>

## Running Code

When you run a cell, here's what happens:

1. **Frontend sends `run` message** with code and cell ID
2. **Worker sets cell context** via `StateManager.set_current_cell(id)` (uses a ContextVar)
3. **Worker calls `run_cell_code()`** — a Python helper defined in the worker
4. **Output streams route to the cell** via the ContextVar-based output capture
5. **Result is serialized and sent back**
6. **Context is cleared**

### The run_cell_code() Helper

This is a Python function defined as a string in `pyodide.worker.ts` and executed during init:

```python
async def run_cell_code(code, cell_id):
    from pynote_ui.core import StateManager, _current_cell_id
    
    # Set context for output routing AND component registration
    _current_cell_id.set(cell_id)
    StateManager.set_current_cell(cell_id)
    
    result = None
    try:
        result = await eval_code_async(
            code,
            globals=globals()
        )
        
        # Auto-wrap list of UIElements in a Group
        if isinstance(result, list):
            from pynote_ui import UIElement, Group
            if all(isinstance(x, UIElement) for x in result):
                result = Group(children=result)
                
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        _current_cell_id.set(None)
    
    return result
```

<details>
<summary><strong>Background: eval_code_async</strong></summary>

Pyodide provides `eval_code_async()` for running user code. Unlike `runPython()`, it:

- Supports top-level `await` (you can write `await asyncio.sleep(1)` directly in a cell)
- Handles both sync and async code uniformly
- Returns the value of the last expression

The default `return_mode='last_expr'` means:
- Last expression returns its value: `x + 1` → returns the sum
- Assignments don't return: `x = 5` → returns None
- You can use `return_mode='last_expr_or_assign'` if you want assignments to return values

Note: Unlike Jupyter, the current implementation uses the default `return_mode`, so `x = 5` alone won't display anything.

</details>

### Result Serialization

After execution, the worker checks what came back:

1. **UIElement?** — Call `_repr_mimebundle_()` to get JSON, send as mimebundle
2. **None?** — No result to display
3. **Other?** — Convert to string via `repr()`, send as text

```typescript
if (result?._repr_mimebundle_) {
  const bundle = result._repr_mimebundle_();
  // Returns { "application/vnd.pynote.ui+json": {...} }
}
```

## Context-Aware Output

The problem: if two cells run concurrently (in "direct" mode), which cell does `print("hello")` belong to?

The solution: Python's `contextvars` module.

<details>
<summary><strong>Background: contextvars</strong></summary>

`contextvars.ContextVar` is like thread-local storage but works correctly with async code. Each async task (coroutine) gets its own copy of the context.

```python
import contextvars
current_cell = contextvars.ContextVar('cell', default=None)

async def cell_1():
    current_cell.set("cell-1")
    await something()
    print(current_cell.get())  # Still "cell-1"
```

Even if `cell_2` runs during the `await`, cell_1's context is preserved.

</details>

The worker defines a `ContextAwareOutput` class that wraps stdout/stderr:

```python
class ContextAwareOutput:
    def __init__(self, stream_type, original):
        self._stream_type = stream_type
        self._original = original

    def write(self, text):
        cell_id = _current_cell_id.get()
        if cell_id:
            postMessage({
                "type": self._stream_type,
                "id": cell_id,
                "content": text
            })
        else:
            self._original.write(text)
    
    def flush(self):
        pass

sys.stdout = ContextAwareOutput('stdout', sys.stdout)
sys.stderr = ContextAwareOutput('stderr', sys.stderr)
```

When `print()` is called, it goes to `ContextAwareOutput.write()`, which looks up the current cell ID from the ContextVar and sends the text to the right place.

## Package Management

### Pre-loaded

Micropip is loaded at startup. This is the package installer needed for loading additional packages.

### Dynamic loading

Users can install packages with micropip:

```python
import micropip
await micropip.install('pandas')
```

The worker uses Pyodide's `loadPackagesFromImports()` to auto-detect imports and load packages:

```typescript
await pyodide.loadPackagesFromImports(code);
```

This scans the code for `import` statements and automatically loads any packages that have pre-built WASM binaries (numpy, pandas, matplotlib, etc.).

<details>
<summary><strong>Background: What packages work in Pyodide?</strong></summary>

Three categories:

1. **Pure Python packages** — Work fine, can be installed with `micropip.install('package')`
2. **Packages with C extensions, pre-compiled for WASM** — NumPy, Pandas, Matplotlib, SciPy, etc. These are bundled with Pyodide and loaded via `pyodide.loadPackage()`
3. **Packages with C extensions, NOT compiled for WASM** — Won't work. Common culprits: anything using native sockets, some ML frameworks

Check https://pyodide.org/en/stable/usage/packages-in-pyodide.html for the list of available packages.

</details>

## Error Handling

Python exceptions are caught and printed to stderr:

```python
try:
    result = await eval_code_async(code, ...)
except Exception as e:
    import traceback
    traceback.print_exc()  # Goes to stderr → routed to cell
```

The traceback appears in the cell's output as error text.

If the worker itself crashes (which is rare), the Kernel's `worker.onerror` handler catches it. Currently it logs to console; a production app might auto-restart the kernel.

## Kernel Restart

To reset Python state completely:

```typescript
class Kernel {
  async restart() {
    this.worker.terminate();  // Kill the old worker
    this.worker = new Worker(...);  // Create fresh one
    await this.ready;  // Wait for init
  }
}
```

This clears everything:
- All Python variables
- All imported modules (except stdlib)
- All UI component registrations
- The virtual filesystem (pynote_ui is re-written on init)

## Performance Notes

| Phase | Time | Notes |
|:------|:-----|:------|
| Initial Pyodide load | 2-5s | ~10MB WASM download, cached after first load |
| Code execution | Near-native | Python runs as WASM, not interpreted JS |
| postMessage overhead | ~1ms | JSON serialization + thread crossing |
| Large data transfer | Varies | DataFrames over a few MB can be slow to serialize |

Memory: Pyodide heap defaults to ~500MB. Large DataFrames or many packages can exhaust this. There's no automatic memory pressure release—if you run out, you need to restart the kernel.
