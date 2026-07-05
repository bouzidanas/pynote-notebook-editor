import { type Component, type JSX, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { createSortable } from "@thisbeyond/solid-dnd";
import { GripVertical, Trash2, Play, Square, Edit2, Check, Timer, Eye, EyeOff, AArrowUp, AArrowDown } from "lucide-solid";
import clsx from "clsx";
import { notebookStore, actions, APP_ENABLE_CELL_DND, APP_QUIET_MODE } from "../lib/store";
import { currentTheme, parseUiBorder } from "../lib/theme";
import { TESTID } from "../lib/testids";

// Reactive store for cell exit levels - tracks each cell's exit level
// Each cell writes its exit level here, next cell reads via prevCellId prop
// Only used when sectionScoping is enabled
const [exitLevelStore, setExitLevelStore] = createStore<Record<string, number>>({});

// Register/update a cell's exit level (no-op if scoping disabled)
export const setCellExitLevel = (id: string, level: number) => {
  if (!currentTheme.sectionScoping) return;
  setExitLevelStore(id, level);
};

// Unregister when cell unmounts (no-op if scoping disabled)
export const unregisterCellExitLevel = (id: string) => {
  if (!currentTheme.sectionScoping) return;
  setExitLevelStore(id, undefined as any);
};

// Get a cell's exit level by ID (O(1) lookup, returns 0 if scoping disabled)
export const getCellExitLevel = (cellId: string | null): number => {
  if (!currentTheme.sectionScoping || !cellId) return 0;
  return exitLevelStore[cellId] ?? 0;
};

// Helper to find last header level in markdown content
export const getLastHeaderLevel = (content: string): number => {
  const lines = content.split('\n');
  let lastLevel = 0;
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s/);
    if (match) {
      lastLevel = Math.min(match[1].length, 4);
    }
  }
  return lastLevel;
};

interface CellWrapperProps {
  id: string;
  isActive: boolean;
  isEditing?: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: JSX.Element;
  type: "code" | "markdown";
  // Optional props for sidebar action button
  onActionClick?: () => void;
  actionRunning?: boolean;
  isQueued?: boolean;
  hasError?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  // For cross-cell section scoping
  prevCellId?: string | null;  // ID of the previous cell (for entry level)
  lastHeaderLevel?: number;    // Last header level in this cell (0 if none)
  // For code visibility toggle (code cells only)
  hasHiddenElements?: boolean; // Whether any visibility settings are hiding elements
  isShowingAll?: boolean;      // Whether this cell is in "show all" override mode
  onToggleVisibility?: () => void; // Toggle between show-all and user settings
  // For markdown formatting toolbar toggle
  showFormattingToolbar?: boolean;
  onToggleFormattingToolbar?: () => void;
  // For stacking order control
  cellIndex?: number;          // Cell position in notebook (for reverse z-index stacking)
}

const CellWrapper: Component<CellWrapperProps> = (props) => {
  const sortable = createSortable(props.id);
  const [hovered, setHovered] = createSignal(false);
  const presentationMode = () => notebookStore.presentationMode;
  let elementRef: HTMLDivElement | undefined;

  // Advanced cell-border overrides. Each state (default/hover/select/edit) is
  // independent; an empty value falls back to the built-in Tailwind classes below.
  const borderState = (): "default" | "hover" | "select" | "edit" => {
    if (props.isActive && props.isEditing) return "edit";
    if (props.isActive) return "select";
    if (hovered() && !presentationMode()) return "hover";
    return "default";
  };
  const customBorder = (): string => {
    const cb = currentTheme.cellBorder;
    switch (borderState()) {
      case "edit": return cb.edit;
      case "select": return cb.select;
      case "hover": return cb.hover;
      default: return cb.default;
    }
  };
  const customShadow = (): string => {
    const cs = currentTheme.cellShadow;
    switch (borderState()) {
      case "edit": return cs.edit;
      case "select": return cs.select;
      case "hover": return cs.hover;
      default: return cs.default;
    }
  };

  // Color the sidebar action icon (Play / Edit) to match the cell's border in
  // the current state. Falls back to the built-in colors when no advanced cell
  // border override is set, and to the custom border's color when one is.
  const actionIconColor = (): string => {
    if (props.hasError) return "var(--primary)";
    const cb = currentTheme.cellBorder;
    switch (borderState()) {
      case "edit":
        return cb.edit ? parseUiBorder(cb.edit, "var(--accent)").color : "var(--accent)";
      case "select":
        return cb.select
          ? parseUiBorder(cb.select, "var(--accent)").color
          : "color-mix(in srgb, var(--accent) 60%, transparent)";
      default:
        return "var(--foreground)";
    }
  };

  // Section scoping logic - only active when sectionScoping is enabled
  // When disabled, entryLevel() returns 0 and all store operations are no-ops
  const entryLevel = () => getCellExitLevel(props.prevCellId ?? null);
  
  // Only set up exit level tracking when section scoping is enabled
  if (currentTheme.sectionScoping) {
    // Exit level = last header in this cell, or pass through entry level
    const computeExitLevel = () => {
      const lastHeader = props.lastHeaderLevel || 0;
      return lastHeader > 0 ? lastHeader : entryLevel();
    };
    
    // Register on mount with initial value
    setCellExitLevel(props.id, computeExitLevel());
    
    // Update exit level when dependencies change (content or prev cell's exit)
    createEffect(() => {
      setCellExitLevel(props.id, computeExitLevel());
    });
    
    // Cleanup on unmount
    onCleanup(() => unregisterCellExitLevel(props.id));
  }

  createEffect(() => {
    // Track cellIndex so this effect re-runs when the cell moves position (e.g. via keyboard shortcut)
    void props.cellIndex;
    if (props.isActive && elementRef) {
      const rect = elementRef.getBoundingClientRect();
      const HEADER_HEIGHT = 100; // Safe area for sticky header + toolbar + padding
      const BOTTOM_MARGIN = 20;
      const viewportHeight = window.innerHeight - HEADER_HEIGHT - BOTTOM_MARGIN;

      const isAboveViewport = rect.bottom < HEADER_HEIGHT;
      const isBelowViewport = rect.top > window.innerHeight - BOTTOM_MARGIN;
      const isTallerThanViewport = rect.height > viewportHeight;

      // Only scroll if the entire cell is out of view
      if (isAboveViewport || isBelowViewport) {
        if (isTallerThanViewport) {
          // For tall cells, always show the top of the cell
          window.scrollBy({ top: rect.top - HEADER_HEIGHT, behavior: "smooth" });
        } else if (isAboveViewport) {
          // Cell is above: bring top into view
          window.scrollBy({ top: rect.top - HEADER_HEIGHT, behavior: "smooth" });
        } else {
          // Cell is below: bring bottom into view
          window.scrollBy({ top: rect.bottom - window.innerHeight + BOTTOM_MARGIN, behavior: "smooth" });
        }
      }
    }
  });

  return (
    <div
      id={`cell-${props.id}`}
      data-testid={TESTID.cell}
      data-cell-id={props.id}
      ref={(el) => { sortable.ref(el); elementRef = el; }}
      {...(APP_ENABLE_CELL_DND ? sortable.dragActivators : {})}
      onKeyDown={undefined}
      data-quiet={APP_QUIET_MODE || undefined}
      class={clsx(
        "group relative flex flex-col rounded-sm border-2 transition-all duration-200 p-1 max-xs:p-0",
        APP_ENABLE_CELL_DND && !presentationMode() && "cursor-grab active:cursor-grabbing",
        !props.isActive && "border-transparent",
        !presentationMode() && !props.isActive && "hover:border-secondary/10",
        props.isActive && !props.isEditing && "border-accent/60",
        props.isActive && props.isEditing && "border-accent shadow-[0_0_5px_var(--accent)]",
        notebookStore.movingCellId === props.id && "opacity-70 outline-2 outline-dashed outline-accent outline-offset-2",
        sortable.isActiveDraggable ? "opacity-50" : ""
      )}
      style={{ 
        transform: `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`,
        "margin-top": "var(--cell-margin)",
        "margin-bottom": "var(--cell-margin)",
        "z-index": props.cellIndex !== undefined ? 100000 - props.cellIndex : "auto",
        ...(entryLevel() ? { "--primary": `var(--header-color-${entryLevel()})` } : {}),
        "--cell-action-color": actionIconColor(),
        ...(currentTheme.cellBorder.radius ? { "border-radius": currentTheme.cellBorder.radius } : {}),
        ...(customBorder() ? { border: customBorder() } : {}),
        ...(customShadow() ? { "box-shadow": customShadow() } : {})
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (presentationMode()) return;
        e.stopPropagation();
        // Click-to-move: if another cell is picked up (via the mobile drawer
        // grip), a tap on this cell drops it here instead of just selecting.
        if (notebookStore.movingCellId && notebookStore.movingCellId !== props.id) {
          actions.dropMovingCellOn(props.id);
          return;
        }
        props.onActivate();
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
          <div 
            class="flex flex-col items-center gap-2 pointer-events-auto py-2 sidebar-inner-auto-center absolute w-full transition-[top,transform] duration-200"
            style={{
              "--sidebar-top": notebookStore.sidebarAlignment === "top" ? "0%" : 
                               notebookStore.sidebarAlignment === "bottom" ? "100%" : "50%",
              "--sidebar-transform": notebookStore.sidebarAlignment === "top" ? "translateY(0)" :
                                      notebookStore.sidebarAlignment === "bottom" ? "translateY(-100%)" : "translateY(-50%)",
              "top": "var(--sidebar-top)",
              "transform": "var(--sidebar-transform)"
            }}
          >
            {/* Action Button (Play for code, Edit for markdown) */}
            <Show when={props.onActionClick}>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  props.onActionClick?.(); 
                }} 
                disabled={props.type === "code" && (props.actionRunning || props.isQueued)}
                class="p-2 -m-1 rounded-sm disabled:opacity-50 text-[var(--cell-action-color)] hover:text-accent"
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

            {/* Formatting Toolbar Toggle (Markdown cells in edit mode) */}
            <Show when={props.type === "markdown" && props.isEditing && props.onToggleFormattingToolbar}>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  props.onToggleFormattingToolbar?.(); 
                }}
                class={clsx(
                  "p-2 -m-1 rounded-sm transition-colors",
                  props.showFormattingToolbar 
                    ? "text-accent hover:text-accent/80" 
                    : "text-foreground hover:text-accent"
                )}
                title={props.showFormattingToolbar ? "Hide Formatting Toolbar" : "Show Formatting Toolbar"}
              >
                <Show when={props.showFormattingToolbar} fallback={<AArrowDown size={14} />}>
                  <AArrowUp size={14} />
                </Show>
              </button>
            </Show>

            {/* Visibility Toggle (Code cells only, when elements are hidden OR show-all is active) */}
            <Show when={props.type === "code" && (props.hasHiddenElements || props.isShowingAll) && props.onToggleVisibility}>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  props.onToggleVisibility?.(); 
                }}
                class={clsx(
                  "p-2 -m-1 rounded-sm transition-colors",
                  props.isShowingAll 
                    ? "text-accent hover:text-accent/80" 
                    : "text-foreground hover:text-accent"
                )}
                title={props.isShowingAll ? "Hide elements (use visibility settings)" : "Show all elements"}
              >
                <Show when={props.isShowingAll} fallback={<EyeOff size={14} />}>
                  <Eye size={14} />
                </Show>
              </button>
            </Show>

            <Show when={APP_ENABLE_CELL_DND}>
              <div class="cursor-grab hover:text-accent p-2 -m-1 rounded-sm text-foreground">
                <GripVertical size={16} />
              </div>
            </Show>
            
            {/* Quick Actions */}
            <button onClick={(e) => { e.stopPropagation(); props.onDelete(); }} class="p-2 -m-1 hover:text-primary rounded-sm text-foreground">
              <Trash2 size={14} />
            </button>
          </div>
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