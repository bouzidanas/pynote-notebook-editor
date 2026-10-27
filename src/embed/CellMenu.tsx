import { type Component, For, Show } from "solid-js";
import { Ellipsis, Eye, EyeOff, Hash, Play, Power, RotateCw, StopCircle, X, FastForward } from "lucide-solid";
import clsx from "clsx";
import Dropdown, { DropdownDivider, DropdownItem } from "../components/ui/Dropdown";
import { kernel } from "../lib/pyodide";
import { actions, notebookStore, type ExecutionMode } from "../lib/store";
import { codeVisibility, getEffectiveVisibility, isCellShowingAll, setCellShowAll, setVisibilitySettings } from "../lib/codeVisibility";
import { changeCellCodeview } from "./codeview";

// The menu on an embedded cell: what PyNote's toolbar menus offer for a
// notebook, scoped to cells on a web page. Execution mode and Python apply to
// every cell on the page (they are one notebook); the view items to this cell
// except line numbers, which follow PyNote's notebook-wide setting. Changing
// line numbers is not a change of the whole view: every cell keeps the view
// options the page gave it.

const MODES: ReadonlyArray<[ExecutionMode, string]> = [
  ["queue_all", "Sequential"],
  ["hybrid", "Hybrid"],
  ["direct", "Concurrent"],
  ["reactive", "Reactive"],
];

export const pythonStatus = (): { text: string; tone: "idle" | "busy" | "ready" | "error" } => {
  if (!kernel.started) return { text: "Python starts when a cell runs", tone: "idle" };
  switch (kernel.status) {
    case "loading":
      return { text: "Starting Python…", tone: "busy" };
    case "ready":
      return { text: "Python is ready", tone: "ready" };
    case "running":
      return { text: "Python is running", tone: "busy" };
    case "stopped":
      return { text: "Python is shut down", tone: "idle" };
    default:
      return { text: "Python could not start", tone: "error" };
  }
};

interface CellMenuProps {
  cellId: string;
  run: () => void;
  runAll: () => void;
  startPython: () => void;
  lockExecutionMode: () => boolean;
}

const CellMenu: Component<CellMenuProps> = (props) => {
  const status = pythonStatus;
  const live = () => kernel.started && kernel.status !== "stopped" && kernel.status !== "error";
  const cell = () => notebookStore.cells.find((c) => c.id === props.cellId);
  const showsCode = () => getEffectiveVisibility(props.cellId, cell()?.metadata?.pynote?.codeview).showCode;
  // The reader's choice for this cell's code. While the eye shows everything
  // the cell hides, Hide Code ends that (as changing view settings does in
  // PyNote), so the code hides at once.
  const toggleCode = () => {
    const showCode = !showsCode();
    if (isCellShowingAll(props.cellId)) setCellShowAll(props.cellId, false);
    changeCellCodeview(props.cellId, { showCode });
  };

  return (
    <Dropdown
      align="right"
      compact
      trigger={
        <button type="button" class="p-1.5 rounded-sm text-secondary/60 hover:text-accent" aria-label="Cell menu" title="Cell menu">
          <Ellipsis size={16} />
        </button>
      }
    >
      <div class="px-4 py-2 text-xs text-secondary/70 flex items-center gap-2" role="status" data-testid="pynote-python-status">
        <span
          class={clsx(
            "w-2 h-2 rounded-full shrink-0",
            status().tone === "ready" ? "bg-success" : status().tone === "busy" ? "bg-warning" : status().tone === "error" ? "bg-error" : "bg-foreground",
          )}
        />
        {status().text}
      </div>
      <DropdownItem onClick={props.run} shortcut="Ctrl+Enter">
        <div class="flex items-center gap-2"><Play size={16} /> Run Cell</div>
      </DropdownItem>
      <DropdownItem onClick={props.runAll}>
        <div class="flex items-center gap-2"><FastForward size={16} /> Run All Cells</div>
      </DropdownItem>
      <DropdownItem onClick={() => actions.clearCellOutput(props.cellId)} disabled={!cell()?.outputs}>
        <div class="flex items-center gap-2"><X size={16} /> Clear Output</div>
      </DropdownItem>

      <Show when={!props.lockExecutionMode()}>
        <DropdownDivider />
        <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Execution</div>
        <For each={MODES}>
          {([mode, label]) => (
            <DropdownItem onClick={() => actions.setExecutionMode(mode)}>
              <div class="flex items-center gap-2" role="menuitemradio" aria-checked={notebookStore.executionMode === mode}>
                <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === mode ? "bg-accent" : ""}`} />
                {label}
              </div>
            </DropdownItem>
          )}
        </For>
      </Show>

      <DropdownDivider />
      <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">View</div>
      <DropdownItem onClick={toggleCode}>
        <div class="flex items-center gap-2">
          <Show when={showsCode()} fallback={<Eye size={16} />}><EyeOff size={16} /></Show>
          {showsCode() ? "Hide Code" : "Show Code"}
        </div>
      </DropdownItem>
      <DropdownItem onClick={() => setVisibilitySettings({ showLineNumbers: !codeVisibility.showLineNumbers })}>
        <div class="flex items-center gap-2"><Hash size={16} /> {codeVisibility.showLineNumbers ? "Hide Line Numbers" : "Show Line Numbers"}</div>
      </DropdownItem>

      <DropdownDivider />
      <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Python</div>
      <Show
        when={live()}
        fallback={
          <DropdownItem onClick={props.startPython} disabled={kernel.status === "loading" && kernel.started}>
            <div class="flex items-center gap-2 text-accent"><Power size={16} /> Start</div>
          </DropdownItem>
        }
      >
        <DropdownItem onClick={() => { kernel.restart(); actions.resetExecutionState(); }}>
          <div class="flex items-center gap-2 text-accent"><RotateCw size={16} /> Restart</div>
        </DropdownItem>
        <DropdownItem onClick={() => { kernel.terminate(); actions.resetExecutionState(); }}>
          <div class="flex items-center gap-2 text-primary"><StopCircle size={16} /> Shut Down</div>
        </DropdownItem>
      </Show>
    </Dropdown>
  );
};

export default CellMenu;
