# Contributing to PyNote

Thanks for checking out PyNote! Contributions of all sizes are welcome, including bug
reports, documentation fixes, tests, and code.

## Getting set up

PyNote uses Vite 7, so you will need Node.js 20 or newer and npm. There is no
backend service to run. The Python kernel (Pyodide) is downloaded from the
jsDelivr CDN at runtime, from the version pinned in
[src/lib/pyodide.worker.ts](src/lib/pyodide.worker.ts), so the first kernel
start needs a network connection. The browser caches it after that.

```sh
git clone https://github.com/bouzidanas/pynote-notebook-editor.git
cd pynote-notebook-editor
npm install
npm run dev
```

The development server is available at `http://localhost:5173` by default.

A few things that help while developing:

- Notebooks autosave to localStorage as sessions, addressed by a `?session=`
  query parameter. To reproduce first-run behavior, use a private window or
  clear the site's localStorage rather than just reloading.
- Press `Ctrl-\` in the app for the keyboard shortcut overlay.
- The kernel status indicator in the toolbar shows when Pyodide is ready.
  Python cells run before that point are queued, not lost.

Common commands, run from the project root:

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Vite development server with hot reload. |
| `npm run build` | Type-checks the project and creates a production build. |
| `npm test` | Runs the Vitest unit and component test suite once. |
| `npm run test:watch` | Runs Vitest in watch mode. |
| `npm run test:coverage` | Runs Vitest and writes coverage reports to `reports/coverage`. |
| `npm run test:e2e` | Runs the Playwright end-to-end suite against the real app and Pyodide kernel. |
| `npm run gen:presets` | Regenerates built-in theme presets from the notebooks in `themed-notebooks/`. |

Before running the browser tests for the first time, install Chromium:

```sh
npx playwright install chromium
```

Each end-to-end test opens a fresh page and starts a real Pyodide kernel. The
suite runs one test at a time to avoid loading several WebAssembly kernels at
once, so expect it to take a while. Playwright chooses an available port and
starts its own Vite server for every run. You can leave your regular development
server running without the suite accidentally connecting to it.

See [src/test/README.md](src/test/README.md) for focused Vitest commands and
[e2e/README.md](e2e/README.md) for Playwright conventions and debugging options.

## Where things live

- `src/components/` contains the SolidJS notebook UI, editors, dialogs, and the
  frontend renderers for `pynote_ui` components.
- `src/lib/store.ts` owns notebook state, cell actions, execution modes, and the
  reactive dependency graph.
- `src/lib/pyodide.ts` and `src/lib/pyodide.worker.ts` implement the main-thread
  and worker sides of Python execution.
- `src/lib/python-runtime/` contains the Python sources the worker writes into
  the Pyodide filesystem at startup, including the copy of `pynote_ui` that
  actually runs in the app.
- `packages/pynote_ui/` is a separately maintained installable version of the
  Python API. It is not loaded by the browser app and is not automatically kept
  in sync with the embedded runtime. `scripts/build_python_pkg.sh` builds it
  into a wheel under `public/packages/`.
- `src/test/` and colocated `*.test.ts` or `*.test.tsx` files contain Vitest
  setup and tests.
- `e2e/` contains Playwright page objects, fixtures, and browser-level tests.
- `docs/system-architecture/` documents the worker bridge, state management,
  execution flow, and other major system boundaries.
- `themed-notebooks/` contains the notebooks used to generate built-in theme
  presets.

For a non-trivial change, start with
[docs/system-architecture/architecture-spec.md](docs/system-architecture/architecture-spec.md),
then read the document for the system you are changing. The architecture docs
are useful guides, but the current code and tests remain the final source of
truth.

## Coding conventions

These conventions come from the way PyNote is built. They are meant to protect
the parts of the architecture that make the app responsive, portable, private,
and easy to present. Understanding the reason behind them is more useful than
memorizing a list of rules.

### Keep the interface reactive

SolidJS updates the page by tracking exactly where reactive values are read.
That is a good fit for PyNote notebooks which are interactive and can contain a
high number of dynamic, editable, or changing elements. When there are a high number
of such elements, we absolutely need to minimize the number of things that
rerender when one element or more needs to change. The granularity we need goes
below the cell or editor level. A single toolbar button can change its active
state, a status indicator can update, or one property of one `pynote_ui`
component can change without rerendering its cell, toolbar, editor, or the
surrounding notebook. SolidJS signals update the exact DOM elements that depend
on them. This direct, element-level state control is one of the main reasons
PyNote uses SolidJS. SolidJS is one of the key reasons PyNote's UI is so snappy.

However, that fine-grained behavior only works while values remain
inside Solid's reactive system. If a prop or store value is read once and
copied into a normal variable, Solid no longer tracks later changes to the
original value, so the DOM element that depends on it can stop updating or reacting.

#### Rules to follow

- **Read reactive props and store values where they are used.** Do not copy them
  into normal variables when later updates need to reach the interface.
- **Use signals for local state and memos for derived state.** This keeps the
  relationship between each value and the elements that depend on it explicit.
- **Use effects to synchronize with systems outside Solid.** Effects should not
  become general event handlers.
- **Clean up anything created during a mount.** Cells, editors, and outputs are
  mounted and removed frequently. Every listener, timer, observer, or component
  subscription needs a matching `onCleanup`, or rerunning and replacing cells
  can leave old handlers active.

### Keep notebook behavior in one place

The notebook structure and the actions that change it live in
`src/lib/store.ts`. This includes the cell list, undo and redo history,
execution queues, and the reactive dependency graph. Autosave observes that
state from `Notebook.tsx`, while themes and code-visibility settings have their
own stores.

These systems need clear ownership because a single notebook action can affect
several of them at once. Deleting a cell, for example, can change the active
selection, undo history, execution queue, dependency graph, and the state that
autosave needs to persist. Routing structural changes through one store and its
actions gives every part of the app the same result and keeps those related
updates together. If a component keeps and changes its own copy, it is easy for
one of those systems to miss the change and disagree with what the interface
shows.

That does not mean every setting belongs in one large store. Themes and code
visibility have their own focused state and lifecycles, so they remain with
their existing owners. The goal is one authoritative owner for each kind of
state, not one store for the entire app. Keep each kind of state with that
owner, and use the existing actions instead of creating another copy that can
drift out of sync.

App-wide behavior switches use `APP_*` constants near the code they control.
Record a new one in `APP_CONFIG_REGISTRY.md` so contributors can find the
available switches without searching the whole project. These constants are
useful for behavior that is still an app-level decision rather than a user
choice. Keeping the constant close to its implementation makes the behavior
easy to follow, while the registry prevents these switches from becoming
hidden configuration scattered across the codebase. They are not a substitute
for a real user-facing setting when users need control over the behavior.

#### Rules to follow

- **Keep each kind of state with its existing owner.** Notebook structure and
  execution state belong in `src/lib/store.ts`; themes, code visibility, and
  other specialized state stay with their current stores.
- **Change notebook state through the existing store actions.** Do not mutate
  it directly from a UI component or keep a second copy that can drift out of
  sync.
- **Register app-wide behavior switches.** Define an `APP_*` constant near the
  behavior it controls and record it in `APP_CONFIG_REGISTRY.md`.
- **Do not use an `APP_*` constant in place of a user setting.** Hardcoded
  switches are for app configuration, not options users need to change.

### Keep the Python and TypeScript sides together

`pynote_ui` looks like one API to a Python user, but each component crosses
several layers. Its Python class describes the component and handles updates,
the worker serializes that description, and a SolidJS renderer turns it into
the interface the user sees.

When adding or changing a component in the browser app, update the embedded
Python sources in `src/lib/python-runtime/pynote-ui/` and the SolidJS renderer,
including its registration in
`src/components/ui-renderer/ComponentRegistry.tsx`. The installable package
under `packages/pynote_ui/` is a separate copy, not a build input for the app.
Update it as well when the change belongs in the public Python API, and do not
assume a change to either copy reaches the other. Within each supported path,
property names, defaults, serialized data, and interaction payloads need to
agree between Python and TypeScript.

The embedded Python files are TypeScript template literals that the worker
writes into the Pyodide filesystem at startup. TypeScript can confirm that the
strings are valid TypeScript, but it cannot confirm that their contents are
valid Python. Do not add JavaScript interpolation to them. Exercise changes
with the real browser kernel, because a successful TypeScript build does not
prove that the embedded package imports or runs.

#### Rules to follow

- **Update both sides of a browser component.** Change the embedded Python API
  and its SolidJS renderer together, then register a new renderer in
  `ComponentRegistry.tsx`.
- **Keep the Python and TypeScript contract aligned.** Property names, defaults,
  serialized data, and interaction payloads must agree.
- **Treat the installable package as a separate copy.** Update
  `packages/pynote_ui/` when a change belongs in the public Python API; changing
  the embedded runtime does not update it automatically.
- **Do not add JavaScript interpolation to embedded Python.** Keep the template
  literals as plain Python source.
- **Test embedded Python with the real browser kernel.** A successful
  TypeScript build does not prove that the package imports or runs in Pyodide.

### Preserve notebook portability

PyNote reads and writes standard `.ipynb` files. A notebook made elsewhere
should open without PyNote-specific fields, and a notebook saved by PyNote
should remain useful outside the app. Document settings live under
`metadata.PyNote`, while cell settings live under `metadata.pynote`. Treat both
as optional when loading, and update both the import and export paths whenever
the saved format changes.

Cell outputs are intentionally not restored from sessions or written into
exported notebooks. Output storing and persistence is a planned feature that is in-progress. Currently, interactive components and built-in plots depend on the
live Python kernel, so restoring their old output without restoring their
Python objects would show stale, non-working results. A contributor should not
add output persistence as a side effect of another file or session change.

#### Rules to follow

- **Keep PyNote metadata optional.** Files without `metadata.PyNote` or cell
  `metadata.pynote` must continue to open normally.
- **Use the correct metadata namespace.** Document settings belong under
  `metadata.PyNote`; cell settings belong under `metadata.pynote`.
- **Update import and export together.** Any saved-format change needs a loading
  path and a saving path.
- **Do not add output persistence incidentally.** Sessions and exported
  notebooks intentionally omit outputs. Persisting them needs its own design
  because not every kernel-backed output can be restored.

### Design for every theme

Presentation is a central part of PyNote, not a cosmetic layer added at the
end. Components need to work across light, dark, quiet, and high-contrast
presets, as well as user-created themes. PyNote began with DaisyUI, but moved to
its own theme model, CSS variables, and shared Tailwind utilities. The DaisyUI
dependency and an older Tailwind configuration (which are currently being phased out) still remain in the repository,
but DaisyUI component styles are not part of the current production CSS. Use
the existing PyNote color, typography, spacing, border, shadow, component, and
layout variables instead of DaisyUI defaults or hardcoded values that happen to
work with one preset.

`src/lib/themes.ts` is generated. To change a built-in preset, edit its source
notebook under `themed-notebooks/` and run `npm run gen:presets`.

#### Rules to follow

- **Use PyNote's theme variables and shared utilities.** Prefer the existing
  color, typography, spacing, border, shadow, component, and layout system over
  hardcoded values.
- **Do not rely on DaisyUI classes or defaults.** The dependency and legacy
  configuration remain, but PyNote's own theme system drives the compiled UI.
- **Check more than one theme.** A component should remain readable and usable
  in both light and dark built-in presets, as well as with customized theme
  values that affect it.
- **Check responsive layouts when they apply.** Theme and component changes
  should not break the mobile interface.
- **Do not edit `src/lib/themes.ts` by hand.** Change the source notebook under
  `themed-notebooks/` and run `npm run gen:presets`.

### Test at the boundary that matters

Vitest is the quickest place to cover store logic, parsing, and isolated
components. It runs in jsdom, though, so it cannot reproduce a real Pyodide
kernel, browser file APIs, or a complete save and restore flow. Use Playwright
when the behavior crosses one of those boundaries.

Playwright tests should prefer semantic locators. If an element needs a stable
test hook, add it to `src/lib/testids.ts`. Put selectors and reusable browser
interactions in `e2e/pages/NotebookPage.ts` so the specs can describe user
behavior instead of repeating page mechanics.

When fixing a bug, look for the underlying conflict before adding code around
the symptom. A small correction to an existing path is usually more reliable
than new flags, timers, or thresholds that compensate for it.
[DEBUGGING_GUIDE.md](DEBUGGING_GUIDE.md) describes this approach in more detail.

#### Rules to follow

- **Use Vitest for isolated behavior.** Store logic, parsing, utilities, and
  isolated components should get focused unit or component tests.
- **Use Playwright when the real browser matters.** Kernel execution,
  persistence, file APIs, and complete save and restore flows need browser
  coverage.
- **Prefer semantic Playwright locators.** Add a shared test ID only when a
  stable role, label, or text locator is not available.
- **Centralize browser test mechanics.** Add shared test IDs to
  `src/lib/testids.ts` and reusable selectors or interactions to
  `e2e/pages/NotebookPage.ts`.
- **Fix the cause, not the symptom.** Investigate the conflicting path before
  adding flags, timers, thresholds, or other compensation code.

## The browser runtime and worker bridge

Most notebook applications send code to a Python process on a server. PyNote
does not. The SolidJS app and the Python runtime both live in the browser, on
two separate threads. The main thread owns the interface and notebook state.
A Web Worker owns Pyodide and runs Python without freezing the editor.

When a cell runs, the main thread sends a structured message through the
`Kernel` class. The worker executes the code and sends structured results,
stream output, errors, and component updates back to the main thread. The
request callback then updates the cell that started that execution.

This separation gives PyNote several important properties. Python work does not
run on the interface thread, so it does not block typing or scrolling. The app
has no execution backend and does not send notebook code or data to one as part
of running a cell. This keeps code and data contained and private.

### Security and sandbox protections

The separation also preserves an important security boundary. Pyodide runs Python as
WebAssembly inside a Web Worker, which is itself contained by the browser's
sandbox. Notebook code does not get native access to the operating system or
automatic access to the user's host filesystem. Instead, it works with Pyodide's virtual
filesystem and the files PyNote passes to it. The worker also has no
page DOM, so Python cannot directly inspect or modify the app's interface.

This is not a claim that notebook code has no capabilities. It can use Python,
the worker APIs exposed by the browser, and files available inside its virtual
environment. The security win is that those capabilities remain inside the
browser sandbox and away from the main interface thread. The worker is the
sandbox boundary, and crossing it requires an explicit message and a frontend
handler. Contributors should keep those crossing points safe rather than
exposing DOM objects, native file handles, or other privileged main-thread
capabilities to executed notebook code.

`pynote_ui` components cross the boundary as structured data and can only select
a renderer from `ComponentRegistry.tsx`; any unknown component types will get rejected.
Markdown and other HTML-producing output take a separate path and are sanitized
with DOMPurify before insertion. These safeguards protect the few paths where
data is allowed to leave the worker, making it much harder for sandboxed code
to turn normal output into arbitrary page access. New output paths should use
one of these guarded routes rather than inserting untrusted HTML directly.

#### Rules to follow

- **Keep executed Python inside the worker.** Do not move notebook execution
  onto the main thread or give it direct access to the page DOM.
- **Do not expose privileged main-thread objects.** DOM objects, native file
  handles, and similar browser capabilities should not be passed to notebook
  code through the bridge.
- **Keep `pynote_ui` output data-driven.** New component types must serialize
  structured data and render through the explicit component registry.
- **Sanitize every HTML-producing path.** Markdown or other rich output must
  pass through the established DOMPurify boundary before entering the page.
- **Keep bridge capabilities narrow and explicit.** Add a specific message and
  frontend handler for required behavior instead of exposing a general path
  into the main thread.

### Message routing and execution modes

The message protocol is the contract between these two halves of the app.
Execution results are routed by a request ID. Python stream output carries the
cell ID through a `ContextVar`, and live component updates are routed by
component ID. Components also capture their owning cell when they are created,
which lets callbacks create more components later without losing ownership.
Several cell executions may be in flight in the same worker, so these separate
identities are what stop streams, results, and widgets from crossing between
cells. If you change worker messages, cell execution, `pynote_ui`, or output
rendering, trace the complete round trip and test it with the real browser
kernel.

Execution also needs to remain correct in all four modes. Hybrid, queue all,
direct, and reactive mode make different decisions about when a cell may run
and which cells follow it. Changes to queueing, cancellation, dependencies, or
cell status should be checked outside the default hybrid mode too.

For the full protocol and execution flow, read
[docs/system-architecture/wasm-bridge.md](docs/system-architecture/wasm-bridge.md)
and
[docs/system-architecture/pyodide-execution.md](docs/system-architecture/pyodide-execution.md).

## Before you build something substantial

Check [open issues](https://github.com/bouzidanas/pynote-notebook-editor/issues)
and [open pull requests](https://github.com/bouzidanas/pynote-notebook-editor/pulls)
before starting. For anything beyond a small fix, open an issue describing what
you plan to change. This gives maintainers a chance to point out related work,
architecture constraints, or a smaller path to the same result before a large
amount of code is written.

## AI-assisted contributions

Using AI tools does not change the standard for a contribution or transfer
responsibility for it. Do not submit AI-generated changes that you have not
personally reviewed and tested.

Before opening a pull request, you must:

- Read and understand every change you are submitting, including generated
  tests and documentation.
- Review the result against the surrounding code and the relevant architecture
  documents. Locally plausible code can still violate a project-wide rule.
- Run the checks appropriate to the change and report the results accurately.
  Do not claim a test passed if you did not run it.
- Be able to explain the implementation decisions and address review feedback
  without relying on generated output as the justification.

You are the author and reviewer of the submitted change, regardless of which
tools helped produce it. Large, unfocused generated patches or changes that do
not match the repository's existing patterns may be closed without detailed
review.

## Pull requests

- Branch from `main` and keep each pull request focused on one concern.
- Explain what changed, why it changed, and how you verified it. Include manual
  testing steps for user-facing behavior.
- `npm test` and `npm run build` should pass for every pull request. Beyond
  that, run the checks that match the area you changed:

| Change area | Verify with |
| --- | --- |
| Store logic, cell actions, parsing, utilities | `npm test` with new or updated unit tests |
| UI components and styling | `npm test`, plus a visual pass in more than one theme preset and in the mobile layout when the component is responsive |
| Worker, embedded Python, `pynote_ui`, execution modes | `npm run test:e2e`, since only the browser suite runs a real kernel |
| Persistence, sessions, file handling | `npm run test:e2e`, plus a manual save, reload, and restore check |
| Theme presets in `themed-notebooks/` | `npm run gen:presets`, then confirm the preset in the theme dialog |

- Add regression coverage for bug fixes when the behavior can be tested
  reliably.
- Include screenshots or a short recording for visible UI changes.
- Do not include generated reports, test artifacts, temporary scripts, or
  unrelated formatting changes.
- Do not bump the package version or create release artifacts unless a
  maintainer asks for it.

## Questions, bugs, and ideas

Use the [issue chooser](https://github.com/bouzidanas/pynote-notebook-editor/issues/new/choose)
for bugs and possible fixes, enhancements and features, documentation
improvements, questions, or anything that does not fit those categories. The
forms are intentionally conversational. Explain the problem, purpose, or
motivation in your own words; you do not need to identify the responsible code
or use specialized terminology.

Screenshots, pictures, GIFs, recordings, sketches, and example notebooks are
welcome. Drag them into the media field when they can communicate the issue or
idea more clearly than text alone.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).