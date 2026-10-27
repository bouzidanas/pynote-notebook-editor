import { type Component, type JSX, Show, createSignal } from "solid-js";
import { Check, Copy } from "lucide-solid";
import { type ComponentOptions, type ExecutionMode, DEFAULT_PYODIDE_FOLDER, FRAMEWORKS, SETUP_COMMAND } from "../../lib/export/component-export";
import { PYODIDE_VERSION } from "../../lib/pyodide-config";
import { TESTID } from "../../lib/testids";
import { CheckRow, SectionTitle, Segmented, TextField } from "./controls";
import { copyText } from "./PreviewPane";

// Settings of the component export: how the export is used in a website,
// then everything pynote.config.json holds, as controls, plus the framework
// the usage example is written for.

const MODES: ReadonlyArray<{ value: ExecutionMode; label: string; hint: string }> = [
  { value: "queue_all", label: "Sequential", hint: "Cells run one at a time, in the order they were started." },
  { value: "hybrid", label: "Hybrid", hint: "A cell waits only while the cell above it is running or waiting; other cells run side by side." },
  { value: "direct", label: "Concurrent", hint: "Cells start right away, without waiting for each other." },
  { value: "reactive", label: "Reactive", hint: "Running a cell also reruns the cells that use the names it defines." },
];

const Step: Component<{ n: number; children: JSX.Element }> = (props) => (
  <li class="flex gap-2.5">
    <span class="shrink-0 w-5 h-5 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center mt-px">{props.n}</span>
    <div class="flex-1 min-w-0 text-sm text-secondary leading-relaxed">{props.children}</div>
  </li>
);

const ComponentSettings: Component<{
  options: ComponentOptions;
  onChange: (next: ComponentOptions) => void;
  /** The notebook's theme and view settings differ from PyNote's defaults. */
  customTheme: boolean;
  customView: boolean;
  /** The name the config is saved under (the footer's file name). */
  fileName: string;
  showPreview: () => void;
}> = (props) => {
  const set = (patch: Partial<ComponentOptions>) => props.onChange({ ...props.options, ...patch });
  const frameworkLabel = () => FRAMEWORKS.find((f) => f.id === props.options.framework)?.label ?? "";
  const [copied, setCopied] = createSignal(false);
  const copyCommand = async () => {
    if (!(await copyText(SETUP_COMMAND))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div class="space-y-1">
      <SectionTitle class="px-2">Set up</SectionTitle>
      <ol class="space-y-3 px-2 pb-2" data-testid={TESTID.exportSetupSteps}>
        <Step n={1}>
          In your website's folder, run
          <span class="mt-1 flex items-center gap-2 ui-border rounded-sm bg-background px-2.5 py-1.5">
            <code class="font-mono text-xs text-secondary flex-1 truncate">{SETUP_COMMAND}</code>
            <button
              type="button"
              class="p-1 text-secondary/50 hover:text-accent rounded-sm"
              title={copied() ? "Copied" : "Copy command"}
              aria-label="Copy command"
              onClick={() => void copyCommand()}
            >
              <Show when={copied()} fallback={<Copy size={14} />}>
                <Check size={14} />
              </Show>
            </button>
          </span>
          <span class="block text-xs text-secondary/50 mt-1">It installs the pynote package with what it needs for your framework.</span>
        </Step>
        <Step n={2}>
          Export, and put <span class="font-mono text-xs">{props.fileName}</span> in the project's root folder.
          <span class="block text-xs text-secondary/50 mt-1">It holds this notebook's look and settings, chosen below. It holds no code.</span>
        </Step>
        <Step n={3}>
          Load it once per page or layout, and place a cell wherever you want one.{" "}
          <button type="button" class="text-accent hover:underline" onClick={() => props.showPreview()}>
            Preview
          </button>{" "}
          shows the code for {frameworkLabel()}.
        </Step>
      </ol>

      <Segmented
        label="Framework"
        value={props.options.framework}
        options={FRAMEWORKS.map((f) => ({ value: f.id, label: f.label }))}
        onChange={(framework) => set({ framework })}
        hint={`The usage code in Preview is written for ${frameworkLabel()}.`}
      />

      <SectionTitle class="mt-5 px-2">Cells</SectionTitle>
      <CheckRow
        label="Editable code"
        hint="Off: readers see the code read-only; cells still run."
        checked={props.options.editable}
        onChange={(v) => set({ editable: v })}
      />
      <CheckRow
        label="Cell menu"
        hint="A menu on each cell to run, restart or stop Python and change the view."
        checked={props.options.menu}
        onChange={(v) => set({ menu: v })}
      />
      <CheckRow
        label="Run on page load"
        hint="Cells run when the page opens, in page order. Python then downloads on every visit, not only when a reader runs a cell."
        checked={props.options.autorun}
        onChange={(v) => set({ autorun: v })}
      />

      <SectionTitle class="mt-5 px-2">Notebook</SectionTitle>
      <Segmented
        label="Execution mode"
        value={props.options.executionMode}
        options={MODES}
        onChange={(executionMode) => set({ executionMode })}
        hint={MODES.find((m) => m.value === props.options.executionMode)?.hint}
      />
      <CheckRow
        label="Lock execution mode"
        hint="Readers cannot change it from the cell menu."
        checked={props.options.lockExecutionMode}
        onChange={(v) => set({ lockExecutionMode: v })}
      />
      <Segmented
        label="Theme"
        value={props.options.theme}
        options={[{ value: "notebook", label: "This notebook's" }, { value: "default", label: "PyNote's default" }]}
        onChange={(theme) => set({ theme })}
        hint={
          props.options.theme === "default"
            ? "PyNote's default colors, fonts and spacing."
            : props.customTheme
              ? "The colors, fonts and spacing set in this notebook's theme."
              : "This notebook uses PyNote's default theme."
        }
      />
      <Segmented
        label="View"
        value={props.options.view}
        options={[{ value: "notebook", label: "This notebook's" }, { value: "default", label: "PyNote's default" }]}
        onChange={(view) => set({ view })}
        hint={
          props.options.view === "default"
            ? "Code and every output show; line numbers are off."
            : props.customView
              ? "Which parts of a cell show (code, outputs, line numbers and so on), as set in Code Visibility."
              : "This notebook uses PyNote's default view."
        }
      />

      <SectionTitle class="mt-5 px-2">Python</SectionTitle>
      <Segmented
        label="Load Pyodide from"
        value={props.options.python}
        options={[{ value: "cdn", label: "jsDelivr" }, { value: "site", label: "Your site" }]}
        onChange={(python) => set({ python })}
        hint={
          props.options.python === "cdn"
            ? "About 10 MB the first time a cell runs, then cached by the browser."
            : "For sites without access to a CDN, such as an intranet."
        }
      />
      <Show when={props.options.python === "site"}>
        <TextField
          label="Folder URL"
          value={props.options.pyodideUrl}
          placeholder={DEFAULT_PYODIDE_FOLDER}
          onInput={(pyodideUrl) => set({ pyodideUrl })}
          hint={
            // The full release, not the npm package: that one has only the core
            // files, without micropip (which Python loads when it starts) or the
            // packages cells import.
            <>
              Put the files of Pyodide's full release (<span class="font-mono">pyodide-{PYODIDE_VERSION}.tar.bz2</span>, from{" "}
              <a
                href={`https://github.com/pyodide/pyodide/releases/tag/${PYODIDE_VERSION}`}
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent hover:underline"
              >
                Pyodide's releases
              </a>
              ) in this folder of your site.
            </>
          }
        />
      </Show>
    </div>
  );
};

export default ComponentSettings;
