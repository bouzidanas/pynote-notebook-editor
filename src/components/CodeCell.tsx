import { type Component, createSignal, Show } from "solid-js";
import { type CellData, actions } from "../lib/store";
import { kernel } from "../lib/pyodide";
import Editor from "./Editor";
import Output from "./Output";
import CellWrapper from "./CellWrapper";
import { Play, Square, Trash2 } from "lucide-solid";
import clsx from "clsx";

interface CodeCellProps {
  cell: CellData;
  isActive: boolean;
  index: number;
}

const CodeCell: Component<CodeCellProps> = (props) => {
  const [running, setRunning] = createSignal(false);

  const handleRun = async () => {
    if (running()) return;
    setRunning(true);
    actions.clearCellOutput(props.cell.id);
    try {
      await kernel.run(props.cell.content, (result) => {
        actions.updateCellOutput(props.cell.id, result);
      });
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  const toolbar = (
    <div class="flex lg:hidden items-center gap-1 p-1">
      <button 
        onClick={handleRun}
        disabled={running()}
        class={clsx(
          "p-1.5 hover:bg-foreground rounded-sm disabled:opacity-50",
          props.cell.outputs?.error ? "text-primary" : (props.isActive || props.cell.isEditing) ? "text-accent" : "text-accent"
        )}
        title="Run Cell (Ctrl+Enter)"
      >
        <Show when={!running()} fallback={<Square size={16} class="animate-pulse text-primary" />}>
          <Play size={16} />
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
      actionRunning={running()}
      hasError={!!props.cell.outputs?.error}
    >
      <div class="flex flex-col">
        <div class="flex p-2">
           {/* Line numbers gutter could go here */}
           <div class="w-10 bg-background border-r border-foreground flex flex-col items-center pt-5.5 text-xs text-foreground select-none font-mono">
              [{props.index + 1}]:
           </div>
           <div class="flex-1 bg-background relative">
             <Editor
               value={props.cell.content}
               onChange={(val) => actions.updateCell(props.cell.id, val)}
               language="python"
               readOnly={!props.cell.isEditing || running()}
             />
             <Show when={!props.cell.isEditing && !running()}>
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
        <Show when={props.cell.outputs}>
          <Output outputs={props.cell.outputs} />
        </Show>
      </div>
    </CellWrapper>
  );
};

export default CodeCell;
