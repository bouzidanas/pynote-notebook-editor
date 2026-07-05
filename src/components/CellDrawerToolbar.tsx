import { type Component, Show } from "solid-js";
import clsx from "clsx";
import { type CellData, actions, notebookStore } from "../lib/store";
import { kernel } from "../lib/pyodide";
import { Play, Square, Timer, Edit2, Check, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-solid";

interface CellDrawerToolbarProps {
  cell: CellData;
  runCell: (id: string) => void; // Run cell with proper reactive mode support
}

// Controls shown inside the mobile cell action drawer. Rendered once by Notebook
// (not per-cell) so switching the active cell cross-fades these controls in
// place instead of re-sliding the whole drawer. Branches on cell type for the
// leading action button: Run for code, Edit toggle for markdown.
const CellDrawerToolbar: Component<CellDrawerToolbarProps> = (props) => {
  const index = () => notebookStore.cells.findIndex((c) => c.id === props.cell.id);

  const handleRun = () => {
    if (props.cell.isRunning) {
      // Can't interrupt Pyodide mid-run, so restart the kernel to stop.
      kernel.restart();
      actions.resetExecutionState();
      return;
    }
    props.runCell(props.cell.id);
  };

  const toggleEdit = () => actions.setEditing(props.cell.id, !props.cell.isEditing);

  return (
    <div class="flex items-center justify-between w-full px-4 py-1.5 text-background font-[var(--menu-font-weight,600)]">
      {/* Leading action: Run (code) or Edit toggle (markdown) */}
      <Show
        when={props.cell.type === "code"}
        fallback={
          <button
            onClick={toggleEdit}
            class="p-2 hover:bg-background/10 rounded-sm text-background"
            title={props.cell.isEditing ? "Finish Editing" : "Edit Markdown"}
          >
            <Show when={props.cell.isEditing} fallback={<Edit2 size={18} />}>
              <Check size={18} />
            </Show>
          </button>
        }
      >
        <button
          onClick={handleRun}
          disabled={props.cell.isQueued}
          class="p-2 hover:bg-background/10 rounded-sm disabled:opacity-50 text-background"
          title={props.cell.isRunning ? "Stop Cell (Restart Kernel)" : "Run Cell (Ctrl+Enter)"}
        >
          <Show when={!props.cell.isRunning} fallback={<Square size={18} class="animate-pulse" />}>
            <Show when={props.cell.isQueued} fallback={<Play size={18} />}>
              <Timer size={18} class="animate-pulse" />
            </Show>
          </Show>
        </button>
      </Show>

      {/* Move up / drag handle / move down (mirrors the keyboard move shortcuts) */}
      <div class="flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); if (index() > 0) actions.moveCell(index(), index() - 1); }}
          disabled={index() <= 0}
          class="p-2 hover:bg-background/10 rounded-sm disabled:opacity-40 text-background"
          title="Move Cell Up"
        >
          <ChevronUp size={24} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (notebookStore.movingCellId === props.cell.id) actions.cancelMovingCell();
            else {
              // Deselect first (also clears any stale moving state), THEN pick
              // up the cell. Deselecting closes the drawer and drops the accent
              // selection so the cell reads as a pseudo-disabled "picked up"
              // item until it's dropped, at which point dropMovingCellOn
              // re-selects it. Order matters: setActiveCell(null) clears
              // movingCellId, so it must run before startMovingCell.
              actions.setActiveCell(null);
              actions.startMovingCell(props.cell.id);
            }
          }}
          class={clsx(
            "p-2 rounded-sm text-background transition-colors",
            notebookStore.movingCellId === props.cell.id ? "bg-background/20" : "hover:bg-background/10"
          )}
          title={notebookStore.movingCellId === props.cell.id ? "Cancel move (or tap a cell to drop here)" : "Move cell: tap, then tap the destination cell"}
        >
          <GripVertical size={24} class="rotate-90" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (index() < notebookStore.cells.length - 1) actions.moveCell(index(), index() + 1); }}
          disabled={index() >= notebookStore.cells.length - 1}
          class="p-2 hover:bg-background/10 rounded-sm disabled:opacity-40 text-background"
          title="Move Cell Down"
        >
          <ChevronDown size={24} />
        </button>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); actions.deleteCell(props.cell.id); }}
        class="p-2 hover:bg-background/10 rounded-sm text-background"
        title="Delete Cell"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
};

export default CellDrawerToolbar;
