# pynote

Live Python cells for your website.
Each cell is PyNote's code cell: the same editor, outputs, widgets and look, running Python in the browser with [Pyodide](https://pyodide.org).
All cells on a page share one Python runtime, in page order, so a page with several cells works like one notebook: a variable defined in a cell at the top is there for a cell further down.

Works in Astro (pages and MDX), Next.js and React, SolidStart and Solid, and any HTML page.

## Set up

In your project's folder:

```sh
npx pynote add
```

It finds your framework and package manager, installs `pynote` with the packages it needs (CodeMirror, as peer dependencies), and prints an example for your framework: the file it goes in and its code.
In Next.js, that file is `app/notebook.tsx` with the App Router, or `pages/notebook.tsx` with the Pages Router (a page of its own, at `/notebook`), under `src/` when your routes are there.
It never touches notebooks.

To give the cells a notebook's look and settings, export the notebook from PyNote first (Export, then Component) and save its `pynote.config.json` in your project's folder, next to `package.json`.
The example then imports it from there (see [Configure the notebook](#configure-the-notebook)).

To install by hand, run `npm install pynote`.
npm and pnpm install the CodeMirror peer dependencies with it; with Yarn, add the `@codemirror/*` and `@lezer/highlight` packages listed in `peerDependencies` as well.

## Use

### Astro (pages and MDX)

```mdx
import { PyNoteCell } from "pynote/astro";

<PyNoteCell code={"x = 21"} />

Text between cells. They share one Python runtime.

<PyNoteCell code={"print(x * 2)"} />
```

No integration is needed: the component brings its own client script.

### React and Next.js

```jsx
import { PyNoteCell } from "pynote/react";

export default function Example() {
  return (
    <>
      <PyNoteCell code={"x = 21"} />
      <PyNoteCell code={"print(x * 2)"} />
    </>
  );
}
```

The module is a client component (`"use client"`), so it works in Next.js server components as is.

### Solid and SolidStart

```jsx
import { PyNoteCell } from "pynote/solid";

export default function Example() {
  return (
    <>
      <PyNoteCell code={"x = 21"} />
      <PyNoteCell code={"print(x * 2)"} />
    </>
  );
}
```

Your app's Solid compiles the component, for the server and the browser, from the source the package exports under the `solid` condition (SolidStart and `vite-plugin-solid` use it).
Bundlers without that condition get a compiled build for the browser.

### Any page

```html
<script type="module">
  import "https://esm.sh/pynote/element";
</script>

<pynote-cell code="x = 21"></pynote-cell>

<pynote-cell>
  <script type="text/x-python">
    print(x * 2)
  </script>
</pynote-cell>
```

With a bundler, `import "pynote/element"` defines the element.
Code goes in the `code` attribute, or in a child `<script type="text/x-python">` (so that `<` in Python is not read as HTML); indentation common to its lines is removed.
Attributes are the cell options below, in kebab case: `cell-id`, `editable`, `menu`, `autorun`, `show-code`, `visibility-toggle` and so on (`editable="false"` turns an option off).

On the server, and until JavaScript runs, the Astro, React and Solid components show the code as plain text, and so does a `<pynote-cell>` whose code is in a child `<pre data-pynote-source>`.
Code in the `code` attribute or in a `<script type="text/x-python">` shows once the cell starts.

## Configure the notebook

Settings for all cells on the page, set once:

```js
import { configure } from "pynote/react"; // or pynote/solid, pynote/element, pynote

configure({
  executionMode: "reactive",
  theme: { colors: { background: "#101820" } },
});
```

In Astro, put `<PyNoteConfig config={...} />` (from `pynote/astro`) once on the page or in a layout.
In plain HTML, add `<script type="application/json" data-pynote-config>{ ... }</script>` before the cells.
Elsewhere, call `configure()` in code that runs in the browser: a client component (`"use client"` in Next.js), a Solid component or route, or a module script.
It can run before the first cell; later calls change only what they name.
During server rendering the call does nothing for the page (its settings never reach the browser), and a Next.js server component cannot call it at all, since `pynote/react` is a client module.

PyNote's Export dialog (Export, then Component) writes a `pynote.config.json`, ready to pass to `configure` or `<PyNoteConfig>`.
Its Component settings cover the whole config: the execution mode and whether readers can change it, editable code, the cell menu, running on load, the theme and the view (the notebook's or PyNote's defaults), and where Pyodide loads from (jsDelivr, or a folder of your site).

| Option | Default | |
| --- | --- | --- |
| `executionMode` | `"hybrid"` | How cells run: `"queue_all"` (one at a time), `"hybrid"`, `"direct"` (concurrently) or `"reactive"` (a cell's change reruns the cells that use its names). |
| `lockExecutionMode` | `false` | Readers cannot change the execution mode from the cell menu. |
| `editable` | `true` | Default for cells: readers can edit the code. |
| `menu` | `true` | Default for cells: show the cell menu. |
| `autorun` | `false` | Default for cells: run when the page loads (in page order, once Python has started). |
| `theme` | PyNote's default theme | PyNote's theme settings, as differences from the default theme. |
| `codeVisibility` | PyNote's default view: everything shown but line numbers, long lines wrapped | Which parts of every cell show: `showCode`, `showStdout`, `showStderr`, `showResult`, `showError`, `showStatusDot`, `showExecutionCount`, `showLineNumbers`, `lineWrap`. |
| `pyodideUrl` | jsDelivr | The folder Pyodide is loaded from: a URL, or a path on your site such as `"/pyodide/"` (see [Python](#python)). |

## Cell options

| Option | | |
| --- | --- | --- |
| `code` | required | The cell's code. A changed `code` replaces what is in the editor; re-rendering with the same `code` keeps the reader's edits. |
| `id` | generated | A stable id (letters, digits, `-` and `_`). |
| `editable`, `menu`, `autorun` | from the config | As in the config, for this cell. |
| `showCode`, `showStdout`, `showStderr`, `showResult`, `showError`, `showStatusDot` | from the config | What this cell shows. |
| `visibilityToggle` | `false` | An eye button next to the run button, as in PyNote's cell toolbar. It shows while the cell hides something: readers can show all of it, and hide it again. Hide Code in the cell menu ends showing everything, and so does turning the option off. |

Options can change at any time, as props or attributes: a changed option applies and the others stay as they are, and an option no longer set (a removed attribute, a prop left out) goes back to its default.
Cells follow the page: a `<pynote-cell>` moved into a tab panel or within a list keeps its code, output and Python variables, and takes its new place in the notebook's order.
That order is the order readers see, inside your own web components too: a cell in a component's shadow root counts where the component is, and a cell passed to a `<slot>` counts where the slot is.
A closed shadow root (`mode: "closed"`) hides from scripts outside it which slot shows a cell: a cell passed to one of its slots counts where the slot is when another cell is inside that shadow root, and otherwise where the component is, in the order of your markup.
A cell removed from the page and added back later is a new cell: with `autorun`, it runs again, and what a reader showed with the eye button is hidden again.

## In the browser

Each cell has a run button and a menu in its top corner (on hover; always on touch screens), and, with `visibilityToggle`, an eye button between them.
The menu shows whether Python is running, runs this cell or all cells, clears the output, sets the execution mode (unless locked), hides or shows the code and line numbers, and starts, restarts or shuts down Python.
Ctrl+Enter (Cmd+Enter), Shift+Enter or Alt+Enter runs the cell, and Escape leaves the editor.

Keys typed in a cell, in its code or in a widget's field, stay in the cell: your site's own keyboard shortcuts (`/` or `s` for search, arrows to turn pages) never take them, and keep working everywhere else on the page.
As from any text field, Escape, Tab and shortcuts with Ctrl or Cmd that the cell does not use (Ctrl+K for a search box, say) still reach the page.

### Python

Python starts the first time a cell runs (or on load, when a cell has `autorun`), so a page whose readers run nothing downloads nothing.
Pyodide comes from jsDelivr by default, about 10 MB on the first run and cached after that, plus the Pyodide packages a cell imports (numpy, pandas and the others in [Pyodide's list](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)).

To serve Pyodide yourself (an intranet, no CDN), put Pyodide 0.29.4's files in a public folder of your site and set `pyodideUrl` to that folder: a URL, or a path such as `"/pyodide/"`, which is resolved against the page's URL.
The folder needs Pyodide's core files (`pyodide.js`, `pyodide.mjs`, `pyodide.asm.js`, `pyodide.asm.wasm`, `python_stdlib.zip` and `pyodide-lock.json`, as in the npm package `pyodide@0.29.4`), the `micropip` wheel, which Python loads when it starts, and the wheels of the Pyodide packages your cells import, with their dependencies (listed in `pyodide-lock.json`).
The simplest way to have them all is the full release, `pyodide-0.29.4.tar.bz2`, from [Pyodide's releases](https://github.com/pyodide/pyodide/releases/tag/0.29.4).

### Styles

Cells render in their own shadow root: your site's CSS does not reach into them, and theirs does not leak out.
That includes what elements pass on to their content (fonts, colors, line height, letter spacing, text direction), even from a universal rule or a CSS reset: cells look the same on any page, and read left to right on a right-to-left one.
Your page still places, sizes and hides the element that holds a cell.
What they add to the page itself (font stylesheets, and `<style>` elements in its head) only declares fonts and registers CSS custom properties, which style nothing by themselves.
The theme comes from the config, and applies to everything in the cells: code, outputs, `pynote_ui` widgets and charts.
Fonts load once per page, from jsDelivr (the theme's fonts and KaTeX's math fonts) and Google Fonts (other families a theme names).

## Requirements

- Chrome or Edge 111+, Firefox 128+, Safari 16.4+: the cells' styles use modern CSS (cascade layers, `color-mix()`, `@property`).
- With a Content Security Policy, these sources besides your site's own:
  - `script-src 'wasm-unsafe-eval' https://cdn.jsdelivr.net`: Pyodide compiles WebAssembly, and its scripts come from jsDelivr.
    The Python worker starts from a Blob and follows the page's policy.
  - `worker-src blob:`: that worker.
  - `connect-src https://cdn.jsdelivr.net`: Pyodide's files and packages.
  - `style-src 'unsafe-inline' https://cdn.jsdelivr.net`: inline styles in the cells and the `<style>` elements they add to the page's head, and the font stylesheets.
  - `font-src https://cdn.jsdelivr.net`: the font files.
  - `img-src data:`: figures and widget icons.
  - When you serve Pyodide yourself, your site replaces jsDelivr in `script-src` and `connect-src`.
  - For a theme that names a font family PyNote does not bundle: `connect-src https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com` (Google Fonts).
- Sizes inside cells are in `rem`, so they follow your page's root font size (16 px in browsers by default).

## License

MIT
