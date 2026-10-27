import { type Component, Show, createEffect, createMemo, untrack } from "solid-js";
import { Eye, EyeOff, Play, Square, Timer } from "lucide-solid";
import clsx from "clsx";
import CodeCell from "../components/CodeCell";
import { actions, notebookStore } from "../lib/store";
import { getEffectiveVisibility, hidesAnyPart, isCellShowingAll, setCellShowAll, toggleCellShowAll } from "../lib/codeVisibility";
import { kernel } from "../lib/pyodide";
import CellMenu from "./CellMenu";

// A cell embedded in a web page: PyNote's own code cell (same editor, outputs
// and look), with a small toolbar inside its box in place of the notebook's
// sidebar, and the run shortcuts the notebook handles globally in the app.
//
// The toolbar shows on hover or focus, and stays while its menu is open (the
// pointer may leave the cell, and Safari does not focus a clicked button).
// The menu and the editor's tooltips (completions, help) can reach over the
// cells below, which come later in the page's stacking context (shadow roots
// do not separate stacking). While one is open the cell is drawn above them
// and their toolbars (z-20), so it is what shows and what a click there reaches.
// Two has-[...] utilities, not one with both selectors: Firefox did not restyle
// the cell for `:has(:is(...))` when its menu opened.

export interface EmbeddedCellProps {
  id: string;
  editable: () => boolean;
  menu: () => boolean;
  /** The eye button: show all of what the cell hides, and hide it again. */
  visibilityToggle: () => boolean;
  lockExecutionMode: () => boolean;
  run: (id: string) => void;
  runAll: () => void;
  startPython: () => void;
  checkRedefinitions: (id: string) => ((definitions: any[]) => any[]) | undefined;
}

const EmbeddedCell: Component<EmbeddedCellProps> = (props) => {
  const cell = createMemo(() => notebookStore.cells.find((c) => c.id === props.id));
  const index = () => notebookStore.cells.findIndex((c) => c.id === props.id);

  const runOrStop = () => {
    const current = cell();
    if (!current) return;
    if (current.isRunning) {
      // Python cannot interrupt a running cell; stopping restarts it (as in PyNote).
      kernel.restart();
      actions.resetExecutionState();
      return;
    }
    props.run(props.id);
  };

  // As in PyNote's cell toolbar: the eye shows while the cell hides something,
  // or shows everything after a click, and switches between the two.
  const showingAll = () => isCellShowingAll(props.id);
  const hidesSomething = () => hidesAnyPart(getEffectiveVisibility(props.id, cell()?.metadata?.pynote?.codeview));
  // Showing everything goes with the eye: when the page turns visibilityToggle
  // off, the cell shows what the page lets it show again.
  createEffect(() => {
    if (!props.visibilityToggle() && untrack(showingAll)) setCellShowAll(props.id, false);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
      e.preventDefault();
      props.run(props.id);
    } else if (e.key === "Escape" && !e.defaultPrevented) {
      // Leave the editor (the editor handles Escape itself while a completion is open).
      (e.target as HTMLElement | null)?.blur?.();
    }
  };

  return (
    <Show when={cell()}>
      {(current) => (
        <div class="pynote-cell group/pynote has-[[role=menu]]:z-30 has-[.cm-tooltip]:z-30" data-pynote-cell={props.id} onKeyDown={onKeyDown}>
          <CodeCell
            cell={current()}
            index={index()}
            prevCellId={null}
            isActive={notebookStore.activeCellId === props.id}
            runCell={props.run}
            checkRedefinitions={props.checkRedefinitions(props.id)}
            editable={props.editable()}
          />
          <div class="absolute top-1.5 right-1.5 z-20 flex items-center gap-0.5 rounded-sm bg-background/85 opacity-0 group-hover/pynote:opacity-100 group-focus-within/pynote:opacity-100 has-[[role=menu]]:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={runOrStop}
              disabled={!!current().isQueued}
              class="p-1.5 rounded-sm text-secondary/60 hover:text-accent disabled:opacity-60"
              title={current().isRunning ? "Stop (restarts Python)" : current().isQueued ? "Queued" : "Run Cell (Ctrl+Enter)"}
              aria-label={current().isRunning ? "Stop" : "Run Cell"}
            >
              <Show when={!current().isRunning} fallback={<Square size={15} class="animate-pulse" />}>
                <Show when={current().isQueued} fallback={<Play size={15} />}>
                  <Timer size={15} class="text-accent/70 animate-pulse" />
                </Show>
              </Show>
            </button>
            <Show when={props.visibilityToggle() && (hidesSomething() || showingAll())}>
              <button
                type="button"
                onClick={() => toggleCellShowAll(props.id)}
                class={clsx("p-1.5 rounded-sm", showingAll() ? "text-accent hover:text-accent/80" : "text-secondary/60 hover:text-accent")}
                title={showingAll() ? "Hide elements (use visibility settings)" : "Show all elements"}
                aria-label="Show all elements"
                aria-pressed={showingAll()}
              >
                <Show when={showingAll()} fallback={<EyeOff size={15} />}>
                  <Eye size={15} />
                </Show>
              </button>
            </Show>
            <Show when={props.menu()}>
              <CellMenu
                cellId={props.id}
                run={() => props.run(props.id)}
                runAll={props.runAll}
                startPython={props.startPython}
                lockExecutionMode={props.lockExecutionMode}
              />
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
};

export default EmbeddedCell;
