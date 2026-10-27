/// <reference path="./virtual.d.ts" />
import { createEffect, createRoot, createSignal } from "solid-js";
import { DelegatedEvents, render } from "solid-js/web";
import { actions, notebookStore, type CellCodeVisibility, type ExecutionMode } from "../lib/store";
import { kernel } from "../lib/pyodide";
import { PYODIDE_CDN_URL } from "../lib/pyodide-config";
import { completeTheme, currentTheme, setBracketHighlightTarget, themeVariables, updateTheme } from "../lib/theme";
import { DEFAULT_CODE_VISIBILITY, removeCellOverride, setVisibilitySettings } from "../lib/codeVisibility";
import { createExecution } from "../lib/execution";
import { loadThemeFonts, setBundledFamilyStylesheet } from "../lib/font-loader";
import { isValidCellId, newCellId } from "../lib/formats/ids";
import WORKER_SOURCE from "virtual:pynote-worker";
import KATEX_FONT_FACES from "virtual:pynote-katex-font-faces";
import BASE_CSS from "./embed.css?inline";
import { fontStylesheet } from "./cdn";
import { mergeConfig } from "./bridge";
import { CODEVIEW_KEYS, type CodeviewChanges, changeCellCodeview } from "./codeview";
import EmbeddedCell from "./EmbeddedCell";
import { KEY_EVENTS, keepTypingInCell } from "./keys";
import { composedOrder } from "./order";
import type { CellHandle, CellOptions, PyNoteConfig, PyNoteRuntime } from "./types";

// The browser runtime of the pynote package: every cell on the page is a cell
// of one notebook (PyNote's store, kernel and execution modes), in page order.
// Each cell renders into its own shadow root, so the page's styles and the
// cell's never meet; the theme reaches all of them through one shared sheet.

const EXECUTION_MODES: readonly ExecutionMode[] = ["queue_all", "hybrid", "direct", "reactive"];
const isExecutionMode = (mode: unknown): mode is ExecutionMode => (EXECUTION_MODES as readonly unknown[]).includes(mode);

// Event handlers go on the elements in each cell's shadow root, never through
// the document: a page that stops an event from bubbling (a modal, a card)
// must not disable the cells inside it. The package build compiles JSX
// handlers that way (delegateEvents: false); handlers that reach an element
// through a prop spread (CellWrapper's) are set by Solid's runtime, which
// delegates the events in this set. The package has its own copy of Solid,
// so the page's is not affected.
DelegatedEvents.clear();

const codeviewOf = (options: Partial<CellOptions>): CellCodeVisibility | undefined => {
  const view: CellCodeVisibility = {};
  for (const key of CODEVIEW_KEYS) if (typeof options[key] === "boolean") view[key] = options[key];
  return Object.keys(view).length > 0 ? view : undefined;
};

/** A folder URL for the kernel: absolute, ending with "/". */
const pyodideFolderUrl = (url: string): string => {
  // Resolved against the page: the worker starts from a Blob, whose URL
  // cannot anchor a relative one (such as "/pyodide/").
  const absolute = new URL(url, document.baseURI).href;
  return absolute.endsWith("/") ? absolute : `${absolute}/`;
};

interface Defaults {
  editable: boolean;
  menu: boolean;
  autorun: boolean;
  lockExecutionMode: boolean;
}

export function createRuntime(version: string): PyNoteRuntime {
  let config: PyNoteConfig = {};
  const [defaults, setDefaults] = createSignal<Defaults>({ editable: true, menu: true, autorun: false, lockExecutionMode: false });

  // --- Styles --------------------------------------------------------------
  // One parsed copy of PyNote's styles for every cell, and one rule carrying
  // the theme's variables (written on :host, never on the page's root).
  const baseSheet = new CSSStyleSheet();
  baseSheet.replaceSync(BASE_CSS);
  const themeSheet = new CSSStyleSheet();
  themeSheet.replaceSync(":host {}");
  const themeRule = themeSheet.cssRules[0] as CSSStyleRule;

  // Rules that only work at page level: Tailwind's @property registrations
  // (ignored inside shadow roots), and KaTeX's font faces. Only these: KaTeX's
  // class rules stay in the cells' sheet, where they cannot restyle the
  // page's own math.
  let pagePrepared = false;
  const addPageStyle = (name: string, css: string) => {
    const style = document.createElement("style");
    style.setAttribute("data-pynote", name);
    style.textContent = css;
    document.head.appendChild(style);
  };
  const preparePage = () => {
    if (pagePrepared) return;
    pagePrepared = true;
    const properties = BASE_CSS.match(/@property\s+[^{]+\{[^}]*\}/g);
    if (properties) addPageStyle("properties", properties.join("\n"));
    addPageStyle("katex", KATEX_FONT_FACES);
  };
  setBundledFamilyStylesheet(fontStylesheet);

  // --- Python --------------------------------------------------------------
  // A classic worker from a Blob: no bundler has to know about it, and it
  // starts on any page (Pyodide loads from the configured URL).
  kernel.configure({
    createWorker: () => new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }))),
    pyodide: { kind: "url", indexURL: PYODIDE_CDN_URL },
  });
  // Started on first use, so a page whose readers run nothing never downloads Python.
  const startPython = () => {
    if (!kernel.started || kernel.status === "stopped" || kernel.status === "error") kernel.init();
  };

  const cells = new Map<string, { host: HTMLElement; root: ShadowRoot; destroy: () => void }>();
  let execution!: ReturnType<typeof createExecution>;
  createRoot(() => {
    execution = createExecution();
    createEffect(() => {
      for (const [name, value] of Object.entries(themeVariables(currentTheme))) themeRule.style.setProperty(name, value);
    });
    createEffect(() => {
      void loadThemeFonts({
        font: currentTheme.font,
        codeTypography: { fontFamily: currentTheme.codeTypography.fontFamily },
        uiTypography: { fontFamily: currentTheme.uiTypography.fontFamily },
      });
    });
  });
  setBracketHighlightTarget({
    scope: () => cells.values().next().value?.root ?? null,
    write: (filter) => themeRule.style.setProperty("--bracket-highlight-filter", filter),
  });

  // The notebook follows the page: once an element with a cell has moved (into
  // a tab panel, within a sortable list), its cell takes its new place. Cells
  // whose element is out of the page (about to go) end up last. Places are in
  // the composed tree (order.ts), so a cell inside another component's shadow
  // root counts where that component is.
  const syncOrder = () => {
    const placed = notebookStore.cells.map((cell) => cell.id).filter((id) => cells.get(id)?.host.isConnected);
    const hostOf = (id: string) => cells.get(id)!.host;
    const order = composedOrder(placed.map(hostOf));
    const ordered = [...placed].sort((a, b) => order(hostOf(a), hostOf(b)));
    ordered.forEach((id, index) => actions.relocateCell(id, index));
  };

  const run = (id: string) => {
    syncOrder();
    startPython();
    execution.runCell(id);
  };
  const runAll = () => {
    syncOrder();
    startPython();
    void execution.runAll();
  };

  // Clicking elsewhere on the page deselects, as the notebook's background does.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!notebookStore.activeCellId) return;
      const path = e.composedPath();
      for (const { host } of cells.values()) if (path.includes(host)) return;
      actions.setActiveCell(null);
    },
    true,
  );

  // Autorun cells run once each, in page order. Cells do not mount in page
  // order (islands and elements resolve in any order), so a request starts
  // Python but waits for it to be ready, then every waiting cell runs in page
  // order. A cell that mounts once Python is ready runs right away. A cell
  // mounted again (a page that comes back, an element added back) is a new
  // cell: it runs again.
  const wantsAutorun = new Map<string, () => boolean>();
  /** Whether a cell runs on load: its own setting, else the config's. */
  const autoruns = (cellOptions: CellOptions) => cellOptions.autorun ?? defaults().autorun;
  const autoran = new Set<string>();
  const waitingToRun = new Set<string>();
  let waitingForPython = false;
  const scheduleAutorun = () => {
    for (const [id, wants] of wantsAutorun) {
      if (autoran.has(id) || !wants()) continue;
      autoran.add(id);
      waitingToRun.add(id);
    }
    if (waitingToRun.size === 0 || waitingForPython) return;
    waitingForPython = true;
    startPython();
    kernel.whenReady().then(
      () => {
        waitingForPython = false;
        syncOrder();
        const ids = notebookStore.cells.map((cell) => cell.id).filter((id) => waitingToRun.has(id));
        waitingToRun.clear();
        for (const id of ids) execution.runCell(id);
      },
      () => {
        // Python did not start; the cells show that when run by hand.
        waitingForPython = false;
        waitingToRun.clear();
      },
    );
  };

  // Where a new cell goes: after every mounted cell that comes before it on the page.
  const pageIndex = (host: HTMLElement) => {
    const others = notebookStore.cells.flatMap((cell) => cells.get(cell.id)?.host ?? []);
    const order = composedOrder([host, ...others]);
    return others.filter((other) => order(other, host) < 0).length;
  };

  const mountCell = (host: HTMLElement, options: CellOptions): CellHandle => {
    preparePage();
    // One cell per element: mounting again replaces the cell already there
    // (React's StrictMode mounts twice in development, and the first mount
    // can finish after the second has started).
    for (const cell of [...cells.values()]) if (cell.host === host) cell.destroy();

    const taken = new Set(notebookStore.cells.map((cell) => cell.id));
    let id = options.id ?? "";
    if (!isValidCellId(id) || taken.has(id)) {
      if (options.id !== undefined) {
        console.warn(`pynote: cell id "${options.id}" is ${isValidCellId(options.id) ? "already used on this page" : "not a valid id"}; using a generated one.`);
      }
      id = newCellId(taken);
    }

    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.replaceChildren();
    root.adoptedStyleSheets = [baseSheet, themeSheet];
    // Keys typed in the cell never reach the page's own shortcuts (keys.ts).
    for (const type of KEY_EVENTS) root.addEventListener(type, keepTypingInCell);
    // Attached before rendering, so the code editor finds its shadow root.
    // Its class keeps the page's inherited styles out of the cell (embed.css).
    const container = document.createElement("div");
    container.className = "pynote-root";
    root.appendChild(container);

    const [options$, setOptions] = createSignal<CellOptions>(options);
    const codeview = codeviewOf(options);
    actions.attachCell({ id, content: options.code ?? "", metadata: codeview ? { pynote: { codeview } } : undefined }, pageIndex(host));

    let destroyed = false;
    let dispose = () => {};
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      dispose();
      container.remove();
      actions.detachCell(id);
      cells.delete(id);
      wantsAutorun.delete(id);
      autoran.delete(id);
      waitingToRun.delete(id);
      // A cell mounted again with this id is a new cell: the eye released.
      removeCellOverride(id);
    };
    cells.set(id, { host, root, destroy });
    wantsAutorun.set(id, () => autoruns(options$()));

    dispose = render(
      () => (
        <EmbeddedCell
          id={id}
          editable={() => options$().editable ?? defaults().editable}
          menu={() => options$().menu ?? defaults().menu}
          visibilityToggle={() => options$().visibilityToggle ?? false}
          lockExecutionMode={() => defaults().lockExecutionMode}
          run={run}
          runAll={runAll}
          startPython={startPython}
          checkRedefinitions={(cellId) => execution.getRedefinitionChecker(cellId)}
        />
      ),
      container,
    );
    scheduleAutorun();

    return {
      // Adapters pass every option on every render. Only an option that
      // changed is applied, so a re-render never undoes the reader's edits or
      // the view they chose in the menu; a new `code` does replace the code,
      // and an option that became undefined goes back to the default.
      update(next) {
        if (destroyed) return;
        const previous = options$();
        setOptions({ ...previous, ...next, code: next.code ?? previous.code });
        if (next.code !== undefined && next.code !== previous.code) actions.updateCell(id, next.code);
        const view: CodeviewChanges = {};
        for (const key of CODEVIEW_KEYS) if (key in next && next[key] !== previous[key]) view[key] = next[key];
        if (Object.keys(view).length > 0) changeCellCodeview(id, view);
        // Turned on by the page, or by going back to a config that runs cells on load.
        if (autoruns(options$()) && !autoruns(previous)) scheduleAutorun();
        syncOrder();
      },
      destroy,
    };
  };

  const configure = (next: PyNoteConfig) => {
    config = mergeConfig(config, next);
    if (next.theme !== undefined) updateTheme(completeTheme(config.theme ?? {}));
    if (next.codeVisibility !== undefined) setVisibilitySettings({ ...DEFAULT_CODE_VISIBILITY, ...config.codeVisibility });
    if (next.executionMode !== undefined) {
      if (isExecutionMode(next.executionMode)) actions.setExecutionMode(next.executionMode);
      else console.warn(`pynote: unknown execution mode "${String(next.executionMode)}".`);
    }
    if (next.pyodideUrl !== undefined) {
      try {
        kernel.configure({ pyodide: { kind: "url", indexURL: pyodideFolderUrl(next.pyodideUrl) } });
      } catch {
        console.warn(`pynote: pyodideUrl "${String(next.pyodideUrl)}" is not a URL.`);
      }
    }
    setDefaults({
      editable: config.editable ?? true,
      menu: config.menu ?? true,
      autorun: config.autorun ?? false,
      lockExecutionMode: config.lockExecutionMode ?? false,
    });
    if (config.autorun) scheduleAutorun();
  };

  return { version, configure, mountCell };
}
