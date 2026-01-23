import { type Component, type JSX, Show, createSignal, createEffect } from "solid-js";
import { createSortable } from "@thisbeyond/solid-dnd";
import { GripVertical, Trash2, Play, Square, Edit2, Check, Timer } from "lucide-solid";
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
  isQueued?: boolean;
  hasError?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const CellWrapper: Component<CellWrapperProps> = (props) => {
  const sortable = createSortable(props.id);
  const [hovered, setHovered] = createSignal(false);
  const presentationMode = () => notebookStore.presentationMode;
  let elementRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.isActive && elementRef) {
      const rect = elementRef.getBoundingClientRect();
      const HEADER_HEIGHT = 100; // Safe area for sticky header + toolbar + padding
      const BOTTOM_MARGIN = 20;

      // Check if hidden above
      if (rect.top < HEADER_HEIGHT) {
        window.scrollBy({ top: rect.top - HEADER_HEIGHT, behavior: "smooth" });
      } 
      // Check if hidden below
      else if (rect.bottom > window.innerHeight - BOTTOM_MARGIN) {
        window.scrollBy({ top: rect.bottom - window.innerHeight + BOTTOM_MARGIN, behavior: "smooth" });
      }
    }
  });

  return (
    <div
      id={`cell-${props.id}`}
      ref={(el) => { sortable.ref(el); elementRef = el; }}
      {...sortable.dragActivators}
      onKeyDown={undefined}
      class={clsx(
        "group relative flex flex-col rounded-sm border-2 transition-all duration-200 p-1 max-xs:p-0",
        !presentationMode() && "cursor-grab active:cursor-grabbing",
        !props.isActive && "border-transparent",
        !presentationMode() && !props.isActive && "hover:border-secondary/10",
        props.isActive && !props.isEditing && "border-accent/60",
        props.isActive && props.isEditing && "border-accent shadow-[0_0_5px_var(--accent)]",
        sortable.isActiveDraggable ? "opacity-50" : ""
      )}
      style={{ 
        transform: `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`,
        "margin-top": "var(--cell-margin)",
        "margin-bottom": "var(--cell-margin)"
      }}
      onClick={(e) => {
        if (!presentationMode()) {
          e.stopPropagation();
          props.onActivate();
        }
      }}
      onMouseEnter={() => {
          if (!presentationMode()) setHovered(true);
          props.onMouseEnter?.();
      }}
      onMouseLeave={() => {
          setHovered(false);
          props.onMouseLeave?.();
      }}
    >
      {/* Sidebar / Drag Handle - Hidden in presentation mode */}
      <Show when={!presentationMode()}>
        <div 
          class={clsx(
            "absolute -left-10 w-8 top-0 bottom-0 flex-col items-center hidden lg:flex transition-opacity duration-200 pointer-events-none",
            (hovered() || props.isActive) ? "opacity-100" : "opacity-0"
          )}
          style={{ "container-type": "size", "container-name": "cell-sidebar" }}
        >
          <div class={clsx(
            "flex flex-col items-center gap-2 pointer-events-auto py-2 transition-all duration-200 sidebar-inner-auto-center",
            // Base alignment
            notebookStore.sidebarAlignment === "top" ? "mt-0 mb-auto" : 
            notebookStore.sidebarAlignment === "bottom" ? "mt-auto mb-0" : 
            "my-auto"
          )}>
            {/* Action Button (Play for code, Edit for markdown) */}
            <Show when={props.onActionClick}>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  props.onActionClick?.(); 
                }} 
                disabled={props.type === "code" && (props.actionRunning || props.isQueued)}
                class={clsx(
                  "p-2 -m-1 hover:text-accent rounded-sm disabled:opacity-50",
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
                    <Show when={props.isQueued} fallback={<Play size={14} />}>
                      <Timer size={14} class="text-accent/70 animate-pulse" />
                    </Show>
                  </Show>
                </Show>
              </button>
            </Show>

            <div class="cursor-grab hover:text-accent p-2 -m-1 rounded-sm text-foreground">
              <GripVertical size={16} />
            </div>
            
            {/* Quick Actions */}
            <button onClick={(e) => { e.stopPropagation(); props.onDelete(); }} class="p-2 -m-1 hover:text-primary rounded-sm text-foreground">
              <Trash2 size={14} />
            </button>
          </div>
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