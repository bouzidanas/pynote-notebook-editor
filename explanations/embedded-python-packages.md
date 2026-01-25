# Embedded Python Packages in Pyodide

## The Problem

When running Python in the browser via Pyodide, installing packages has overhead:

```typescript
// The "standard" approach - commented out in our code
const micropip = pyodide.pyimport("micropip");
await micropip.install(self.location.origin + "/packages/pynote_ui-0.1.0-py3-none-any.whl");
```

This involves:
1. **HTTP request** to fetch the `.whl` file
2. **Micropip processing** - unzipping, validating, installing
3. **Network latency** - even for small packages

For a package like `pynote_ui` that we control and ship with the app, this is wasteful.

## The Solution: Direct Filesystem Injection

Pyodide exposes an Emscripten virtual filesystem (`pyodide.FS`) that Python sees as its normal filesystem. We can write Python files directly to it:

```typescript
// Create the package directory
pyodide.FS.mkdir("pynote_ui");

// Write __init__.py
pyodide.FS.writeFile("pynote_ui/__init__.py", `
from .core import UIElement, StateManager, ...
from .elements import Slider, Text, Group
__all__ = ["UIElement", "Slider", "Text", "Group", ...]
`);

// Write core.py
pyodide.FS.writeFile("pynote_ui/core.py", `
import uuid
import json
...
class UIElement:
    ...
`);

// Write elements.py
pyodide.FS.writeFile("pynote_ui/elements.py", `
from .core import UIElement

class Slider(UIElement):
    ...
class Text(UIElement):
    ...
`);
```

After this, Python can import normally:
```python
from pynote_ui import Slider, Text, Group  # Works!
```

## How It Works

### 1. Pyodide's Virtual Filesystem

Pyodide uses Emscripten's FS API, which provides a POSIX-like filesystem in memory. Key operations:

| Method | Description |
|--------|-------------|
| `FS.mkdir(path)` | Create a directory |
| `FS.writeFile(path, content)` | Write a file |
| `FS.readFile(path)` | Read a file |
| `FS.unlink(path)` | Delete a file |

The filesystem starts with Python's standard library already mounted. Any directory at the root level is automatically in Python's import path.

### 2. Our Implementation

From [pyodide.worker.ts](../src/lib/pyodide.worker.ts):

```typescript
// Location: src/lib/pyodide.worker.ts, around line 90

// Optimisation: Pre-load pynote_ui directly into FS to skip HTTP/Micropip overhead
pyodide.FS.mkdir("pynote_ui");

pyodide.FS.writeFile("pynote_ui/__init__.py", `
from .core import (
    UIElement, StateManager, handle_interaction, set_current_cell, clear_cell, 
    register_comm_target, display, print_md,
    MARKER_UI_START, MARKER_UI_END, 
    MARKER_MD_STYLED_START, MARKER_MD_STYLED_END,
    MARKER_MD_PLAIN_START, MARKER_MD_PLAIN_END
)
from .elements import Slider, Text, Group

__all__ = [
    "UIElement", "StateManager", "handle_interaction", 
    "Slider", "Text", "Group", 
    ...
]
`);

pyodide.FS.writeFile("pynote_ui/core.py", `
import uuid
import json
import sys

# Control character markers for stdout rendering
MARKER_UI_START = "\\x02PYNOTE_UI\\x02"
MARKER_UI_END = "\\x02/PYNOTE_UI\\x02"
...

class StateManager:
    _instances = {}
    _instances_by_cell = {}
    ...

class UIElement:
    def __init__(self, **props):
        self.id = str(uuid.uuid4())
        self.props = props
        StateManager.register(self)
    ...
`);

pyodide.FS.writeFile("pynote_ui/elements.py", `
from .core import UIElement

class Slider(UIElement):
    def __init__(self, value=0, min=0, max=100, step=1, label="Slider", ...):
        self._value = value
        ...

class Text(UIElement):
    def __init__(self, content="", align_h="left", align_v="top", ...):
        self._content = content
        ...

class Group(UIElement):
    ...
`);
```

### 3. Why It's Faster

| Approach | Steps | Typical Time |
|----------|-------|--------------|
| **Micropip install** | HTTP fetch → Unzip → Validate → Install | 200-500ms |
| **Direct FS write** | String → Memory | <1ms |

The entire package is already in the JavaScript bundle, so it's just a memory copy.

## Trade-offs

### Advantages
- ⚡ **Instant loading** - no network requests
- 📦 **Bundled with app** - no separate file to manage
- 🔒 **Always in sync** - can't have version mismatches between JS and Python

### Disadvantages
- 📝 **Two copies to maintain** - must update both:
  - `packages/pynote_ui/src/pynote_ui/` (canonical source)
  - `src/lib/pyodide.worker.ts` (embedded copy)
- 📏 **Bundle size** - Python code is in the JS bundle (small for our case)
- 🐍 **String escaping** - Python code in JS template literals needs care with backticks and `$`

## When to Use This Pattern

✅ **Good for:**
- Small, app-specific packages
- Packages you control
- Critical path packages (needed at startup)

❌ **Avoid for:**
- Large packages (use lazy loading instead)
- Third-party packages (use micropip)
- Packages that change independently of the app

## Keeping Files in Sync

Since we have two copies, here's the workflow:

1. **Edit the canonical source**: `packages/pynote_ui/src/pynote_ui/`
2. **Rebuild the wheel**: `./scripts/build_python_pkg.sh`
3. **Update the embedded copy**: Manually sync changes to `src/lib/pyodide.worker.ts`

> ⚠️ **Important**: The wheel in `public/packages/` is kept for potential future use (e.g., distributing the package separately), but the **embedded version in the worker is what actually runs**.

## Code Location Reference

| File | Purpose |
|------|---------|
| `packages/pynote_ui/src/pynote_ui/` | Canonical Python source |
| `public/packages/pynote_ui-*.whl` | Built wheel (not used at runtime) |
| `src/lib/pyodide.worker.ts` | Embedded copy (actually used) |
| `scripts/build_python_pkg.sh` | Builds the wheel |
