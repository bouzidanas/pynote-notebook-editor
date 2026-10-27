# Export System

This document describes how PyNote turns a notebook into files: the formats it reads and writes, the Export dialog, the standalone web app, and the embeddable component.
It is the design reference for contributors; the format specifications themselves live in [docs/formats/](../formats/).

## Principles

- `.ipynb` stays the default file format, because it is the standard every notebook tool reads.
- Every format goes through one document model, so what PyNote saves is decided in one place.
- Converters are pure functions with no store, DOM or kernel access, so they are tested quickly and exhaustively in Node.
- Nothing PyNote does not understand is thrown away: cell ids, raw cells, attachments and other tools' metadata survive an open and save.
- An export never changes the notebook being edited.

## The document model

`NotebookDocument` (`src/lib/formats/document.ts`) mirrors an nbformat 4.5 notebook without outputs.
Cells keep their id, type (`code`, `markdown` or `raw`), source, full metadata and attachments; the notebook keeps its full metadata.
PyNote's own settings live inside that metadata: `metadata.PyNote` for the notebook and `metadata.pynote` for a cell.

Two functions connect it to the running app (`src/lib/notebook-io.ts`):

- `documentFromApp()` snapshots the open notebook exactly as a save writes it.
  It first asks editors that batch their updates (Milkdown, 200 ms) to hand over their latest text.
- `appNotebookFromDocument()` turns a parsed document into store cells plus validated PyNote settings.

The store keeps the loaded notebook's metadata in `documentMetadata`, so keys PyNote does not manage are written back on save.
`buildNotebookSettings()` (`src/lib/formats/pynote-settings.ts`) refreshes the keys PyNote manages from app state and keeps keys written by newer PyNote versions.

## Formats

| Format | Module | Opened by Open | Reader | Written by | Lossless |
| --- | --- | --- | --- | --- | --- |
| Jupyter `.ipynb` | `formats/ipynb.ts` | yes | `parseIpynb` | Save, Export | yes (outputs are not stored) |
| PyNote `.pynote` | `formats/pynote.ts` | yes | `parsePynote` | Save As, Export | yes ([spec](../formats/pynote.md)) |
| Python `.py` (py:percent) | `formats/python.ts` | no | `parsePython` | Export | code and prose; see [exports spec](../formats/exports.md) |
| Markdown `.md` | `formats/markdown.ts` | no | `parseMarkdown` | Export | prose and code; see exports spec |
| Python + Markdown pair | `formats/pair.ts` | no | `mergePair` | Export | cells, ids and order |

Open opens notebooks only.
The `.py`, `.md` and pair readers are specified and tested so the files can be imported, which is a separate feature from Open.

The `.ipynb` writer produces the same bytes as Jupyter's own nbformat writer (sorted keys, one-space indent, `splitlines` semantics, final newline), so a notebook saved alternately by PyNote and Jupyter shows no spurious diffs.
A golden file written by nbformat itself (`test/golden/ipynb/`) holds the writer to that.

### Open and Save

Open accepts `.ipynb` and `.pynote` and detects the format from the file name, or from the front matter when the name is unusual.
A new notebook saves as `.ipynb`.
Save As offers both formats, with the open file's own format first (so it is the default), and Save writes back in the format the file has.
The `.pynote` module and its YAML dependency load only when a `.pynote` file is involved, after the save picker opens, so the browser's user-gesture window is not spent on the import.

## The Export dialog

Options > Export (Ctrl+E) opens a dialog styled like the Theme and Code Visibility dialogs (`src/components/ExportDialog.tsx`, with its parts in `src/components/export-dialog/`):

- The formats are tabs down the side, each on two lines: its name, then its file type (`.ipynb notebook`, `.py script`, `.html page` and so on).
  Jupyter (`.ipynb`) comes first, and a first export starts on it; after that, the dialog opens on the format chosen last.
  The arrow keys move through the formats; on narrow screens they form a two-column grid above the panel.
- The panel next to them has two tabs: the chosen format's Settings, which it opens on, and a Preview that shows exactly what will be written.
  The chosen tab stays when the format changes; the web app has no Preview tab, since its settings describe the page.
- On wide screens the tab list sets the height of the dialog's body, and the panel scrolls within it; on narrow screens everything is one scrolling column.
- The footer holds the file name, which stretches up to the buttons, with its extension (which follows the format) after it, and the Export button.
  Progress and errors show on a line above them, so they never squeeze the name.

The file name defaults to the notebook's name, or `Untitled`; the Component format names its config file instead (`pynote.config`).
The notebook is captured when the dialog opens, and every export writes that copy (the web app's too), so the preview and the export always agree.
The dialog keeps the last format and settings chosen in browser storage for the next export (`export-dialog/preferences.ts`), except the Component's execution mode, which always starts as the notebook's.

The dialog is a native `<dialog>` opened with `showModal()`, so the browser makes the page behind it inert: nothing there takes clicks, focus or screen reader access while the dialog is open.
Focus moves to the chosen format when the dialog opens and back when it closes.
Tab and Shift+Tab go round the dialog's controls, from the last one to the first and back, also in a browser that skips some of them (Safari, by default, tabs to text fields only).
No key reaches the notebook's shortcuts while it is open: keys typed in the dialog stop at it, and keys sent to the page itself stop at the window.
Escape closes it from anywhere, and so do the close button and a close request from the browser (such as Android's back gesture).
While an export is being built (a web app downloads Python or renders its static page), the footer shows its progress and a Cancel button, and closing the dialog cancels the build too.
Once the files are being written the export can no longer be cancelled, so writing is never interrupted halfway.
A click on the backdrop closes the dialog, unless an export is running (so a stray click cannot discard it) or the press began inside the dialog (a text selection dragged out of a field).

| Format | Settings | Writes |
| --- | --- | --- |
| Jupyter | Clean copy (no PyNote settings) | `.ipynb` |
| PyNote | none: the file keeps the whole notebook | `.pynote` |
| Python | Include markdown as comments (a warning when off), and the script check | `.py` |
| Markdown | Include code (a warning when off) | `.md` |
| Python + Markdown | none, apart from the script check | `.py` and `.md` |
| Web app | Interactive (open in presentation mode; Python included or from the CDN) or Read-only (Static, without JavaScript); single file or folder, except for Static | `.html`, or a folder |
| Component | how to set it up, every setting of the config file, and the framework of the usage example | `pynote.config.json` |

The Preview shows the text with a copy button; for a very long file it shows the first 2,000 lines, and the export has them all.
For Python + Markdown it switches between the two files.
For the Component it shows the setup command (`npx pynote add`) with a copy button, and switches between a usage example for the chosen framework and the config file.

The Component's settings start with three setup steps:

1. In the website's folder, run `npx pynote add` (with a copy button): it installs the package with what the framework needs.
2. Export, and put the config file (the footer's name, `pynote.config.json` by default) in the project's root folder: it holds the notebook's look and settings, and no code.
3. Load it once per page or layout, and place a cell wherever one should go; a Preview link there opens the Preview tab, which shows the code for the chosen framework.

Below them, the settings cover all of `pynote.config.json` (`componentConfig` in `src/lib/export/component-export.ts`):

- Framework: Astro, Next.js, SolidStart, React, Solid or HTML, as a sliding toggle that wraps to two rows on phones; it only changes the usage example.
  The format's summary names the frameworks from the same list (`FRAMEWORKS`), so the two always agree.
- Cells: editable code (when off, readers see the code read-only and cells still run), the cell menu, and run on page load (`autorun`).
- Notebook: the execution mode, which starts as the notebook's, and whether readers can change it (`lockExecutionMode`); the theme and the view (which parts of a cell show, `codeVisibility`), each either this notebook's or PyNote's default.
  The config stores only what differs from PyNote's defaults, so PyNote's default theme or view is an empty object.
  It leaves out the app's own setting for saving the theme or the view into the notebook file (`saveToExport`), which is no part of how cells look.
- Python: where Pyodide loads from, jsDelivr or a folder of the site (`pyodideUrl`, `/pyodide/` by default).
  The folder's hint says to put the files of Pyodide's full release there (`pyodide-<version>.tar.bz2`, with a link to the release), because the npm package has only the core files, without micropip (which Python loads when it starts) or the packages cells import.

The text formats are pure functions of the document (`src/lib/export/text-exports.ts`).

Saving goes through `src/lib/export/save.ts`.
The destination is chosen first, while the click still counts as a user gesture (browsers only open file pickers then), and the export is built afterwards: a web app can take seconds while Python downloads.
Without the File System Access API (outside Chromium), every export is a single download, because a page that starts several downloads at once can lose some of them (Safari keeps only the last; other browsers may ask to allow multiple downloads).
One file downloads as itself, the pair as `<name>.zip` with both files at its top, and a web app folder as `<name>.zip` holding the folder (`src/lib/export/zip.ts`, stored entries).
With it:

- One file goes through the save picker (`chooseFile`).
- The pair goes straight into a folder the user picks (`chooseFolder`); files of those names already there are replaced only after a confirmation that names them.
- A web app folder goes into a folder named after the export, inside the folder the user picks (`chooseExportFolder`).
  When a folder of that name already exists, it must be an earlier PyNote export: its `index.html` carries PyNote's generator meta (`<meta name="generator" content="PyNote">`, which every web app page has).
  Then, after a confirmation that says exactly what will be replaced, only the files PyNote wrote there are replaced: `index.html`, `pynote.js`, `pynote.css`, `README.txt`, and the scripts in `pyodide/` that start with the asset registry call (recognized by their content).
  Files the earlier export wrote that this one does not write again are removed, and so is `pyodide/` once that leaves it empty; everything else in the folder stays.
  Any other folder of that name, or a file of that name, stops the export with an error before anything is written.
  The rule that recognizes an earlier export (`EARLIER_WEB_APP_FOLDER`) sits in `src/lib/export/web-app.ts`, next to the code that writes those files.

The Python and Python + Markdown exports check their script in the dialog's settings, without touching the notebook being edited:

1. Reactive mode's static analysis finds each cell's definitions and references, which give the script's order (dependency order, stable, notebook order when it is already valid).
   A variable defined in more than one cell, or a dependency cycle, keeps notebook order and is reported.
2. The exact exported script runs in a separate, throwaway Pyodide kernel, as `python notebook.py` would: compiled as one module (top-level `await` is a syntax error, as in CPython), in a fresh `__main__` namespace (`run_script` in the worker).
3. Among the script's imports, as Pyodide's `find_imports` lists them, those that only exist inside PyNote or Pyodide (`pynote_ui`, `micropip`, `js`, `pyodide`, `pyodide_js`) are reported, because a plain `python` cannot run them.

When the script stops with an error, the check names the cell it stopped in: the cell holding the last line of `notebook.py` that the traceback names (`failingLine` and `cellForLine`).
Where each code cell starts comes from the exporter, which records each code cell's marker line as it writes the script (`codeStarts` from `exportPython`, which writes the pair's `.py` too): code is written as it is, so a line of code can look like a cell marker, and reading the text back could not tell.

The throwaway kernel (`src/lib/export/script-check.ts`) is configured like the app's (same worker, same Pyodide source) and does one task at a time.
A check asked for while another runs waits, and a newer check replaces a waiting one before it starts, so changing options during a long check costs one more run, not one per change.
The dialog checks the script again only when its text changes (an option, or the pair's file name, since the `.py` names its `.md`), never the same text twice, and starts a check once typing has paused for 300 ms.
A check may run for 60 seconds, counted from when it starts; Python cannot be interrupted, so a check that runs longer terminates its kernel, and the next check starts a fresh one.
A kernel that fails to start Python is terminated, and closing the dialog terminates the checker's kernel.

Export waits for the order, not for the check to finish, so the file written is the script being checked; when Python cannot start, the script keeps the notebook's order.
The notebook's execution mode, kernel state and outputs are never changed by the check.

## Kernel configuration

`Kernel` (`src/lib/pyodide.ts`) takes a worker factory, a Pyodide source and an asset provider (`kernel.configure()`).
It has no worker of its own: each entry point configures one (the app's module worker in `src/index.tsx`, and a classic worker made from a Blob in the export runtime and in the embedded cells), and Pyodide loads from the jsDelivr CDN unless another source is configured.
Its configuration can be read back (`kernel.configuration`), which is how the script check's kernel gets the app's worker and source.
Whether it has started (`kernel.started`) is a signal, reactive like its status.
The worker loads Pyodide with a dynamic import from the configured source rather than a static import, so it runs as a module or a classic worker and survives bundling inside a library.
`PYODIDE_VERSION` (`src/lib/pyodide-config.ts`) is the single pin; a test checks the `pyodide` npm package used by the Vitest suites and the CPython version written to `language_info` against it.

Pyodide sources:

- `url`: load from a URL prefix (the jsDelivr CDN by default, or a self-hosted copy).
- `embedded`: offline exports.
  The worker script already contains Pyodide's classic loader, and assets under a virtual prefix are requested from the page over `postMessage`, because a page opened from `file://` cannot fetch its own files.

## Standalone web app (HTML export)

A web app export is PyNote itself, showing only the exported notebook (and the built-in tutorial), so it looks and behaves exactly like the notebook did.

### The runtime

`vite/export-runtime.ts` builds, next to the app, the runtime every web app export ships (`export-runtime/` in the build output, built on demand by the dev server):

- `app.js`: the whole UI as one classic script (a page opened from `file://` runs classic scripts but cannot load module chunks).
  Its entry (`src/export-runtime/main.tsx`) first runs `setup.ts`, which reads the embedded payload and sets the host profile before any store module loads (`src/lib/host.ts`), so the stores start from the exported notebook, theme and view settings.
- `app.css`: the styles, with every font face inlined.
  An export keeps only what its pages can render with (`exportFontNeeds` and `selectFonts` in `src/lib/export/fonts.ts`): its theme's families, in the unicode ranges its text uses, and KaTeX's faces wherever math can appear.
  Math can always appear in an interactive export (readers edit cells, and code can print math); a read-only or static export keeps KaTeX's faces when its content has two dollar signs or markup KaTeX rendered.
  For the default theme this brings 2.5 MB down to about 160 KB, or about 500 KB with KaTeX's faces.
- `worker.js`: the kernel worker as a classic script.
- `manifest.json`: sizes, SHA-256 hashes and the font faces in `app.css`; the exporter rejects a runtime file whose hash does not match, which catches stale caches and half-deployed apps.

The host profile (`standalone`) removes what does not belong in a single-notebook app (New, Open, Export, app-wide settings) and keeps everything else; for a read-only export it is read-only as well (see [Modes](#modes)).

### Assembly

`buildWebApp` (`src/lib/export/web-app-export.ts`) fetches the runtime, snapshots the notebook, theme and view settings, and calls `assembleWebApp` (`src/lib/export/web-app.ts`), which is pure and runs in Node too.
Readers get the notebook without the author's undo history, which holds the text of deleted cells and every earlier version of edited ones: `readerDocument` empties `metadata.PyNote.history` and keeps every other setting, and the notebook being edited keeps its history.
The build takes an `AbortSignal`, which the dialog's Cancel uses: fetching the runtime, downloading Python (the request in flight is aborted, and no later file is fetched) and rendering the static page all stop.
The payload (`src/lib/export/web-app-payload.ts`) is a JSON script element, and an interactive export's kernel worker is gzip and base64 data inline in `index.html`, in both layouts.
A single-file export also puts the UI's script inline, where a `<` that starts `<!--` or `</script` is written `\x3C` (`inlineScriptText`), because those sequences would end the script element early or change how the HTML parser reads it.
In the runtime they occur only in strings, template literals and regular expressions, where `\x3C` means `<` as well, with any flag, and also when code compiles a regular expression's source again (highlight.js does, with the `u` flag, for its HTML grammar's `/<!--/`).
Python's files, when the export includes them, are gzip and base64 data too: inline in a single-file export, or classic scripts under `pyodide/` in a folder export (a page opened from `file://` can load scripts, but `fetch` cannot read its files).
A folder export also holds the UI as `pynote.js` and `pynote.css`, and a `README.txt` that says what the page needs: nothing for a read-only export, the internet when Python comes from the CDN, and, when Python is included in `pyodide/`, the internet only for packages the export does not include.
Every page names PyNote as its generator (`<meta name="generator" content="PyNote">`), which is how exporting into the same folder again recognizes an earlier export.

Python comes either from the jsDelivr CDN or with the export.
Included, it is Pyodide's core files plus micropip and every package the notebook's code imports, with dependencies, from Pyodide's lock file (`src/lib/export/pyodide-bundle.ts`); each package is checked against the SHA-256 the lock file gives it (the core files have none).
The imports are found as Pyodide's `find_imports` finds them when a cell runs, from the import statements in the Python grammar the editor already ships (Lezer's, in `@codemirror/lang-python`): every import anywhere (after a semicolon, in a function or an `if` block), each dotted name with its prefixes (`a`, `a.b`), and the module of a relative import; strings and comments are not code.
A package an offline export does not include (a reader adds an import, or micropip installs one) downloads from the pinned jsDelivr URL when the reader is online (`src/export-runtime/setup.ts`).
Only a file the export's own `pyodide-lock.json` lists is fetched, with `integrity` set to its SHA-256, so the browser checks the bytes (the worker's synthetic response would otherwise skip Pyodide's own check); offline, or when the bytes do not match, the request fails as it would without this fallback.
A page opened from `file://` can only start a classic worker from a Blob, so the worker script is Pyodide's classic loader followed by PyNote's worker, and the worker requests Python's files from the page over `postMessage` (the asset provider of `Kernel`).
That Blob URL is made once per page: a kernel restart starts its worker from the same URL instead of decoding Pyodide's loader into another Blob.

### Modes

- Interactive: readers edit and run cells and use widgets.
  Their changes stay in their browser, in a session named after the export (`?session=export-<id>`), and Options > Reset Notebook brings the exported version back.
  The session leaves out what the export itself carries (cell attachments, other tools' metadata), which a reload takes from the export again, so it stays small.
  Presentation mode can be the starting view.
- Read-only: no kernel.
  The notebook opens in presentation mode with the outputs it had when exported, and widgets show their state at that moment: each mounted component registers a snapshot of its props with the kernel (`registerComponentListener`), and `snapshotOutputs` (`src/lib/export/output-snapshot.ts`) writes them into the outputs.
  A snapshot belongs to the component on screen, not to a kernel: it stays through a kernel restart or shutdown, which leave the outputs on screen, and goes when the component unmounts or its cell runs again.
  A component printed across several stream writes is read as one, and the chunks it spans become one.
  What a password field holds is never exported: `snapshotOutputs` empties the `value` of every component that is a password field (an `Input` whose `input_type` is `password`, in any case and with spaces around it), judged by the type it was printed with or the type it shows now.
  That covers what a reader typed, a value Python created the field with or set later, fields inside a `Group` or a `Form`, and a component's JSON printed as text in stderr, a result or a traceback, which otherwise stays exactly as printed.
  JSON holding Python's `NaN` or `Infinity`, which JSON does not allow and the app therefore shows as text, stays text too: only the value is emptied, and those numbers are written back as printed.
  Interactive exports carry no outputs, and a static export is rendered from this redacted page, with `flattenDocument` writing no password field's value into the markup.
  Input widgets are inert (nothing could run their callbacks); charts stay explorable.
  The host profile's `readOnly` makes the store refuse whatever a reader could reach without editing a cell, from any shortcut, menu or control: adding, deleting, moving or retyping cells, clearing outputs, undo and redo, running cells, entering edit mode, and restarting or shutting down the kernel (the store's `restartKernel` and `shutDownKernel`, which the shortcuts and the Kernel menus call).
  In presentation mode the toolbar slides out of view and is inert, here as in the app, so its hidden controls cannot take keyboard focus.
- Static: plain HTML and CSS without JavaScript.
  The read-only export renders once in a hidden iframe, and `flattenDocument` (`src/lib/export/static-html.ts`) turns the live DOM into markup: form values become attributes, canvases become images, constructable stylesheets become style elements, and every script goes.
  CodeMirror draws only the lines in view, so before flattening, a render-only style lifts any code height cap and the iframe grows to the page's full height until no displayed editor has undrawn lines.
  The saved page leaves the render-only style out (`data-pynote-render-only`), so it keeps the theme's box: full height by default, or capped with the rest of the cell scrolling inside, which needs no JavaScript.
  Of a line too long to draw whole (over 4,000 characters with line wrap off, over 20,000 with it), CodeMirror draws only the part in view and a placeholder for the rest.
  So a read-only page offers the renderer each editor's code (`STATIC_RENDER_HOOK` in `web-app-payload.ts`, which the runtime's entry installs from `src/export-runtime/static-render.ts` in read-only pages), with every line it did not draw whole highlighted by the editor's own highlighter, and `flattenDocument` writes those lines into the saved page.
  It then checks that every editor drawn whole shows exactly its code, and fails the export rather than save code cut short.

### Guarantees and tests

`npm run test:export` (`e2e/export/`) assembles four web apps with `assembleWebApp`, from the production runtime and a local Pyodide mirror (`scripts/fetch-pyodide-mirror.mjs`), with fonts chosen by `exportFontNeeds` as the dialog does, and opens each in Chromium, Firefox and WebKit.
Their notebook (`e2e/export/notebook.ts`) has inline and display math, an HTML code block, a plain print, package imports (`numpy`, and `pytz` after a semicolon) and a slider wired to a Python callback.
Each must show the notebook in PyNote's look: the theme's colors, its code font loaded from the export itself, math in KaTeX's own fonts, also carried by the export, and the HTML code block highlighted as in PyNote (its comment and tags).
"Runs" below means that Python starts, the cells' outputs appear (both packages included), a widget round-trips through Python, and an edited cell reruns.

| Export | Opened | Checks |
| --- | --- | --- |
| Interactive, Python included, single file | from `file://`, network blocked | Runs, makes no request and logs no console error. A second test reloads the page: the reader's edits survive, and Options > Reset Notebook brings back the exported notebook. A third answers jsDelivr's Pyodide URLs from the mirror: a package the export does not include (`six`) loads, with one request, for its wheel. A fourth restarts the kernel twice: every worker starts from the same Blob URL, and Python runs afterwards. |
| Interactive, Python included, folder | from `file://`, network blocked, and from a static host | Runs and logs no console error; from `file://` it makes no request, and from the host every request stays inside the export's folder. |
| Interactive, Python from a URL, single file | from `file://`, with Pyodide served by a local server in place of jsDelivr | Runs and logs no console error. |
| Read-only, single file | from `file://`, network blocked | Shows the saved outputs and each widget's exported state without a kernel; input widgets ignore the reader; no worker, no request and no console error. Notebook shortcuts (shut down, run all, clear outputs, delete cells, undo and redo, restart) change nothing and start no worker, and Tab never reaches the hidden toolbar. |

`e2e/export/interactive-session.spec.ts` assembles one more interactive export, whose notebook holds a cell attachment and other tools' metadata: a reader's edit survives a reload, the session in localStorage stays small, and the reader's Save still writes the attachment and the metadata.

`e2e/tests/export-dialog.spec.ts`, in the app suite, exports through the dialog and opens results in a separate, offline browser context:

- the interactive single file with Python included, where Python starts and Run All runs the cells, an import after a semicolon included;
- the static export with JavaScript disabled, which shows the outputs, the moved widget's state, and the heading color and code font only PyNote's CSS gives them;
- static exports of long code cells, with every line drawn, in the default theme and under a 420px height cap, and of a line of almost 14,000 characters with line wrap off, kept whole and highlighted to its end, on one line that scrolls sideways;
- read-only and static exports of math, in KaTeX's fonts, and of an HTML code block in markdown, highlighted as in the app;
- interactive and read-only exports whose payloads hold none of the author's undo history, and a read-only export where Undo brings back nothing of it;
- interactive, read-only and static exports that hold nothing a password field held (typed by the reader, created or set by Python, or printed again), and whose readers see every password field empty.

It also checks the dialog itself: the format order and the remembered format, the script check's runs and that it never touches the notebook's kernel or execution mode, the cell it names for an error (also after a code line that looks like a cell marker), the refusal to replace a folder that is not a PyNote export, cancelling and closing during a long export, the Component's steps and settings, and a phone-sized screen.
Among the Component's settings, the Folder URL field is named by its label alone, and the config's theme is the look alone, without the app's save-to-notebook setting.
A read-only export shows a widget as it is on screen, also after a kernel restart.

The spec runs in Chromium, the app suite's browser.
What differs between engines also runs in a WebKit browser that the spec launches, with Pyodide answered from the local mirror as the suite's `pyodideMirror` fixture does (not in Firefox, which does not route the worker's module imports, so it would load Pyodide from the network):

- the dialog is modal: Tab and Shift+Tab stay in it, the notebook behind takes no focus and no key, the arrow keys move through the formats, and Escape closes it, with focus back where it was;
- without the File System Access API, one file downloads as itself, and a pair or a web app folder as one `.zip`.

No other browser test opens a static export, so it is only tested in Chromium; `flattenDocument` also has unit tests in jsdom (`src/lib/export/static-html.test.ts`).
Replacing an earlier folder export is tested in `src/lib/export/save.test.ts`, on an in-memory file system holding real assembled exports, and so is the `.zip` a pair downloads as without folder access.

## Embeddable component

The `pynote` package (`packages/pynote`) puts PyNote's code cells on other websites.
Each cell is PyNote's own `CodeCell`; all cells on a page are one notebook (PyNote's store, kernel and execution modes), in page order.
The package's user documentation is its [README](../../packages/pynote/README.md).

### Runtime

`src/embed/` holds the browser runtime and the adapters:

- `bridge.ts` keeps the page's runtime in a global slot shared by every copy of the package a page loads (React and Solid islands, custom elements), and lets `configure()` run before the runtime loads: the settings wait for it.
  On the server `configure()` does nothing for the page (`server.ts`), since settings set there never reach the browser, so pages call it in browser code.
- `runtime.tsx` mounts cells: each renders into its own shadow root, inserted into the store after the mounted cells that come before it on the page.
  Page order is the composed tree's, the order readers see (`composedOrder` in `order.ts`): a cell inside another component's shadow root counts where that component is, and a slotted cell where its slot is.
  A closed shadow root hides which of its slots shows a node, but a cell inside it reaches the root (`getRootNode`), and so its slots: a cell passed to a closed root's slot stands at that slot when another of the cells is inside that root (or in a shadow root within it).
  A closed root with no cell inside cannot be read, so the cells passed to it count where its host is, in markup order.
  `composedOrder` collects the shadow roots from all the cells it orders, not from each pair, so every pair is ordered alike.
  The notebook follows the page: before every run, and whenever a cell is updated, cells move to page order (the store's `relocateCell`, which adds no undo history), so a cell whose element moved takes its new place.
  One element holds one cell: mounting on it again replaces the cell already there (React's StrictMode mounts twice in development).
  A cell without a usable id (none, an invalid one, or one already used on the page, which logs a warning) gets one from `newCellId`: 8 hex characters from `crypto.getRandomValues`, which every page has, while `crypto.randomUUID` exists only in secure contexts, and cells also run on plain-HTTP sites, such as an intranet.
  Autorun requests start Python and wait until it is ready, then run in page order, because cells do not mount in page order; a cell removed and mounted again is a new cell, which runs on load again.
  Destroying a cell also forgets what the eye button showed for it (`removeCellOverride`), so a cell mounted again with that id starts from its own view.
  Python starts on first use, from a classic worker made from a Blob, so no bundler has to handle a worker file; a relative `pyodideUrl` (such as `/pyodide/`) is resolved against the page first, since a Blob worker cannot resolve it.
- Adapters pass every option on every render, and only an option that changed is applied, so a re-render never undoes a reader's edits or the view they chose in the menu.
  A new `code` replaces the code, and an option that became undefined (a removed attribute, a prop left out) goes back to its default, the config's; a cell whose `autorun` turns on that way runs.
  View options change one at a time (`codeview.ts`): a prop, an attribute or the menu's Show/Hide Code sets one and keeps the others.
- Keys typed in a cell's fields stay in the cell (`keys.ts`): a key event leaves a shadow root retargeted to its host, so a page's own shortcuts would otherwise take keys typed into code or a widget.
  As from a text field, Escape, Tab, and Ctrl or Cmd shortcuts the cell did not handle still reach the page.
- Event handlers sit on the elements in each shadow root, never delegated to the document, so a page that stops events from bubbling (a modal, a card) does not disable the cells inside it.
  The build compiles JSX handlers that way (`delegateEvents: false`), and `runtime.tsx` empties Solid's `DelegatedEvents` set, in the package's private copy of Solid, for handlers set through a prop spread.
  Clicks in an embedded cell go on to the page, and dropdowns listen for outside clicks in the capture phase, so a menu still closes when the page stops a click.
- `profile.ts` sets the `component` host profile before the stores load: no notebook files, no app-wide settings.
  `CellWrapper` leaves out the notebook's sidebar and drag and drop for it, and each cell gets a toolbar inside its own box (`EmbeddedCell.tsx`): Run, then with `visibilityToggle` an eye button (while the cell hides something, it shows all of it, and hides it again), then the menu (`CellMenu.tsx`).
  The menu shows Python's state, runs this cell or all cells, clears the output, sets the execution mode unless it is locked, shows or hides this cell's code and every cell's line numbers (without undoing a cell's own view options), and starts, restarts or shuts down Python.
  Showing everything goes with the eye: the menu's Show or Hide Code ends it first (as saving the notebook's view settings does in the app), so Hide Code hides the code at once, and a page that turns `visibilityToggle` off ends it too, so the cell shows what the page lets it show again.
  While its menu or an editor tooltip (completions, help) is open, a cell is drawn above the cells after it, which come later in the page's stacking context; these are two `has-[...]` utilities, because Firefox did not restyle the cell for one `:has(:is(...))`.
  Cmd+Enter runs an embedded cell without adding a line, as Ctrl+Enter does.
- The adapters are thin: `react.ts` (a client component), `solid.tsx` (shipped as source under the `solid` export condition), `element.ts` (`<pynote-cell>`), and Astro components in `packages/pynote/astro/`.
  On the server they render the code as plain text; in the browser the live cell takes over the same element.
  `<pynote-cell>` takes its code from the `code` attribute, a child `<script type="text/x-python">` (dedented) or a child `<pre data-pynote-source>`, and each option from an attribute in kebab case (`BOOLEAN_ATTRIBUTES`); `<PyNoteCell>` for Astro writes its props as that same list of attributes, so a new option cannot be missed.
  The element reads its attributes again once its cell has mounted, and moving it on the page keeps its cell (its removal waits a microtask, and is skipped when the element is connected again).

### Styles

Every cell adopts two shared constructable stylesheets: PyNote's styles with Tailwind (`src/embed/embed.css`), and one `:host` rule with the theme's variables (`themeVariables` in `src/lib/theme.ts`, the same values the app writes on the document root).
Nothing is written on the page's root.
The element that holds a cell is the page's: `:host` only makes it a block (and hides it when it has `hidden`), so the page places, sizes and hides it.
The cell's text defaults sit on the top element inside its shadow root (`.pynote-root`, the container `mountCell` creates), which starts from `all: initial` and `direction: ltr`, then sets what `html`, `body` and Tailwind's preflight give the app: color, font, size, weight, letter spacing, line height, tab size and font smoothing.
Inherited properties flow into a shadow root from its host, which takes them from the page (`dir="rtl"` on its root) or from a page rule that matches it (a universal rule, a CSS reset), and such a rule beats `:host` rules; starting from `all: initial` keeps the page's fonts, colors, spacing and text direction out of the cell.
`visibility`, `pointer-events`, `interactivity` and `-webkit-locale` still inherit, so a page that hides or disables a region also hides or disables the cells in it, and the page's language still drives the fonts and line breaks of their text.
The theme's variables stay on `:host`, since Tailwind's theme variables, on `:root, :host`, refer to them.
PyNote's own styles are `src/styles/app.css`, shared by the app (`src/index.css`, which adds Tailwind and the bundled fonts) and the cells (`src/embed/embed.css`, which adds Tailwind and KaTeX's and uPlot's styles).
In both, Tailwind reads classes from `src/` only (`@import "tailwindcss" source(...)`), so tests and docs add no classes, and editing one does not make the dev server reload its pages.
Font faces only work at page level, so the package build drops every `@font-face` from the cells' sheet.
What only works at page level is added to the page once: Tailwind's `@property` registrations; KaTeX's `@font-face` rules, with their font files on jsDelivr, but never KaTeX's class rules, which stay in the cells' sheet so the page's own math keeps its style; and the font stylesheets, loaded from jsDelivr for the families the app bundles (`src/embed/cdn.ts`, pinned to the installed versions) and from Google Fonts for the others.
Code shared with the app that listens on the document uses `composedPath()`, because a click inside a shadow root reaches the document retargeted to the host.

### Package and CLI

`npm run build:package` (`vite/component-build.ts`) builds the browser runtime, the adapters, a compiled Solid adapter, the Solid source for the `solid` condition, the CLI and the type declarations.
The runtime bundles a private copy of Solid; CodeMirror is a peer dependency, and React, Solid, Astro and Pyodide are optional peers.
The worker is built in as a string, and KaTeX's font faces as a virtual module.
Every entry point loads under strict ESM resolution: the compiled Solid adapter imports the shared bridge as `./bridge.js`.

`npx pynote add` (`src/embed/cli.ts`, with its decisions in `cli-core.ts`) finds the project (the nearest `package.json`), detects the framework and package manager, installs `pynote` and the missing peers, and prints a usage example made by the same function as the Export dialog's (`componentSnippet` in `src/lib/export/component-export.ts`).
It never converts notebooks.
The example names the file it goes in, in the project's own layout (`exampleFile`): `src/pages/notebook.astro` for Astro, `src/routes/notebook.tsx` for SolidStart, `src/Notebook.tsx` for React and Solid, and for Next.js `app/notebook.tsx` with the App Router or `pages/notebook.tsx` with the Pages Router (under `src/` when the routes are there, and without `"use client"` in `pages/`), as `.jsx` when the project has no `tsconfig.json`.
When the project's folder holds a `pynote.config.json` (the CLI looks for that exact name), the example applies it, with an import relative to that file.
That import type-checks in TypeScript projects: TypeScript types the values of an imported JSON file as plain strings, so the public type's `executionMode` (`src/embed/types.ts`) accepts any string (`ExecutionMode | (string & {})`, which still suggests the four modes), and `configure()` ignores one that is not a mode, with a warning.
The HTML example keeps one-line code in the `code` attribute and puts longer code in an indented `<script type="text/x-python">`, which the element dedents (code that would end that script early stays in the attribute, with line breaks as `&#10;`).
On Windows, where npm, pnpm and yarn are `.cmd` scripts, the install runs through `cmd.exe` with every argument quoted and cmd's special characters escaped (`windowsCommandLine`), so a range such as `pynote@^0.1.0` or a path with a space arrives intact.

### Tests

`npm run test:consumers` packs the package and installs it into real projects (`test/consumers/`: Astro with MDX, SolidStart, Next.js in TypeScript, plain HTML) by running the packed CLI, as `npx` does, then builds them and runs `e2e/consumers/` in Chromium against their production servers, and against the Next.js project's development server too (React's StrictMode).
The Next.js project imports its `pynote.config.json` as the CLI's example does, so its `next build` type-checks that import; `e2e/consumers/support.ts` also checks the config against the public type (`satisfies PyNoteConfig`), so `npx tsc -b` does as well.
Pyodide comes from the local mirror and jsDelivr's npm files from `node_modules`; any other request that leaves the machine fails the test, and so does a console error.
Each project's `pynote.config.json` is what the Export dialog writes for a notebook with the `neobrutal_light` preset: `src/embed/consumer-configs.test.ts` makes it as the dialogs do (the preset loaded as the Theme dialog loads it, then the default Component settings) and checks that all four files match it (`npx vitest run -u src/embed/consumer-configs.test.ts` writes them again).
The tests check:

- that cells share one runtime, edit and run, read-only and menu-less cells, the execution mode menu, the server-rendered text, autorun order, and that re-renders keep edits;
- the menu's Python and view items, that a cell's own view options hold whatever the menus change, `visibilityToggle` (with Hide Code while the eye shows everything, which hides the code and releases the eye), menus and completions drawn over the cells below, clicks reaching the page, Cmd+Enter, and that keys typed in a cell never reach the page's shortcuts, which keep working outside the cells;
- `pynote_ui` widgets worked by mouse and keyboard, with every change reaching Python and back, and the preset theme on every cell, output and widget, with the page's styles and the cells' kept apart;
- that the page's inherited styles never reach into the cells: a universal rule, a dark site, Eric Meyer's reset, a larger body text size and `dir="rtl"` change nothing in them, while the page's `visibility: hidden` and `pointer-events: none` still reach them, and so does its language;
- elements added by a script, removed attributes going back to their defaults (`autorun` to the config's), elements moved or added back, a cell inside a site's own web component, a cell passed to the slot of a component whose closed shadow root holds a cell of its own, cells inside a widget that stops events from bubbling, and the page's own math keeping its style while the cells' math gets KaTeX's fonts;
- the eye's show-all ending when the page turns `visibilityToggle` off, and not coming back with the element added back;
- cells that mount and run on a plain-HTTP site, which has no secure context and so no `crypto.randomUUID`;
- Pyodide served from a folder of the site, named by a path, with a locked execution mode, and the Content Security Policy the README documents;
- that every entry point of the installed package loads under strict ESM, and that every cell keeps its id under `next dev`.

## Testing

All checks run locally; `npm run verify` runs every one of them.

- Vitest (`npm test`): example tests next to each module, property tests in `test/formats/` with generators full of format hazards (`test/arbitraries/`), golden files in `test/golden/`, checks that the examples and escapes in the format specifications (`docs/formats/`) are what the writers produce, and schema validation of every written `.ipynb` against the vendored nbformat 4.5 schema (`test/vendor/nbformat/`).
- Oracles (`npm run test:oracle`, which needs `uv`): Python scripts that hold the golden files to the reference tools, at pinned versions.
  `test/oracle/write_golden.py --check` compares the `.ipynb` golden files with what Jupyter's nbformat writes, and `test/oracle/check_scripts.py --jupytext` runs every `.py` golden file with CPython and reads it with jupytext's py:percent reader.
  A Vitest test (`test/oracle/oracles.test.ts`) fails when an oracle in that folder is not part of `npm run verify`.
- Playwright, app (`npm run test:e2e`): the real open, save, session and export flows with in-memory file handles (`e2e/support/file-pickers.ts`), in Chromium, with the Export dialog's modal and download tests in WebKit too.
  Every Pyodide request is answered from the local mirror, so the suite never depends on the network.
- Playwright, web app exports (`npm run test:export`) and the package in real projects (`npm run test:consumers`), described above.
