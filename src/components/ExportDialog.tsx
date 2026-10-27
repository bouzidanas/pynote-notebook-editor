import { type Component, For, Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { Copy, Download, LoaderCircle, X } from "lucide-solid";
import clsx from "clsx";
import { documentFromApp } from "../lib/notebook-io";
import { notebookStore } from "../lib/store";
import { TESTID } from "../lib/testids";
import { currentTheme, defaultTheme } from "../lib/theme";
import { DEFAULT_CODE_VISIBILITY, getVisibilitySettings } from "../lib/codeVisibility";
import { type TextFormat, type TextOptions, buildTextExport } from "../lib/export/text-exports";
import { type DependencyInfo, type ScriptChecker, startScriptChecker } from "../lib/export/script-check";
import { type WebAppOptions, type WebAppProgress, buildWebApp } from "../lib/export/web-app-export";
import { type SaveTarget, chooseExportFolder, chooseFile, chooseFolder } from "../lib/export/save";
import { EARLIER_WEB_APP_FOLDER } from "../lib/export/web-app";
import {
  CONFIG_FILE,
  type ComponentOptions,
  type NotebookLook,
  SETUP_COMMAND,
  componentConfig,
  componentSnippet,
  themeDifferences,
  viewDifferences,
} from "../lib/export/component-export";
import { FILE_KINDS, FORMATS, type FormatId, formatInfo, safeBaseName } from "./export-dialog/formats";
import { componentOptionsFor, loadPreferences, savePreferences, storedComponent } from "./export-dialog/preferences";
import { Tabs } from "./export-dialog/controls";
import ScriptCheck, { type CheckState } from "./export-dialog/ScriptCheck";
import TextSettings from "./export-dialog/TextSettings";
import WebAppSettings from "./export-dialog/WebAppSettings";
import ComponentSettings from "./export-dialog/ComponentSettings";
import PreviewPane, { copyText } from "./export-dialog/PreviewPane";

// The Export dialog: one place for every format PyNote writes besides saving.
// The formats in a sidebar; the chosen format's settings in the main panel,
// with a Preview tab next to them showing exactly what will be written; the
// file name and the Export button in the footer. The notebook is captured
// when the dialog opens, and the dialog is modal (the page behind it is
// inert), so the preview and every export write that same notebook.

const TEXT_FORMATS: ReadonlySet<FormatId> = new Set<FormatId>(["pynote", "ipynb", "python", "markdown", "pair"]);
const isText = (format: FormatId): format is TextFormat => TEXT_FORMATS.has(format);

// The controls Tab reaches in `root`, in order (radio groups keep one in the
// tab order, the others have tabIndex -1).
const TABBABLE = "a[href], button, input, select, textarea, [tabindex], [contenteditable=true]";
const tabbables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  );

// How long typing must pause before the script is checked again.
const CHECK_DELAY_MS = 300;

type PanelTab = "settings" | "preview";

interface ExportDialogProps {
  onClose: () => void;
}

const ExportDialog: Component<ExportDialogProps> = (props) => {
  const doc = documentFromApp();
  const codeCells = doc.cells.filter((cell) => cell.type === "code");
  const cellNumber = (id: string) => doc.cells.findIndex((cell) => cell.id === id) + 1;
  const notebookName = (notebookStore.filename || "").replace(/\.(ipynb|pynote)$/i, "") || "Untitled";

  const initial = loadPreferences();
  const [format, setFormat] = createSignal<FormatId>(initial.format);
  const [text, setText] = createSignal<TextOptions>(initial.text);
  const [webapp, setWebapp] = createSignal<WebAppOptions>(initial.webapp);
  const [component, setComponent] = createSignal<ComponentOptions>(componentOptionsFor(initial, notebookStore.executionMode));
  const [name, setName] = createSignal(notebookName);
  const [configName, setConfigName] = createSignal(CONFIG_FILE.replace(/\.json$/, ""));
  const [tab, setTab] = createSignal<PanelTab>("settings");
  const [pairTab, setPairTab] = createSignal<"py" | "md">("py");
  const [componentTab, setComponentTab] = createSignal<"usage" | "config">("usage");
  const [busy, setBusy] = createSignal(false);
  const [progress, setProgress] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    savePreferences({ format: format(), text: text(), webapp: webapp(), component: storedComponent(component()) });
  });

  const baseName = () => safeBaseName(format() === "component" ? configName() : name());
  const setBaseName = (value: string) => (format() === "component" ? setConfigName(value) : setName(value));
  const info = () => formatInfo(format());

  // --- Script check (Python and Python + Markdown) --------------------------
  // A throwaway kernel orders the cells by their dependencies (as reactive
  // mode runs them) and runs the exact script; the notebook's own kernel and
  // execution mode are never touched.
  const [dependencies, setDependencies] = createSignal<Map<string, DependencyInfo> | null>(null);
  const [check, setCheck] = createSignal<CheckState>({ status: "idle" });
  let checker: Promise<ScriptChecker> | null = null;
  let disposed = false;
  const needsScript = () => format() === "python" || format() === "pair";

  createEffect(
    on(needsScript, (needed) => {
      if (!needed || checker || codeCells.length === 0) return;
      setCheck({ status: "starting" });
      checker = startScriptChecker();
      checker
        .then(async (c) => {
          if (disposed) return;
          setDependencies(await c.analyze(codeCells.map((cell) => ({ id: cell.id, source: cell.source }))));
        })
        .catch((err: unknown) => {
          if (!disposed) setCheck({ status: "unavailable", message: err instanceof Error ? err.message : String(err) });
        });
    }),
  );
  onCleanup(() => {
    disposed = true;
    void checker?.then((c) => c.dispose()).catch(() => {});
  });

  // A script export waits for the cell order, so the file written is the one
  // checked. If Python cannot start, the notebook's order is used.
  const orderPending = () => needsScript() && codeCells.length > 0 && !dependencies() && check().status !== "unavailable";

  const textExport = createMemo(() => {
    const f = format();
    if (!isText(f)) return null;
    return buildTextExport(doc, f, baseName(), text(), dependencies() ?? undefined);
  });

  // Check the script once its order is known, and again when its text changes
  // (an option, or the pair's file name in the .py header). The same text is
  // never checked twice, a check starts once typing pauses, and the checker
  // runs one at a time, skipping any that a newer one replaced.
  const script = createMemo(() => (needsScript() && dependencies() ? textExport()?.script : undefined), undefined, {
    equals: (a, b) => a?.text === b?.text,
  });
  let checkRun = 0;
  let checkedText: string | undefined;
  let checkDelay: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    on(script, (current) => {
      if (!current || !checker || current.text === checkedText) return;
      const ready = checker;
      checkedText = current.text;
      const run = ++checkRun;
      setCheck({ status: "running" });
      clearTimeout(checkDelay);
      checkDelay = setTimeout(() => {
        void ready
          .then((c) => c.run(current.text, current.cellStarts))
          .then((result) => {
            if (result && run === checkRun && !disposed) setCheck({ status: "done", result });
          })
          .catch((err: unknown) => {
            if (run === checkRun && !disposed) setCheck({ status: "unavailable", message: err instanceof Error ? err.message : String(err) });
          });
      }, CHECK_DELAY_MS);
    }),
  );
  onCleanup(() => clearTimeout(checkDelay));

  // --- Component -------------------------------------------------------------
  const look: NotebookLook = {
    theme: { ...currentTheme } as unknown as Record<string, unknown>,
    defaultTheme: defaultTheme as unknown as Record<string, unknown>,
    codeVisibility: { ...getVisibilitySettings() },
    defaultCodeVisibility: { ...DEFAULT_CODE_VISIBILITY },
  };
  const customTheme = Object.keys(themeDifferences(look)).length > 0;
  const customView = Object.keys(viewDifferences(look)).length > 0;
  const config = createMemo(() => componentConfig(look, component()));
  const configText = () => `${JSON.stringify(config(), null, 2)}\n`;
  const snippet = () => componentSnippet(component().framework, config(), codeCells.slice(0, 2).map((cell) => cell.source), `${baseName()}.json`);

  // --- Preview -----------------------------------------------------------------
  // The web app has no text to show: its settings describe the page.
  const hasPreview = () => format() !== "webapp";
  const shownTab = (): PanelTab => (hasPreview() ? tab() : "settings");
  const previewText = createMemo((): string => {
    const f = format();
    if (f === "component") return componentTab() === "usage" ? snippet() : configText();
    const files = textExport()?.files ?? [];
    return (f === "pair" && pairTab() === "md" ? files[1] : files[0])?.text ?? "";
  });

  const extensionLabel = () => {
    const f = format();
    if (f === "webapp") return webapp().layout === "folder" && !(webapp().mode === "readonly" && webapp().staticHtml) ? "/" : ".html";
    return info().extension;
  };

  // --- Export ----------------------------------------------------------------
  const progressText = (p: WebAppProgress): string => {
    switch (p.stage) {
      case "runtime":
        return "Preparing the page…";
      case "python":
        return p.download.total > 0 ? `Downloading Python (${p.download.done} of ${p.download.total} files)…` : "Downloading Python…";
      case "assemble":
        return "Building the page…";
      case "render":
        return "Rendering the static page…";
    }
  };

  // A web app can take a while to build (Python downloads, a static page
  // renders). Until its files are written it can be cancelled, and closing
  // the dialog cancels it.
  const [building, setBuilding] = createSignal<AbortController | null>(null);
  onCleanup(() => building()?.abort());

  const runExport = async () => {
    if (busy() || orderPending()) return;
    setError(null);
    setProgress(null);
    const f = format();
    const base = baseName();
    let controller: AbortController | undefined;
    try {
      let target: SaveTarget | null;
      let build: (signal: AbortSignal) => Promise<Map<string, string>>;
      if (isText(f)) {
        const out = textExport()!;
        const files = new Map(out.files.map((file) => [file.name, file.text]));
        target = out.files.length === 1
          ? await chooseFile(out.files[0].name, FILE_KINDS[f === "pair" ? "python" : f])
          : await chooseFolder(out.files.map((file) => file.name), `${base}.zip`);
        build = async () => files;
      } else if (f === "webapp") {
        const options = webapp();
        const folder = options.layout === "folder" && !(options.mode === "readonly" && options.staticHtml);
        target = folder
          ? await chooseExportFolder(base, EARLIER_WEB_APP_FOLDER)
          : await chooseFile(`${base}.html`, FILE_KINDS.html);
        build = async (signal) => (await buildWebApp(doc, options, { onProgress: (p) => setProgress(progressText(p)), signal })).files;
      } else {
        target = await chooseFile(`${base}.json`, FILE_KINDS.json);
        build = async () => new Map([[`${base}.json`, configText()]]);
      }
      if (!target) return; // picker cancelled
      controller = new AbortController();
      setBusy(true);
      setBuilding(controller);
      const files = await build(controller.signal);
      // Writing is quick, and stopping it halfway would leave half an export.
      setBuilding(null);
      setProgress("Saving…");
      await target.write(files);
      // Closed while saving (and maybe opened again): not this dialog's to close.
      if (!disposed) props.onClose();
    } catch (err) {
      if (!controller?.signal.aborted) {
        console.error("Export failed:", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBuilding(null);
      setBusy(false);
      setProgress(controller?.signal.aborted ? "Export cancelled." : null);
    }
  };

  // Modal: a <dialog> opened with showModal(), so the browser makes the rest
  // of the page inert (no clicks, focus or screen reader access behind it).
  // Escape closes it from anywhere (cancelling an export being built), Tab
  // and Shift+Tab go round its controls, focus moves in on open and back on
  // close, and no key reaches the notebook's shortcuts while it is open.
  let dialog!: HTMLDialogElement;
  let box!: HTMLDivElement;
  let closing = false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
      return;
    }
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const items = tabbables(box);
      if (items.length > 0) {
        const edge = e.shiftKey ? items[0] : items[items.length - 1];
        const other = e.shiftKey ? items[items.length - 1] : items[0];
        if (!box.contains(document.activeElement) || document.activeElement === edge) {
          e.preventDefault();
          other.focus();
        } else {
          // The browser moves focus itself. One that skips some controls
          // (Safari, by default, tabs to text fields only) can take it out
          // of the dialog from another one: it goes round from there too.
          setTimeout(() => {
            if (!closing && !box.contains(document.activeElement)) other.focus();
          });
        }
      }
    }
    // Keys typed inside stop at the dialog (see its onKeyDown); others, sent
    // to the page itself (focus on nothing), stop here.
    if (!box.contains(e.target as Node)) e.stopPropagation();
  };
  window.addEventListener("keydown", onKeyDown, true);
  const previousFocus = document.activeElement as HTMLElement | null;
  let formatList: HTMLDivElement | undefined;
  onMount(() => {
    dialog.showModal();
    formatList?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  });
  onCleanup(() => {
    window.removeEventListener("keydown", onKeyDown, true);
    // Leave the top layer first: the page behind is inert until then, and an
    // inert element cannot take focus.
    closing = true;
    if (dialog.open) dialog.close();
    if (previousFocus?.isConnected) previousFocus.focus();
  });
  // A click on the backdrop closes the dialog, unless an export is running or
  // the press began inside it (a text selection dragged out of a field).
  let pressedBackdrop = false;

  // Arrow keys move through the format list (a radio group).
  const onFormatKey = (e: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    const i = FORMATS.findIndex((x) => x.id === format());
    const next = FORMATS[(i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : FORMATS.length - 1)) % FORMATS.length];
    setFormat(next.id);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-format="${next.id}"]`)?.focus();
  };

  return (
    // The <dialog> covers the viewport as the backdrop; the box inside it is
    // what the user sees as the dialog. It takes focus only when a click
    // lands on nothing focusable, and shows no focus ring then.
    <dialog
      ref={dialog}
      aria-labelledby="export-dialog-title"
      class="fixed inset-0 w-full h-full max-w-none max-h-none m-0 p-4 open:flex items-center justify-center bg-background/80 backdrop-blur-sm text-inherit outline-none backdrop:bg-transparent"
      onMouseDown={(e) => (pressedBackdrop = e.target === e.currentTarget)}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop && !busy()) props.onClose();
      }}
      // Closed by the browser itself (a close request such as Android's back
      // gesture): close it here too.
      on:close={() => {
        if (!closing) props.onClose();
      }}
    >
      <div
        ref={box}
        data-testid={TESTID.exportDialog}
        class="bg-background ui-border ui-font rounded-sm shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          pressedBackdrop = false;
          e.stopPropagation();
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="flex items-center justify-between p-4 [border-bottom-width:var(--ui-divider-width,1px)] ui-divider shrink-0">
          <h2 id="export-dialog-title" class="text-lg font-bold flex items-center gap-2">
            <Download size={20} /> Export
          </h2>
          <button onClick={() => props.onClose()} class="p-1 hover:bg-foreground rounded-sm" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Content: the formats as tabs down the side and the chosen format's
            panel next to them (the tabs set the height, the panel scrolls);
            one scrolling column on narrow screens. */}
        <div class="flex flex-col lg:flex-row flex-1 min-h-0 max-lg:overflow-y-auto lg:overflow-hidden">
          {/* Formats */}
          <div class="lg:w-60 shrink-0 max-lg:p-3 lg:py-2 lg:overflow-y-auto bg-foreground/25 [border-bottom-width:var(--ui-divider-width,1px)] lg:[border-bottom-width:0px] lg:[border-right-width:var(--ui-divider-width,1px)] ui-divider">
            <div role="radiogroup" aria-label="Format" class="grid grid-cols-2 gap-1.5 lg:grid-cols-1 lg:gap-0" onKeyDown={onFormatKey} ref={formatList}>
              <For each={FORMATS}>
                {(f) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={format() === f.id}
                    tabIndex={format() === f.id ? 0 : -1}
                    data-format={f.id}
                    onClick={() => setFormat(f.id)}
                    class={clsx(
                      // A tab: the chosen one takes the panel's background and, on wide
                      // screens, covers the divider so it joins the panel.
                      "relative w-full flex items-center gap-2.5 px-3 lg:gap-3 lg:px-4 py-2.5 text-left transition-colors cursor-pointer focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-accent max-lg:rounded-sm",
                      "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
                      format() === f.id
                        ? "bg-background before:bg-accent lg:-mr-px lg:z-10 max-lg:ui-border"
                        : "hover:bg-foreground/40",
                    )}
                  >
                    <f.icon size={18} class={clsx("shrink-0", format() === f.id ? "text-accent" : "text-secondary/55")} />
                    <span class="min-w-0">
                      <span class={clsx("block text-base leading-snug", format() === f.id ? "text-secondary font-bold" : "text-secondary/85 font-semibold")}>{f.label}</span>
                      <span class="block text-xs font-mono text-secondary/50 leading-snug lg:truncate">{f.detail}</span>
                    </span>
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* The format: its settings, or what it will write. On wide screens it
              takes the tabs' height and scrolls within it. */}
          <div class="flex-1 min-w-0 flex flex-col lg:relative">
            <div class="flex flex-col lg:absolute lg:inset-0">
              <div class="p-4 pb-3 shrink-0 [border-bottom-width:var(--ui-divider-width,1px)] ui-divider">
                <div class="flex items-center justify-between gap-3 min-h-7">
                  <h3 class="flex items-baseline gap-2 flex-wrap min-w-0" data-testid={TESTID.exportFormatTitle}>
                    <span class="text-base font-bold text-secondary">{info().label}</span>
                    <span class="text-xs font-mono text-secondary/45 whitespace-nowrap">{info().extension}</span>
                  </h3>
                  <Show when={hasPreview()}>
                    <div class="shrink-0">
                      <Tabs
                        label="Format details"
                        value={shownTab()}
                        options={[{ value: "settings", label: "Settings" }, { value: "preview", label: "Preview" }]}
                        onChange={setTab}
                      />
                    </div>
                  </Show>
                </div>
                <p class="text-xs text-secondary/60 mt-1.5 leading-relaxed">{info().summary}</p>
              </div>

              <div class="flex-1 lg:min-h-0 p-4 flex flex-col lg:overflow-y-auto" role="tabpanel" aria-label={shownTab() === "settings" ? "Settings" : "Preview"}>
                <Switch>
                  <Match when={shownTab() === "settings"}>
                    <div data-testid={TESTID.exportSettings}>
                      <Switch>
                        <Match when={isText(format()) && (format() as TextFormat)}>
                          {(f) => <TextSettings format={f()} options={text()} onChange={setText} />}
                        </Match>
                        <Match when={format() === "webapp"}>
                          <WebAppSettings options={webapp()} onChange={setWebapp} />
                        </Match>
                        <Match when={format() === "component"}>
                          <ComponentSettings
                            options={component()}
                            onChange={setComponent}
                            customTheme={customTheme}
                            customView={customView}
                            fileName={`${baseName()}.json`}
                            showPreview={() => setTab("preview")}
                          />
                        </Match>
                      </Switch>
                      <Show when={needsScript()}>
                        <ScriptCheck check={check()} script={textExport()?.script} codeCellCount={codeCells.length} cellNumber={cellNumber} />
                      </Show>
                    </div>
                  </Match>
                  <Match when={shownTab() === "preview"}>
                    <PreviewPane
                      text={previewText()}
                      head={
                        <Switch>
                          <Match when={format() === "pair"}>
                            <Tabs
                              label="File"
                              mono
                              value={pairTab()}
                              options={[{ value: "py", label: `${baseName()}.py` }, { value: "md", label: `${baseName()}.md` }]}
                              onChange={setPairTab}
                            />
                          </Match>
                          <Match when={format() === "component"}>
                            <div class="flex items-center gap-2 ui-border rounded-sm bg-background px-3 py-2">
                              <span class="text-xs text-secondary/60 shrink-0">Set up a project:</span>
                              <code class="font-mono text-xs text-secondary flex-1 truncate" data-testid={TESTID.exportSetupCommand}>{SETUP_COMMAND}</code>
                              <button
                                type="button"
                                class="p-1 text-secondary/50 hover:text-accent rounded-sm"
                                title="Copy command"
                                aria-label="Copy command"
                                onClick={() => void copyText(SETUP_COMMAND)}
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                            <Tabs
                              label="Show"
                              mono
                              value={componentTab()}
                              options={[{ value: "usage", label: "Usage" }, { value: "config", label: `${baseName()}.json` }]}
                              onChange={setComponentTab}
                            />
                          </Match>
                        </Switch>
                      }
                    />
                  </Match>
                </Switch>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: the file name, stretching up to the buttons, and Export.
            Progress and errors show above them, so they never squeeze the name. */}
        <div class="p-4 [border-top-width:var(--ui-divider-width,1px)] ui-divider shrink-0 space-y-2">
          <Show when={progress() || error()}>
            <p class={clsx("text-xs", error() ? "text-error" : "text-secondary/70")} role={error() ? "alert" : "status"} data-testid={TESTID.exportStatus}>
              {error() ?? progress()}
            </p>
          </Show>
          <div class="flex flex-col sm:flex-row sm:items-center gap-3">
            <label class="flex items-center min-w-0 flex-1">
              <span class="sr-only">File name</span>
              <input
                type="text"
                value={format() === "component" ? configName() : name()}
                onInput={(e) => setBaseName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runExport();
                }}
                spellcheck={false}
                aria-label="File name"
                data-testid={TESTID.exportFilename}
                class="flex-1 min-w-0 h-9 px-2 text-sm bg-background ui-border rounded-l-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
              />
              <span class="h-9 px-2 flex items-center text-sm font-mono text-secondary/60 ui-border border-l-0 rounded-r-sm bg-foreground/20 whitespace-nowrap" data-testid={TESTID.exportExtension}>
                {extensionLabel()}
              </span>
            </label>
            <div class="flex items-center justify-end gap-3 shrink-0">
              <Show when={building()}>
                {(controller) => (
                  <button
                    onClick={() => controller().abort()}
                    data-testid={TESTID.exportCancel}
                    class="h-9 px-3 text-sm ui-border rounded-sm text-secondary hover:bg-foreground/50 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </Show>
              <button
                onClick={() => void runExport()}
                disabled={busy() || orderPending()}
                title={orderPending() ? "Ordering the cells for the script…" : undefined}
                data-testid={TESTID.exportButton}
                class="h-9 px-4 text-sm bg-accent text-background font-bold rounded-sm hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                <Show when={busy()}>
                  <LoaderCircle size={14} class="animate-spin" />
                </Show>
                Export
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
};

export default ExportDialog;
