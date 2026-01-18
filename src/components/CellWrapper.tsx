import { type Component, type JSX, Show, createSignal } from "solid-js";
import { createSortable } from "@thisbeyond/solid-dnd";
import { GripVertical, Trash2, Play, Square, Edit2, Check } from "lucide-solid";
import clsx from "clsx";
import { notebookStore } from "../lib/store";

interface CellWrapperProps {
  id: string;
  isActive: boolean;
  isEditing?: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: JSX.Element;
  toolbar: JSX.Element;
  type: "code" | "markdown";
  // Optional props for sidebar action button
  onActionClick?: () => void;
  actionRunning?: boolean;
  hasError?: boolean;
}

const CellWrapper: Component<CellWrapperProps> = (props) => {
  const sortable = createSortable(props.id);
  const [hovered, setHovered] = createSignal(false);
  const presentationMode = () => notebookStore.presentationMode;

  return (
    <div
      ref={sortable.ref}
      {...sortable.dragActivators}
      onKeyDown={undefined}
      class={clsx(
        "group relative flex flex-col my-3 rounded-sm border-2 transition-all duration-200 p-1 max-xs:p-0",
        !presentationMode() && "cursor-grab active:cursor-grabbing",
        !props.isActive && "border-transparent",
        !presentationMode() && !props.isActive && "hover:border-secondary/10",
        props.isActive && !props.isEditing && "border-accent/60",
        props.isActive && props.isEditing && "border-accent shadow-[0_0_5px_var(--accent)]",
        sortable.isActiveDraggable ? "opacity-50" : ""
      )}
      style={{ transform: `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)` }}
      onClick={(e) => {
        if (!presentationMode()) {
          e.stopPropagation();
          props.onActivate();
        }
      }}
      onMouseEnter={() => !presentationMode() && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Sidebar / Drag Handle - Hidden in presentation mode */}
      <Show when={!presentationMode()}>
        <div 
          class={clsx(
            "absolute -left-10 top-0 bottom-0 w-8 flex-col items-center justify-center py-2 gap-2 opacity-0 transition-opacity hidden lg:flex",
            (hovered() || props.isActive) && "opacity-100"
          )}
        >
        {/* Action Button (Play for code, Edit for markdown) */}
        <Show when={props.onActionClick}>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              props.onActionClick?.(); 
            }} 
            disabled={props.type === "code" && props.actionRunning}
            class={clsx(
              "p-1 hover:text-accent rounded-sm disabled:opacity-50",
              props.hasError ? "text-primary" : (props.isActive || props.isEditing) ? "text-accent" : "text-foreground"
            )}
            title={props.type === "code" ? "Run Cell" : (props.isEditing ? "Finish Editing" : "Edit Markdown")}
          >
            <Show when={props.type === "code"}
              fallback={
                <Show when={props.isEditing} fallback={<Edit2 size={14} />}>
                  <Check size={14} />
                </Show>
              }
            >
              <Show when={!props.actionRunning} fallback={<Square size={14} class="animate-pulse" />}>
                <Play size={14} />
              </Show>
            </Show>
          </button>
        </Show>

        <div class="cursor-grab hover:text-accent p-1 rounded-sm text-foreground">
          <GripVertical size={16} />
        </div>
        
        {/* Quick Actions */}
         <button onClick={(e) => { e.stopPropagation(); props.onDelete(); }} class="p-1 hover:text-primary rounded-sm text-foreground">
           <Trash2 size={14} />
         </button>
        </div>
      </Show>

      {/* Toolbar - Visible when active and not in presentation mode */}
      <Show when={props.isActive && !presentationMode()}>
        <div class="absolute -top-8 right-2 flex bg-background shadow-md border border-foreground rounded-sm overflow-hidden z-10">
          {props.toolbar}
        </div>
      </Show>

      {/* Cell Content */}
      <div 
        class={clsx("w-full bg-background rounded-sm min-h-12.5 pl-1.5 max-xs:pl-1.1 cursor-auto", props.isActive ? "" : "")}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {props.children}
      </div>
    </div>
  );
};

export default CellWrapper;