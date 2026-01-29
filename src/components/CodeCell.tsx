import { type Component, createSignal, Show, createMemo } from "solid-js";
import { type CellData, actions } from "../lib/store";
import { kernel } from "../lib/pyodide";
import { currentTheme } from "../lib/theme";
import CodeEditor from "./CodeEditor";
import { OutputResult, OutputStdoutUI, OutputStderr, OutputError } from "./Output";
import CellWrapper from "./CellWrapper";
import { Play, Square, Trash2, Timer } from "lucide-solid";
import clsx from "clsx";
import { 
  getEffectiveVisibility, 
  hasHiddenElements, 
  isCellShowingAll, 
  toggleCellShowAll 
} from "../lib/codeVisibility";

interface CodeCellProps {
  cell: CellData;
  isActive: boolean;
  index: number;
  prevCellId: string | null;
}

const CodeCell: Component<CodeCellProps> = (props) => {
  // Local running state replaced by store state
  // const [running, setRunning] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);

  // Get effective visibility for this cell (considers per-cell override AND cell metadata)
  const visibility = () => getEffectiveVisibility(
    props.cell.id, 
    props.cell.metadata?.pynote?.codeview
  );
  const isShowingAll = () => isCellShowingAll(props.cell.id);

  // Check if cell has any actual output content (regardless of visibility settings)
  const hasAnyOutput = createMemo(() => {
    const o = props.cell.outputs;
    if (!o) return false;
    return (o.stdout && o.stdout.length > 0) ||
           (o.stderr && o.stderr.length > 0) ||
           o.result ||
           o.error;
  });

  // Show "code hidden" message only when code is hidden AND cell has no output at all
  // This prevents confusion when the cell appears completely empty
  const showHiddenMessage = createMemo(() => {
    const v = visibility();
    return !v.showCode && !hasAnyOutput();
  });

  // We rely on the parent (Notebook) or store logic to handle the run
  // But CodeCell needs to invoke the store action directly now to participate in queue
  // Actually, handleRun logic was moved to store actions.executeCell, but we need to call runCell wrapper.
  // The Notebook passes "runCell" logic implicitly? No, we need to import actions or use props.
  // Ideally CodeCell should just call actions.runCell.
  
  const handleRun = () => {
      if (props.cell.isRunning) {
          // Stop execution
          // Since we can't easily interrupt, we restart the kernel
          kernel.restart();
          actions.resetExecutionState();
          return;
      }
      
      actions.runCell(props.cell.id, async (content, id) => {
        await kernel.run(content, (result) => {
            actions.updateCellOutput(id, result);
        });
      });
  };

  const toolbar = (
    <div class="flex lg:hidden items-center gap-1 p-1">
      <button 
        onClick={handleRun}
        disabled={props.cell.isQueued}
        class={clsx(
          "p-1.5 hover:bg-foreground rounded-sm disabled:opacity-50",
          props.cell.outputs?.error ? "text-primary" : (props.isActive || props.cell.isEditing) ? "text-accent" : "text-accent"
        )}
        title={props.cell.isRunning ? "Stop Cell (Restart Kernel)" : "Run Cell (Ctrl+Enter)"}
      >
        <Show when={!props.cell.isRunning} fallback={<Square size={16} class="animate-pulse text-primary" />}>
          <Show when={props.cell.isQueued} fallback={<Play size={16} />}>
             <Timer size={16} class="text-accent/70 animate-pulse" />
          </Show>
        </Show>
      </button>
      <div class="h-4 w-px bg-foreground mx-1" />
      <span class="text-xs text-secondary/70 font-mono px-2">Python</span>
      <div class="h-4 w-px bg-foreground mx-1" />
      <button 
        onClick={(e) => { e.stopPropagation(); actions.deleteCell(props.cell.id); }}
        class="p-1.5 hover:bg-foreground rounded-sm text-primary"
        title="Delete Cell"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <CellWrapper
      id={props.cell.id}
      isActive={props.isActive}
      isEditing={props.cell.isEditing}
      onActivate={() => actions.setActiveCell(props.cell.id)}
      onDelete={() => actions.deleteCell(props.cell.id)}
      onMoveUp={() => actions.moveCell(props.index, props.index - 1)}
      onMoveDown={() => actions.moveCell(props.index, props.index + 1)}
      toolbar={toolbar}
      type="code"
      onActionClick={handleRun}
      actionRunning={props.cell.isRunning}
      isQueued={props.cell.isQueued}
      hasError={!!props.cell.outputs?.error}
      prevCellId={props.prevCellId}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Pass visibility toggle info for sidebar button
      hasHiddenElements={hasHiddenElements()}
      isShowingAll={isShowingAll()}
      onToggleVisibility={() => toggleCellShowAll(props.cell.id)}
    >
      <div class="flex flex-col p-2.25 py-2.75">
        {/* Hidden code message */}
        <Show when={showHiddenMessage()}>
          <div class="text-secondary/40 italic text-sm py-4 px-3 text-center">
            Code is hidden — cell will still execute
          </div>
        </Show>

        {/* Output Logs (Stdout/UI) Above */}
        <Show when={visibility().showStdout && currentTheme.outputLayout === "above" && props.cell.outputs}>
           <OutputStdoutUI outputs={props.cell.outputs} />
        </Show>

        {/* Code Editor - use CSS to hide instead of unmounting to preserve editor state */}
        <div class={clsx(
          "flex relative pl-1.75 z-10 p-2",
          !visibility().showCode && "hidden"
        )}>
           {/* Line numbers gutter could go here */}
           <div class={clsx(
             "w-10 bg-background border-r border-foreground flex flex-col items-center pt-5.5 pr-1.5 text-xs select-none font-mono",
             props.cell.outputs?.executionKernelId === kernel.id ? "text-secondary/50 font-bold" : "text-foreground"
           )}>
              [{props.index + 1}]:
           </div>
           <div class="flex-1 bg-accent/2 relative">
             <CodeEditor
               value={props.cell.content}
               onChange={(val) => actions.updateCell(props.cell.id, val)}
               language="python"
               readOnly={!props.cell.isEditing}
               cell={props.cell}
             />
             <Show when={!props.cell.isEditing}>
               <div 
                 class="absolute inset-0 z-10 cursor-text"
                 onClick={(e) => {
                   if (props.isActive) {
                     e.stopPropagation();
                     actions.setEditing(props.cell.id, true);
                   }
                 }}
               />
             </Show>
           </div>
        </div>

        {/* Timeline Connector - show based on status dot visibility setting */}
        <Show when={visibility().showStatusDot && props.cell.outputs}>
           <div class="flex pl-1.5 relative z-0 h-5 -my-1.5">
              <div class="w-10 relative flex items-center justify-center">
                  <div class={clsx(
                      "absolute -right-1.25 rounded-full transition-all duration-300",
                      // Size logic
                      (props.isActive || props.cell.isEditing) ? "w-2.5 h-2.5" : "w-2.5 h-2.5 group-hover:scale-125",
                      // Color logic
                      (() => {
                          const o = props.cell.outputs;
                          // Active/Hover/Edit state
                          if (props.isActive || props.cell.isEditing || hovered()) {
                              if (!o) return "bg-gray-500";
                              if (o.executionKernelId && o.executionKernelId !== kernel.id) return "bg-gray-500";
                              if (o.error) return "bg-red-500";
                              return "bg-green-500";
                          }
                          // Dimmed state - solid color to match border but opaque
                          // Using a solid gray that approximates the border color
                          return "bg-zinc-700"; 
                      })()
                  )}></div>
              </div>
              <div class={clsx(
                  "flex-1 flex items-center pl-4 gap-3 transition-opacity duration-200",
                  (props.isActive || props.cell.isEditing || hovered()) ? "opacity-100" : "opacity-0"
              )}>
                  <span class="text-[10px] uppercase font-bold tracking-wider text-secondary/40 select-none">
                      {(() => {
                          const o = props.cell.outputs;
                          if (!o || !o.executionTime) return "";
                          const date = new Date(o.executionTime);
                          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      })()}
                  </span>
                  <Show when={props.cell.outputs?.executionDuration}>
                      <span class="text-[10px] text-secondary/30 select-none font-mono">
                          {props.cell.outputs?.executionDuration}ms
                      </span>
                  </Show>
                  <Show when={props.cell.outputs?.error}>
                      <span class="text-[10px] font-bold text-red-500/70 select-none flex items-center gap-1">
                          ! Error
                      </span>
                  </Show>
                  <Show when={props.cell.outputs?.executionKernelId && props.cell.outputs.executionKernelId !== kernel.id}>
                      <span class="text-[10px] italic text-secondary/30 select-none">
                          (previous session)
                      </span>
                  </Show>
              </div>
           </div>
        </Show>

        {/* Stderr (Always Below Editor) */}
        <Show when={visibility().showStderr && props.cell.outputs}>
          <OutputStderr outputs={props.cell.outputs} />
        </Show>

        {/* Result (Always Below Stderr) */}
        <Show when={visibility().showResult && props.cell.outputs}>
          <OutputResult outputs={props.cell.outputs} />
        </Show>

        {/* Output Logs (Stdout/UI) Below (if layout is below) */}
        <Show when={visibility().showStdout && currentTheme.outputLayout === "below" && props.cell.outputs}>
          <OutputStdoutUI outputs={props.cell.outputs} />
        </Show>

        {/* Error (Always Bottom Most) */}
        <Show when={visibility().showError && props.cell.outputs}>
          <OutputError outputs={props.cell.outputs} />
        </Show>
      </div>
    </CellWrapper>
  );
};

export default CodeCell;