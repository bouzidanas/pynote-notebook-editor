# App Configuration Registry

Hardcoded configuration parameters across the codebase. All values are compile-time constants (no runtime config system yet).

---

## src/lib/store.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 8 | `APP_DEFAULT_EXECUTION_MODE` | `"hybrid"` | Default cell execution mode (`"queue_all"`, `"hybrid"`, `"direct"`, `"reactive"`) |
| 11 | `APP_QUICK_EDIT_MODE` | `true` | Single-click enters edit mode on code cells |
| 14 | `APP_SHOW_TRAILING_ADD_BUTTONS` | `true` | Show "+ Code" / "+ Text" buttons at bottom of cell list |
| 17 | `APP_ENABLE_CELL_DND` | `true` | Enable drag-and-drop cell reordering (hides grip icon + disables sensors when off) |
| 100 | `MAX_HISTORY` | `100` | Maximum undo/redo history entries retained |

## src/lib/codeVisibility.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 16 | `STORAGE_KEY` | `"pynote-code-visibility"` | localStorage key for visibility settings |
| 23 | `loadMetadataOnDocumentLoad` | `true` | Apply .ipynb metadata visibility settings on load |
| 39 | `autoRunOnNewSession` | `true` | Auto-run all cells when new session loads and kernel is ready |
| 51–61 | `defaultSettings` | *(object)* | Default code visibility settings: |
| | `.showCode` | `true` | Show code editor |
| | `.showStdout` | `true` | Show stdout output |
| | `.showStderr` | `true` | Show stderr output |
| | `.showResult` | `true` | Show expression result |
| | `.showError` | `true` | Show error tracebacks |
| | `.showStatusDot` | `true` | Show cell status indicator |
| | `.saveToExport` | `false` | Embed visibility settings in exported .ipynb |
| | `.showLineNumbers` | `false` | Show line numbers in code editor |
| | `.lineWrap` | `true` | Wrap long lines in code editor |

## src/lib/theme.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 108 | `STORAGE_KEY` | `"pynote-theme"` | localStorage key for persisting theme |
| 55–107 | `defaultTheme` | *(object)* | Default theme configuration (colors, spacing, typography) |

Key defaults inside `defaultTheme`:

| Line | Property | Value | Description |
|------|----------|-------|-------------|
| 56 | `font` | `"JetBrains Mono Variable", monospace` | Default font family |
| 82 | `spacing.line` | `"1.75"` | Default line-height |
| 83 | `spacing.cell` | `"1rem"` | Default cell gap |
| 99 | `editor.maxCodeHeight` | `"none"` | Max code editor height before scrolling (`"none"` = unlimited) |
| 101 | `sectionScoping` | `true` | Markdown section color scoping enabled |
| 102 | `tableOverflow` | `"scroll"` | Table overflow behavior (`"scroll"` or `"wrap"`) |
| 103 | `outputLayout` | `"above"` | Output position relative to code (`"above"` or `"below"`) |
| 104 | `pageWidth` | `"normal"` | Page width mode (`"normal"`, `"wide"`, `"full"`) |

## src/lib/session.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 8 | `INDEX_KEY` | `"pynote-sessions-index"` | localStorage key for session index |
| 9 | `SESSION_PREFIX` | `"pynote-session-"` | localStorage key prefix per session |
| 10 | `MAX_SESSIONS` | `10` | Maximum stored sessions before oldest is evicted |

## src/lib/pyodide.worker.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 2 | CDN import URL | `"https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.mjs"` | Pyodide version and CDN source |
| 519 | `indexURL` | `"https://cdn.jsdelivr.net/pyodide/v0.26.0/full/"` | Pyodide package index URL (duplicated from import) |
| 38 | `_completion_filters["show_private"]` | `False` | Show private members (`_foo`) in autocomplete |
| 39 | `_completion_filters["show_dunder"]` | `False` | Show dunder methods (`__init__`) in autocomplete |
| 40 | `_completion_filters["max_results"]` | `100` | Max autocomplete suggestions returned |
| 41 | `_completion_filters["use_cache"]` | `True` | Cache `dir()` results for autocomplete performance |
| 312 | *(inline)* | `300` | Max characters for hover tooltip docstrings before truncation |

## src/lib/codemirror-tooling.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 149 | `delay` (linter option) | `500` | Linter debounce delay (ms) |

## src/components/Notebook.tsx

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 756 | `AUTOSAVE_DEBOUNCE_MS` | `300` | Autosave debounce delay (ms) |
| 963 | *(inline)* | `2500` | Duration (ms) the "Press Esc to exit" hint shows in presentation mode |
