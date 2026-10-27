# App Configuration Registry

Hardcoded configuration parameters across the codebase. All values are compile-time constants (no runtime config system yet).

---

## src/lib/store.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 14 | `APP_DEFAULT_EXECUTION_MODE` | `"hybrid"` | Default cell execution mode (`"queue_all"`, `"hybrid"`, `"direct"`, `"reactive"`) |
| 17 | `APP_QUICK_EDIT_MODE` | `true` | Single-click enters edit mode on code cells |
| 20 | `APP_SHOW_TRAILING_ADD_BUTTONS` | `true` | Show "+ Code" / "+ Text" buttons at bottom of cell list |
| 25 | `APP_ENABLE_CELL_DND` | `true` | Enable drag-and-drop cell reordering (hides grip icon + disables sensors when off) |
| 30 | `APP_QUIET_MODE` | `false` | Softer cell borders when selected or editing (secondary tones, no accent border or glow) |
| 33 | `APP_DEFAULT_SHOW_FORMATTING` | `false` | Show the markdown formatting toolbar when a cell enters edit mode |
| 39 | `APP_TAB_ACCEPTS_COMPLETION` | `true` | Tab inserts the selected completion when the autocomplete popup is open; otherwise Tab indents as usual |
| 164 | `MAX_HISTORY` | `100` | Maximum undo/redo history entries retained |

## src/lib/codeVisibility.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 18 | `STORAGE_KEY` | `"pynote-code-visibility"` | localStorage key for visibility settings |
| 24 | `loadMetadataOnDocumentLoad` | `true` | Apply .ipynb metadata visibility settings on load |
| 40 | `autoRun` | `true` | Auto-run cells when a new session loads and the kernel is ready (app-level master toggle) |
| 54 | `autoRunOnRefresh` | `false` | Also auto-run when a session is reloaded (page refresh); no effect while `autoRun` is off |
| 65-76 | `defaultSettings` | *(object)* | Default code visibility settings: |
| | `.showCode` | `true` | Show code editor |
| | `.showStdout` | `true` | Show stdout output |
| | `.showStderr` | `true` | Show stderr output |
| | `.showResult` | `true` | Show expression result |
| | `.showError` | `true` | Show error tracebacks |
| | `.showStatusDot` | `true` | Show cell status indicator |
| | `.showExecutionCount` | `true` | Show the `[n]:` execution count gutter |
| | `.saveToExport` | `false` | Embed visibility settings in exported .ipynb |
| | `.showLineNumbers` | `false` | Show line numbers in code editor |
| | `.lineWrap` | `true` | Wrap long lines in code editor |

## src/lib/theme.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 484 | `STORAGE_KEY` | `"pynote-theme"` | localStorage key for persisting theme |
| 362-482 | `defaultTheme` | *(object)* | Default theme configuration (colors, spacing, typography) |

Key defaults inside `defaultTheme`:

| Line | Property | Value | Description |
|------|----------|-------|-------------|
| 363 | `font` | `"JetBrains Mono Variable", monospace` | Default font family |
| 394 | `spacing.line` | `"1.75"` | Default line-height |
| 395 | `spacing.cell` | `"1rem"` | Default cell gap |
| 417 | `editor.maxCodeHeight` | `"none"` | Max code editor height before scrolling (`"none"` = unlimited) |
| 476 | `sectionScoping` | `true` | Markdown section color scoping enabled |
| 477 | `tableOverflow` | `"scroll"` | Table overflow behavior (`"scroll"` or `"wrap"`) |
| 478 | `outputLayout` | `"below"` | Output position relative to code (`"above"` or `"below"`) |
| 479 | `pageWidth` | `"normal"` | Page width mode (`"normal"`, `"wide"`, `"full"`) |

## src/lib/session.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 44 | `INDEX_KEY` | `"pynote-sessions-index"` | localStorage key for session index |
| 45 | `SESSION_PREFIX` | `"pynote-session-"` | localStorage key prefix per session |
| 46 | `MAX_SESSIONS` | `10` | Most recently used sessions kept; beyond them, the least recently used that no tab has open are dropped |
| 47 | `LOCK_PREFIX` | `"pynote-session:"` | Web Lock name prefix: each tab holds a shared lock on the session it shows, so other tabs never drop it |
| 49 | IndexedDB database / store | `"pynote-session-documents"` / `"documents"` | Each session's document data (cell attachments and the notebook metadata other than PyNote's), keyed by session id |

## src/lib/file-handles.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 9 | IndexedDB database / store | `"pynote-file-handles"` / `"handles"` | Each session's file handle (the file Save writes to), keyed by session id |

## src/lib/pyodide-config.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 10 | `PYODIDE_VERSION` | `"0.29.4"` | The Pyodide release the kernel runs (the single pin) |
| 12 | `PYODIDE_CDN_URL` | `` `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/` `` | Where the app loads Pyodide and its packages from |

## src/lib/python-runtime/init-code.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 145 | `_completion_filters["show_private"]` | `False` | Show private members (`_foo`) in autocomplete |
| 146 | `_completion_filters["show_dunder"]` | `False` | Show dunder methods (`__init__`) in autocomplete |
| 147 | `_completion_filters["max_results"]` | `100` | Max autocomplete suggestions returned |
| 148 | `_completion_filters["use_cache"]` | `True` | Cache `dir()` results for autocomplete performance |
| 536 | *(inline)* | `300` | Max characters for hover tooltip docstrings before truncation |

## src/lib/codemirror-tooling.ts

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 176 | `delay` (linter option) | `500` | Linter debounce delay (ms) |

## src/components/Notebook.tsx

| Line | Constant | Value | Description |
|------|----------|-------|-------------|
| 437 | `AUTOSAVE_DEBOUNCE_MS` | `300` | Autosave debounce delay (ms) |
| 959 | *(inline)* | `2500` | Duration (ms) the "Press Esc to exit" hint shows in presentation mode |

## Export dialog

| File | Line | Constant | Value | Description |
|------|------|----------|-------|-------------|
| `src/components/ExportDialog.tsx` | 52 | `CHECK_DELAY_MS` | `300` | How long typing must pause before the script check runs again (ms) |
| `src/lib/export/script-check.ts` | 61 | `TIMEOUT_MS` | `60_000` | Time limit of one script check (ms), counted from when it starts |
| `src/components/export-dialog/PreviewPane.tsx` | 8 | `PREVIEW_LINES` | `2000` | Lines the Preview tab shows of a long file (the export has them all) |
| `src/components/export-dialog/preferences.ts` | 18 | `PREFERENCES_KEY` | `"pynote-export-preferences"` | localStorage key for the dialog's last format and settings |
