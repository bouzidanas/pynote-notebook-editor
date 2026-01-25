import { type Component, For, Show, createSignal, onCleanup, createEffect, onMount, lazy } from "solid-js";
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCorners, useDragDropContext } from "@thisbeyond/solid-dnd";
import { TransitionGroup } from "solid-transition-group";
import { notebookStore, actions, defaultCells } from "../lib/store";
import { tutorialCells } from "../lib/tutorial-notebook";
import CodeCell from "./CodeCell";
import MarkdownCell from "./MarkdownCell";
import { Plus, Code, FileText, ChevronDown, StopCircle, RotateCw, Save, FolderOpen, Download, Undo2, Redo2, X, Eye, Play, Trash2, Keyboard, BookOpen, Activity } from "lucide-solid";
import { kernel } from "../lib/pyodide";
import Dropdown, { DropdownItem, DropdownNested, DropdownDivider } from "./ui/Dropdown";
import { sessionManager } from "../lib/session";

const PerformanceMonitor = lazy(() => import("./PerformanceMonitor"));

const SHORTCUTS = {
  global: [
    { label: "New Notebook", keys: "Alt + N" },
    { label: "Open File", keys: "Ctrl + O" },
    { label: "Save Notebook", keys: "Ctrl + S" },
    { label: "Export .ipynb", keys: "Ctrl + E" },
    { label: "Toggle Shortcuts", keys: "Ctrl + /" },
    { label: "Presentation Mode", keys: "Alt + P" },
    { label: "Run All Cells", keys: "Alt + R" },
    { label: "Clear All Outputs", keys: "Alt + C" },
    { label: "Delete All Cells", keys: "Alt + D" },
    { label: "Restart Kernel", keys: "Alt + K" },
    { label: "Shutdown Kernel", keys: "Alt + Q" }
  ],
  command: [
    { label: "Run & Stay", keys: "Ctrl + Enter" },
    { label: "Run & Select Next", keys: "Shift + Enter" },
    { label: "Run & Insert", keys: "Alt + Enter" },
    { label: "Enter Edit Mode", keys: "Enter" },
    { label: "Deselect Cell", keys: "Esc" },
    { label: "Change to Code", keys: "Y" },
    { label: "Change to Markdown", keys: "M" },
    { label: "Move Up", keys: "Alt/Ctrl+Shift + ↑" },
    { label: "Move Down", keys: "Alt/Ctrl+Shift + ↓" },
    { label: "Insert Above", keys: "A" },
    { label: "Insert Below", keys: "B" },
    { label: "Delete Cell", keys: "Ctrl + D" },
    { label: "Clear Output", keys: "Alt + Backspace" }
  ],
  edit: [
    { label: "Run & Stay (Code)", keys: "Ctrl + Enter" },
    { label: "Render (Markdown)", keys: "Ctrl + Enter" },
    { label: "Run & Edit Next", keys: "Shift + Enter" },
    { label: "Run & Insert", keys: "Alt + Enter" },
    { label: "Exit Edit Mode", keys: "Esc" },
    { label: "Clear Output", keys: "Alt + Backspace" }
  ]
};

const SideShortcuts: Component<{ activeId: string | null; isEditing: boolean; onClose: () => void }> = (props) => {
  return (
     <div class="fixed left-[calc(50%+28rem)] top-32 w-72 max-w-[20rem] hidden 2xl:flex flex-col gap-6 text-secondary/60 transition-opacity duration-300 group z-50">
        <button 
            onClick={props.onClose}
            class="absolute -top-2 -right-2 p-1.5 rounded-lg hover:bg-foreground text-secondary/40 hover:text-secondary opacity-0 group-hover:opacity-100 transition-all duration-200 z-50 cursor-pointer"
            title="Hide Shortcuts"
        >
            <X size={16} />
        </button>

        {/* Global - Always show */}
        <div class="space-y-2">
            <h3 class="text-xs font-bold uppercase tracking-widest opacity-50">Global</h3>
            <For each={SHORTCUTS.global}>
                {s => <div class="text-xs flex justify-between gap-8"><span class="font-light">{s.label}</span> <span class="font-mono opacity-75">{s.keys}</span></div>}
            </For>
        </div>

        {/* Dynamic Context Section using Grid for stacking */}
        <div class="grid grid-cols-1">
            {/* Command Mode */}
            <div 
                class={`col-start-1 row-start-1 space-y-2 transition-all ease-out ${
                    props.activeId && !props.isEditing 
                    ? "opacity-100 translate-x-0 duration-300 delay-100" 
                    : "opacity-0 translate-x-4 duration-100 pointer-events-none"
                }`}
            >
                <h3 class="text-xs font-bold uppercase tracking-widest opacity-50">Command Mode</h3>
                <For each={SHORTCUTS.command}>
                    {s => <div class="text-xs flex justify-between gap-8"><span class="font-light">{s.label}</span> <span class="font-mono opacity-75">{s.keys}</span></div>}
                </For>
            </div>

            {/* Edit Mode */}
            <div 
                class={`col-start-1 row-start-1 space-y-2 transition-all ease-out ${
                    props.activeId && props.isEditing 
                    ? "opacity-100 translate-x-0 duration-300 delay-100" 
                    : "opacity-0 translate-x-4 duration-100 pointer-events-none"
                }`}
            >
                <h3 class="text-xs font-bold uppercase tracking-widest opacity-50">Edit Mode</h3>
                <For each={SHORTCUTS.edit}>
                    {s => <div class="text-xs flex justify-between gap-8"><span class="font-light">{s.label}</span> <span class="font-mono opacity-75">{s.keys}</span></div>}
                </For>
            </div>
        </div>
     </div>
  );
};

// Track mouse position globally to calculate grab offset
if (typeof window !== 'undefined') {
  (window as any).lastMouseX = 0;
  
  window.addEventListener('mousemove', (e: MouseEvent) => {
    (window as any).lastMouseX = e.clientX;
  });
}

// Custom overlay that follows mouse cursor
const CustomDragOverlay: Component<{ height: number | null; grabOffsetX: number; cellWidth: number }> = (props) => {
  const [state] = useDragDropContext()!;
  const [mousePos, setMousePos] = createSignal({ x: 0, y: 0 });

  createEffect(() => {
    if (state.active.draggable) {
      const handleMouseMove = (e: MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
      };
      window.addEventListener("mousemove", handleMouseMove);
      onCleanup(() => {
        window.removeEventListener("mousemove", handleMouseMove);
      });
    }
  });

  return (
    <Show when={state.active.draggable && props.height}>
      <div 
        class="fixed pointer-events-none z-50" 
        style={{ 
          // Position the pill so it maintains the grab offset from the cell
          // The pill is 832px wide, the cell is cellWidth, so we extend equally on both sides
          left: `${mousePos().x - props.grabOffsetX - (832 - props.cellWidth) / 2}px`, 
          top: `${mousePos().y}px`,
          width: "832px" // Match max-w-[52rem]
        }}
      >
        <div class="bg-accent/20 border-2 border-accent h-12 w-full rounded-sm opacity-50 shadow-sm"></div>
      </div>
    </Show>
  );
};

const AutoScroller: Component = () => {
  const [state, { recomputeLayouts }] = useDragDropContext()!;
  let scrollFrame: number | null = null;
  let mouseY = 0;
  const SCROLL_SPEED = 15;
  const MENU_HEIGHT = 80;
  const EDGE_THRESHOLD = 50;

  const handleMouseMove = (e: MouseEvent) => {
    mouseY = e.clientY;
  };

  const handleScroll = () => {
    // Only recompute when actual scroll events fire (from user or our scrollBy)
    recomputeLayouts();
  };

  const loop = () => {
    const { innerHeight } = window;
    
    // Check top zone (accounting for menu bar)
    if (mouseY < MENU_HEIGHT + EDGE_THRESHOLD && mouseY > 0) {
      window.scrollBy(0, -SCROLL_SPEED);
    } 
    // Check bottom zone
    else if (mouseY > innerHeight - EDGE_THRESHOLD) {
      window.scrollBy(0, SCROLL_SPEED);
    }
    
    // Don't call recomputeLayouts here - let the scroll event handle it
    
    scrollFrame = requestAnimationFrame(loop);
  };

  createEffect(() => {
    if (state.active.draggable) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("scroll", handleScroll);
      scrollFrame = requestAnimationFrame(loop);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = null;
      }
    }
  });

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("scroll", handleScroll);
    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
    }
  });

  return null;
};

const Notebook: Component = () => {
  let fileInput: HTMLInputElement | undefined;
  const [draggedHeight, setDraggedHeight] = createSignal<number | null>(null);
  const [grabOffsetX, setGrabOffsetX] = createSignal(0);
  const [cellWidth, setCellWidth] = createSignal(0);
  // Signal for showing the Esc hint in presentation mode
  const [showEscHint, setShowEscHint] = createSignal(false);
  const [showShortcuts, setShowShortcuts] = createSignal(false);
  const [showPerformance, setShowPerformance] = createSignal(false);
  // Version signal to force re-mounting of the list on full reloads
  const [notebookVersion, ] = createSignal(0);

  // --- Old Internal Autosave Mechanism ---
  // const AUTOSAVE_KEY = "pynote-autosave";

  // Helper to run a specific cell
  const executeRunner = async (content: string, id: string) => {
      await kernel.run(content, (result) => {
          actions.updateCellOutput(id, result);
      });
  };

  const runCell = (id: string) => {
    actions.runCell(id, executeRunner);
  };

  // Monitor Kernel Status
  createEffect(() => {
      const status = kernel.status;
      if (status === "ready") {
          // If queue has items and nothing is running, start the queue
          if (notebookStore.executionQueue.length > 0 && !notebookStore.cells.some(c => c.isRunning)) {
              const nextId = actions.popFromQueue();
              if (nextId) {
                  actions.executeCell(nextId, executeRunner);
              }
          }
      } else if (status === "error" || status === "stopped") {
          actions.resetExecutionState();
      }
  });

  const runAll = async () => {
    // Run sequentially using the queue logic
    for (const cell of notebookStore.cells) {
        if (cell.type === "code") {
            runCell(cell.id);
        }
    }
  };

  const runSelected = () => {
      if (notebookStore.activeCellId) {
          runCell(notebookStore.activeCellId);
      }
  };

  const clearSelectedOutput = () => {
      if (notebookStore.activeCellId) {
          actions.clearCellOutput(notebookStore.activeCellId);
      }
  };
  
  const deleteSelected = () => {
       if (notebookStore.activeCellId) {
          actions.deleteCell(notebookStore.activeCellId);
      }
  };

  const isEditingActive = () => {
    const activeId = notebookStore.activeCellId;
    if (!activeId) return false;
    const cell = notebookStore.cells.find(c => c.id === activeId);
    return !!cell?.isEditing;
  };

  const getUndoDisabled = () => {
    if (isEditingActive()) {
        const activeId = notebookStore.activeCellId;
        const cell = notebookStore.cells.find(c => c.id === activeId);
        // If we have exposed state (CodeEditor), check depth
        // For Markdown/Milkdown we don't have easy access to depth, so we keep it enabled
        if (cell?.canUndo !== undefined) {
             return !cell.canUndo;
        }
        return true; // Default to disabled while loading
    }
    return notebookStore.historyIndex < 0;
  };

  const getRedoDisabled = () => {
    if (isEditingActive()) {
        const activeId = notebookStore.activeCellId;
        const cell = notebookStore.cells.find(c => c.id === activeId);
        // If we have exposed state (CodeEditor), check depth
        if (cell?.canRedo !== undefined) {
             return !cell.canRedo;
        }
        return true; // Default to disabled while loading
    }
    return notebookStore.historyIndex >= notebookStore.history.length - 1;
  };

  const handleUndo = () => {
    if (isEditingActive()) {
        const activeId = notebookStore.activeCellId;
        if (activeId) {
             actions.dispatchEditorAction(activeId, "undo");
             return;
        }
    }
    actions.undo();
  };

  const handleRedo = () => {
    if (isEditingActive()) {
        const activeId = notebookStore.activeCellId;
         if (activeId) {
             actions.dispatchEditorAction(activeId, "redo");
             return;
        }
    }
    actions.redo();
  };


  // Keyboard Shortcuts
  onMount(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      // Resolve state early
      const activeId = notebookStore.activeCellId;
      const activeCell = activeId ? notebookStore.cells.find(c => c.id === activeId) : null;
      const activeIndex = activeId ? notebookStore.cells.findIndex(c => c.id === activeId) : -1;
      const isEditing = activeCell?.isEditing;

      // Global Shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        fileInput?.click();
      } else if (e.altKey && e.key === "n") { // Alt + N for New
        e.preventDefault();
        // Redirect to a completely new session URL
        const url = sessionManager.createNewSessionUrl();

        // Option A: Same Tab (History Push)
        //           In the future we might want to provide both options: open new document in same tab or new tab
        //           So we leave this commented for now.
        // window.location.href = url;
        
        // Option B: New Tab
        window.open(url, '_blank');
      } else if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        handleSave(); // Export is same as Save currently
      } else if (!isEditing && (e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        // Global Undo/Redo (Only when NOT editing)
        if (e.shiftKey) {
           e.preventDefault();
           actions.redo();
        } else {
           e.preventDefault();
           actions.undo();
        }
      } else if (!isEditing && (e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
         // Global Redo (Windows style)
         e.preventDefault();
         actions.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "/") {

        e.preventDefault();
        setShowShortcuts(!showShortcuts());
      } else if (e.altKey && e.key === "p") {
        e.preventDefault();
        actions.setPresentationMode(!notebookStore.presentationMode);
      } else if (e.altKey && e.key === "r") {
        e.preventDefault();
        runAll();
      } else if (e.altKey && e.key === "c") {
        e.preventDefault();
        actions.clearAllOutputs();
      } else if (e.altKey && e.key === "d") {
        e.preventDefault();
        actions.deleteAllCells();
      } else if (e.altKey && e.key === "k") {
        e.preventDefault();
        kernel.restart();
        actions.resetExecutionState();
      } else if (e.altKey && e.key === "q") {
        e.preventDefault();
        kernel.terminate();
        actions.resetExecutionState();
      } else if (e.altKey && e.key === "Backspace") {
        if (notebookStore.activeCellId) {
             e.preventDefault();
             actions.clearCellOutput(notebookStore.activeCellId);
        }
      }

      if (isEditing) {

        // Edit Mode Shortcuts
        if (e.key === "Enter" && e.shiftKey) {
            // Run & Edit Next
            e.preventDefault();
            if (activeId) {
                runCell(activeId);
                // Exit current edit
                actions.setEditing(activeId, false);
                // Move to next or insert
                if (activeIndex < notebookStore.cells.length - 1) {
                    const nextId = notebookStore.cells[activeIndex + 1].id;
                    actions.setActiveCell(nextId);
                    actions.setEditing(nextId, true);
                } else {
                    // Insert same type below
                    actions.addCell(activeCell?.type || "code");
                }
            }
        } else if (e.key === "Enter" && e.ctrlKey) {
            // Run & Stay (Exit Edit Mode for Markdown, Stay for Code)
            e.preventDefault();
            if (activeId) {
                runCell(activeId);
                // Only exit edit mode if it's a markdown cell
                if (activeCell?.type === "markdown") {
                    actions.setEditing(activeId, false);
                }
            }
        } else if (e.key === "Enter" && e.altKey) {
            // Run & Insert Below (Edit new)
            e.preventDefault();
            if (activeId) {
                runCell(activeId);
                actions.setEditing(activeId, false);
                actions.addCell(activeCell?.type || "code", activeIndex + 1);
            }
        } else if (e.key === "Escape") {
             // Exit Edit Mode
             if (activeId) actions.setEditing(activeId, false);
        }
      } else if (activeId) {
        // Command/Selected Mode Shortcuts (when not editing)
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
             e.preventDefault();
             actions.setEditing(activeId, true);
        } else if (e.key === "Escape") {
             // Deselect
             e.preventDefault();
             actions.setActiveCell(null);
        } else if (e.key === "ArrowUp" && (e.altKey || (e.ctrlKey && e.shiftKey))) {
             // Move Up
             e.preventDefault();
             if (activeIndex > 0) {
                 actions.moveCell(activeIndex, activeIndex - 1);
             }
        } else if (e.key === "ArrowDown" && (e.altKey || (e.ctrlKey && e.shiftKey))) {
             // Move Down
             e.preventDefault();
             if (activeIndex < notebookStore.cells.length - 1) {
                 actions.moveCell(activeIndex, activeIndex + 1);
             }
        } else if (e.key === "ArrowUp") {
             e.preventDefault();
             if (activeIndex > 0) actions.setActiveCell(notebookStore.cells[activeIndex - 1].id);
        } else if (e.key === "ArrowDown") {
             e.preventDefault();
             if (activeIndex < notebookStore.cells.length - 1) actions.setActiveCell(notebookStore.cells[activeIndex + 1].id);
        } else if (e.key === "a" || e.key === "A") { // Insert Above (Same Type)
             actions.addCell(activeCell?.type || "code", activeIndex);
        } else if (e.key === "b" || e.key === "B") { // Insert Below (Same Type)
             actions.addCell(activeCell?.type || "code", activeIndex + 1);
        } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) { 
             e.preventDefault();
             actions.deleteCell(activeId);
        } else if (e.key === "m" || e.key === "M") {
             actions.changeCellType(activeId, "markdown");
        } else if (e.key === "y" || e.key === "Y") {
             actions.changeCellType(activeId, "code");
        } else if (e.key === "Enter" && e.shiftKey) {
            // Run & Select Next
            e.preventDefault();
            runCell(activeId);
            if (activeIndex < notebookStore.cells.length - 1) {
                actions.setActiveCell(notebookStore.cells[activeIndex + 1].id);
            }
        } else if (e.key === "Enter" && e.ctrlKey) {
            // Run & Stay Selected
            e.preventDefault();
            runCell(activeId);
        } else if (e.key === "Enter" && e.altKey) {
             // Run & Insert Below (Edit new) - "run and insert new cell ... automatically in editing mode"
            e.preventDefault();
            runCell(activeId);
            actions.addCell(activeCell?.type || "code", activeIndex + 1);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeydown);
    onCleanup(() => window.removeEventListener("keydown", handleGlobalKeydown));
  });

  // Save notebook state to localStorage (internal, not user-controlled)
  function autosaveNotebook() {
    const sessionId = sessionManager.getSessionIdFromUrl();
    if (!sessionId) {
      // Should not happen for normal sessions, but if it does (e.g. user manually removed param),

      // we don't save to avoid polluting "null" key.
      return;
    }
    
    // Only save essential notebook state (cells, filename, history, historyIndex)
    // Always set isEditing to false for all cells before saving
    const data = {
      cells: notebookStore.cells.map(cell => ({ 
        ...cell, 
        isEditing: false,
        isRunning: false,
        isQueued: false
      })),
      filename: notebookStore.filename,
      history: notebookStore.history,
      historyIndex: notebookStore.historyIndex,
      activeCellId: notebookStore.activeCellId
    };
    
    sessionManager.saveSession(sessionId, data);
  }

  // Restore notebook state from localStorage (if present)
  function restoreNotebook() {
    const sessionId = sessionManager.getSessionIdFromUrl();
    if (!sessionId) return false;

    const data = sessionManager.loadSession(sessionId);
    if (data && Array.isArray(data.cells)) {
        // Sanitize cells to ensure no stale running state
        const sanitizedCells = data.cells.map((c: any) => ({
             ...c,
             isRunning: false,
             isQueued: false
        }));

        actions.loadNotebook(
          sanitizedCells,
          data.filename || "Untitled.ipynb",
          data.history || [],
          typeof data.historyIndex === "number" ? data.historyIndex : undefined,
          data.activeCellId
        );
        return true;
      }
    return false;
  }


  // On mount, restore autosaved notebook if present, else load default cells
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const isTutorial = params.get("open") === "tutorial";
    let sessionId = sessionManager.getSessionIdFromUrl();

    // Handle Tutorial Initialization (Fresh)
    if (isTutorial && !sessionId) {
      // Create new session ID for the tutorial
      sessionId = crypto.randomUUID();
      const url = new URL(window.location.href);
      url.searchParams.set("session", sessionId);
      window.history.replaceState({}, "", url.toString());

      actions.loadNotebook([...tutorialCells], "Tutorial.ipynb", []);
      autosaveNotebook();
      return;
    }

    // New Session Handling (Normal)
    if (!sessionId) {
        // First visit or cleared URL - Create new session
        const newUrl = sessionManager.createNewSessionUrl();
        window.history.replaceState({}, '', newUrl);
        // Start fresh
        actions.loadNotebook([...defaultCells], "Untitled.ipynb", []);
        // Force immediate save to establish the session in index
        autosaveNotebook();
    } else {
        const restored = restoreNotebook();
        if (!restored) {
            // ID exists but data is gone (expired/deleted)
            if (isTutorial) {
                 // Tutorial link with invalid/expired session -> Reload Tutorial
                 actions.loadNotebook([...tutorialCells], "Tutorial.ipynb", []);
            } else {
                 // Normal link with invalid/expired session -> New Notebook
                 actions.loadNotebook([...defaultCells], "Untitled.ipynb", []);
            }
             autosaveNotebook();
        }
    }
  });


  // Provide autosaveNotebook to the store for use in setEditing
  actions.__setAutosaveCallback?.(autosaveNotebook);

  // Show the Esc hint for 2.5 seconds when entering presentation mode
  createEffect(() => {
    if (notebookStore.presentationMode) {
      setShowEscHint(true);
      const timeout = setTimeout(() => setShowEscHint(false), 2500);
      onCleanup(() => clearTimeout(timeout));
    }
  });

  // Keyboard listener for exiting presentation mode
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && notebookStore.presentationMode) {
        actions.setPresentationMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const onDragStart = ({ draggable }: any) => {
    if (draggable.node) {
      const rect = draggable.node.getBoundingClientRect();
      setDraggedHeight(rect.height);
      setCellWidth(rect.width);
      
      // Calculate the horizontal offset from the left edge of the cell to the mouse
      const mouseX = (window as any).lastMouseX || 0;
      setGrabOffsetX(mouseX - rect.left);
    }
  };

  const onDragEnd = ({ draggable, droppable }: any) => {
    setDraggedHeight(null);

    if (draggable && droppable) {
      const fromIndex = notebookStore.cells.findIndex((c) => c.id === draggable.id);
      const toIndex = notebookStore.cells.findIndex((c) => c.id === droppable.id);
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        actions.moveCell(fromIndex, toIndex);
      }
    }
  };

  const handleSave = () => {
    const notebook = {
      cells: notebookStore.cells.map(c => ({
        cell_type: c.type,
        source: c.content.split('\n').map(l => l + '\n'),
        outputs: [], 
        metadata: {}
      })),
      metadata: {
        kernelspec: {
          display_name: "Python 3 (Pyodide)",
          language: "python",
          name: "python3"
        },
        language_info: {
          name: "python",
          version: "3.11.3"
        },
        PyNote: {
          history: notebookStore.history
        }
      },
      nbformat: 4,
      nbformat_minor: 5
    };
    const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = notebookStore.filename || "notebook.ipynb";
    a.click();
    URL.revokeObjectURL(url);
    // Manual save does NOT clear autosave; user can still restore if needed
  };

  const handleLoad = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const nb = JSON.parse(content);
        if (nb.cells && Array.isArray(nb.cells)) {
          const newCells = nb.cells.map((c: any) => ({
            id: crypto.randomUUID(),
            type: c.cell_type === "code" || c.cell_type === "markdown" ? c.cell_type : "markdown",
            content: Array.isArray(c.source) ? c.source.join("") : (c.source || ""),
            isEditing: false
          }));
          // Extract history from PyNote metadata if it exists
          const history = nb.metadata?.PyNote?.history || [];
          
          // Generate a new session ID for this file
          const newSessionId = crypto.randomUUID();
          
          // Create session data
          const sessionData = {
            cells: newCells,
            filename: file.name,
            history: history,
            historyIndex: history.length - 1,
            activeCellId: null
          };
          
          // Save to the new session slot
          sessionManager.saveSession(newSessionId, sessionData);
          
          // Navigate to the new session URL (pushes to history so Back works)
          const url = new URL(window.location.href);
          url.searchParams.set("session", newSessionId);
          url.searchParams.delete("open"); // Clear tutorial param if present
          window.location.assign(url.toString()); // Re-loads with new session
        }
      } catch (err) {
        console.error("Failed to load notebook", err);
        alert("Invalid notebook file");
      }
    };
    reader.readAsText(file);
    if (fileInput) fileInput.value = "";
  };

  return (
    <div class="pb-32">
       {/* Global Toolbar */}
       <div 
         class={`sticky top-0 z-20 max-xs:z-60 bg-background/80 backdrop-blur-md border-b border-foreground mb-8 shadow-sm transition-transform duration-300 ${notebookStore.presentationMode ? "-translate-y-full" : ""}`}
         onClick={(e) => {
           e.stopPropagation();
           // Deselect all cells when clicking the background
           if (!notebookStore.presentationMode) {
             actions.setActiveCell(null);
           }
         }}
       >
         <div class="max-w-202 mx-auto px-7.5 max-xs:pl-6.5 max-xs:pr-2 py-4 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
           <div class="flex items-center gap-2">
             <div class="btn-toolbar bg-primary! text-background! hover:bg-primary/90! flex items-center justify-center font-bold! text-xl! leading-none sm:flex border-primary">PyNote</div>
             <div class="h-8 w-px bg-foreground mx-1 hidden xs:block"></div>
             
             {/* Desktop Menu - Hidden on small screens */}
             <div class="hidden min-[800px]:flex items-center gap-2">
               {/* Options Menu */}
               <Dropdown trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Options <ChevronDown size={18} />
                   </button>
               }>
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">File</div>
                   <DropdownItem onClick={() => { 
                       const url = sessionManager.createNewSessionUrl();
                       window.open(url, '_blank');
                   }} shortcut="Alt+N"> 
                       <div class="flex items-center gap-2"><FileText size={18} /> New Notebook</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => fileInput?.click()} shortcut="Ctrl+O">
                       <div class="flex items-center gap-2"><FolderOpen size={18} /> Open</div>
                   </DropdownItem>
                   <DropdownItem onClick={handleSave} shortcut="Ctrl+S">
                       <div class="flex items-center gap-2"><Save size={18} /> Save</div>
                   </DropdownItem>
                   <DropdownItem onClick={handleSave} shortcut="Ctrl+E">
                       <div class="flex items-center gap-2"><Download size={18} /> Export .ipynb</div>
                   </DropdownItem>
                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">View</div>
                   <DropdownItem onClick={() => actions.setPresentationMode(true)} shortcut="Alt+P">
                       <div class="flex items-center gap-2"><Eye size={18} /> Presentation</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => setShowPerformance(true)}>
                       <div class="flex items-center gap-2"><Activity size={18} /> Performance</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => {
                       // Open tutorial in new tab
                       const url = `${window.location.origin}${window.location.pathname}?open=tutorial`;
                       window.open(url, '_blank');
                   }}>
                       <div class="flex items-center gap-2"><BookOpen size={18} /> Tutorial</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => setShowShortcuts(!showShortcuts())} shortcut="Ctrl+/">
                       <div class="flex items-center gap-2"><Keyboard size={18} /> Shortcuts</div>
                   </DropdownItem>
               </Dropdown>
    
               {/* Kernel Menu */}
               <Dropdown trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Kernel <ChevronDown size={18} />
                   </button>
               }>
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Cell</div>
                   <DropdownItem 
                        onClick={runSelected}
                        disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                        shortcut="Shift+Enter"
                   >
                       <div class="flex items-center gap-2"><Play size={18} /> Run Selected</div>
                   </DropdownItem>
                   <DropdownItem 
                        onClick={clearSelectedOutput}
                        disabled={kernel.status !== "ready" || !notebookStore.activeCellId || (() => {
                            const c = notebookStore.cells.find(c => c.id === notebookStore.activeCellId);
                            return !c || !c.outputs;
                        })()}
                        shortcut="Alt+Backspace"
                   >
                       <div class="flex items-center gap-2"><X size={18} /> Clear Output</div>
                   </DropdownItem>
                   <DropdownItem 
                        onClick={deleteSelected}
                        disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                        shortcut="Ctrl+D"
                   >
                       <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete Cell</div>
                   </DropdownItem>

                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Notebook</div>
                   
                   <DropdownItem 
                        onClick={runAll} 
                        disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                        shortcut="Alt+R"
                   >
                       <div class="flex items-center gap-2"><Play size={18} /> Run All</div>
                   </DropdownItem>
                   <DropdownItem 
                        onClick={() => actions.clearAllOutputs()}
                        disabled={kernel.status !== "ready" || !notebookStore.cells.some(c => c.outputs)}
                        shortcut="Alt+C"
                   >
                       <div class="flex items-center gap-2"><X size={18} /> Clear All Outputs</div>
                   </DropdownItem>
                   <DropdownItem 
                        onClick={() => actions.deleteAllCells()}
                        disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                        shortcut="Alt+D"
                   >
                       <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete All Cells</div>
                   </DropdownItem>

                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Execution</div>
                   
                   <DropdownItem onClick={() => actions.setExecutionMode("queue_all")}>
                       <div class="flex items-center gap-2">
                           <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "queue_all" ? "bg-accent" : ""}`}></div>
                           Sequential
                       </div>
                   </DropdownItem>
                   <DropdownItem onClick={() => actions.setExecutionMode("hybrid")}>
                       <div class="flex items-center gap-2">
                           <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "hybrid" ? "bg-accent" : ""}`}></div>
                           Hybrid
                       </div>
                   </DropdownItem>
                   <DropdownItem onClick={() => actions.setExecutionMode("direct")}>
                       <div class="flex items-center gap-2">
                           <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "direct" ? "bg-accent" : ""}`}></div>
                           Concurrent
                       </div>
                   </DropdownItem>

                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Session</div>
                   
                   <DropdownItem onClick={() => { kernel.restart(); actions.resetExecutionState(); }} shortcut="Alt+K">
                       <div class="flex items-center gap-2 text-accent"><RotateCw size={18} /> Restart</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => { kernel.terminate(); actions.resetExecutionState(); }} shortcut="Alt+Q">
                       <div class="flex items-center gap-2 text-primary"><StopCircle size={18} /> Shut Down</div>
                   </DropdownItem>
               </Dropdown>
               
               <div class="h-8 w-px bg-foreground mx-1"></div>
    
               <button onClick={() => {
                 const idx = (() => {
                   const activeId = notebookStore.activeCellId;
                   if (!activeId) return undefined;
                   const i = notebookStore.cells.findIndex(c => c.id === activeId);
                   if (i === -1) return undefined;
                   return i + 1;
                 })();
                 actions.addCell("code", idx);
               }} class="btn-toolbar flex items-center gap-1" title="Add Code Cell">
                 <Plus size={20} /> <Code size={20} />
               </button>
               <button onClick={() => {
                 const idx = (() => {
                   const activeId = notebookStore.activeCellId;
                   if (!activeId) return undefined;
                   const i = notebookStore.cells.findIndex(c => c.id === activeId);
                   if (i === -1) return undefined;
                   return i + 1;
                 })();
                 actions.addCell("markdown", idx);
               }} class="btn-toolbar flex items-center gap-1" title="Add Markdown Cell">
                 <Plus size={20} /> <FileText size={20} />
               </button>
               
               <div class="h-8 w-px bg-foreground mx-1"></div>
  
               {/* Undo/Redo */}
               <button 
                 onClick={handleUndo} 
                 class="btn-toolbar flex items-center gap-1" 
                 title="Undo"
                 disabled={getUndoDisabled()}
                 classList={{ "opacity-50 cursor-not-allowed": getUndoDisabled() }}
               >
                 <Undo2 size={20} />
               </button>
               <button 
                 onClick={handleRedo} 
                 class="btn-toolbar flex items-center gap-1" 
                 title="Redo"
                 disabled={getRedoDisabled()}
                 classList={{ "opacity-50 cursor-not-allowed": getRedoDisabled() }}
               >
                 <Redo2 size={20} />
               </button>
             </div>

             {/* Mobile Menu - Shown on small screens */}
             <div class="flex min-[800px]:hidden items-center gap-2">
               {/* Options Dropdown (File + Kernel) */}
               <Dropdown 
                 trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Options <ChevronDown size={18} />
                   </button>
                 }
                 fullWidthMobile={true}
               >
                   {/* Nested on sm+, sectioned on max-sm */}
                   <div class="hidden sm:block">
                     <DropdownNested label={<div class="flex items-center gap-2"><Save size={18} /> File</div>}>
                         <DropdownItem onClick={() => {
                            const url = sessionManager.createNewSessionUrl();
                            window.open(url, '_blank');
                         }} shortcut="Alt+N">
                             <div class="flex items-center gap-2"><FileText size={18} /> New Notebook</div>
                         </DropdownItem>
                         <DropdownItem onClick={() => fileInput?.click()} shortcut="Ctrl+O">
                             <div class="flex items-center gap-2"><FolderOpen size={18} /> Open...</div>
                         </DropdownItem>
                         <DropdownItem onClick={handleSave} shortcut="Ctrl+S">
                             <div class="flex items-center gap-2"><Save size={18} /> Save</div>
                         </DropdownItem>
                         <DropdownItem onClick={handleSave} shortcut="Ctrl+E">
                             <div class="flex items-center gap-2"><Download size={18} /> Export .ipynb</div>
                         </DropdownItem>
                         <DropdownDivider />
                         <DropdownItem onClick={() => setShowPerformance(true)}>
                             <div class="flex items-center gap-2"><Activity size={18} /> Performance</div>
                         </DropdownItem>
                         <DropdownItem onClick={() => {
                             // Open tutorial in new tab
                             const url = `${window.location.origin}${window.location.pathname}?open=tutorial`;
                             window.open(url, '_blank');
                         }}>
                            <div class="flex items-center gap-2"><BookOpen size={18} /> Tutorial</div>
                         </DropdownItem>
                         <DropdownItem onClick={() => setShowShortcuts(true)} shortcut="Ctrl+/">
                             <div class="flex items-center gap-2"><Keyboard size={18} /> Shortcuts</div>
                         </DropdownItem>
                     </DropdownNested>
                     <DropdownNested label={<div class="flex items-center gap-2"><RotateCw size={18} /> Kernel</div>}>
                         <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Cell</div>
                         <DropdownItem 
                              onClick={runSelected}
                              disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                              shortcut="Shift+Enter"
                         >
                             <div class="flex items-center gap-2"><Play size={18} /> Run Selected</div>
                         </DropdownItem>
                         <DropdownItem 
                              onClick={clearSelectedOutput}
                              disabled={kernel.status !== "ready" || !notebookStore.activeCellId || (() => {
                                  const c = notebookStore.cells.find(c => c.id === notebookStore.activeCellId);
                                  return !c || !c.outputs;
                              })()}
                              shortcut="Alt+Backspace"
                         >
                             <div class="flex items-center gap-2"><X size={18} /> Clear Output</div>
                         </DropdownItem>
                         <DropdownItem 
                              onClick={deleteSelected}
                              disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                              shortcut="Ctrl+D"
                         >
                             <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete Cell</div>
                         </DropdownItem>

                         <DropdownDivider />
                         <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Notebook</div>
                         
                         <DropdownItem 
                              onClick={runAll} 
                              disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                              shortcut="Alt+R"
                         >
                             <div class="flex items-center gap-2"><Play size={18} /> Run All</div>
                         </DropdownItem>
                         <DropdownItem 
                              onClick={() => actions.clearAllOutputs()}
                              disabled={kernel.status !== "ready" || !notebookStore.cells.some(c => c.outputs)}
                              shortcut="Alt+C"
                         >
                             <div class="flex items-center gap-2"><X size={18} /> Clear All Outputs</div>
                         </DropdownItem>
                         <DropdownItem 
                              onClick={() => actions.deleteAllCells()}
                              disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                              shortcut="Alt+D"
                         >
                             <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete All Cells</div>
                         </DropdownItem>

                         <DropdownDivider />
                         <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Execution</div>
                         <DropdownItem onClick={() => actions.setExecutionMode("queue_all")}>
                             <div class="flex items-center gap-2">
                                 <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "queue_all" ? "bg-accent" : ""}`}></div>
                                 Sequential
                             </div>
                         </DropdownItem>
                         <DropdownItem onClick={() => actions.setExecutionMode("hybrid")}>
                             <div class="flex items-center gap-2">
                                 <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "hybrid" ? "bg-accent" : ""}`}></div>
                                 Hybrid
                             </div>
                         </DropdownItem>
                         <DropdownItem onClick={() => actions.setExecutionMode("direct")}>
                             <div class="flex items-center gap-2">
                                 <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "direct" ? "bg-accent" : ""}`}></div>
                                 Concurrent
                             </div>
                         </DropdownItem>

                         <DropdownDivider />
                         <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Session</div>

                         <DropdownItem onClick={() => { kernel.restart(); actions.resetExecutionState(); }} shortcut="Alt+K">
                             <div class="flex items-center gap-2 text-accent"><RotateCw size={18} /> Restart</div>
                         </DropdownItem>
                         <DropdownItem onClick={() => { kernel.terminate(); actions.resetExecutionState(); }} shortcut="Alt+Q">
                             <div class="flex items-center gap-2 text-primary"><StopCircle size={18} /> Shut Down</div>
                         </DropdownItem>
                     </DropdownNested>
                   </div>
                   {/* Sectioned layout on max-sm */}
                   <div class="block sm:hidden">
                     {/* File Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">File</div>
                     <DropdownItem onClick={() => {
                        const url = sessionManager.createNewSessionUrl();
                        window.open(url, '_blank');
                     }} shortcut="Alt+N">
                         <div class="flex items-center gap-2"><FileText size={18} /> New Notebook</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => fileInput?.click()} shortcut="Ctrl+O">
                         <div class="flex items-center gap-2"><FolderOpen size={18} /> Open...</div>
                     </DropdownItem>
                     <DropdownItem onClick={handleSave} shortcut="Ctrl+S">
                         <div class="flex items-center gap-2"><Save size={18} /> Save</div>
                     </DropdownItem>
                     <DropdownItem onClick={handleSave} shortcut="Ctrl+E">
                         <div class="flex items-center gap-2"><Download size={18} /> Export .ipynb</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => setShowPerformance(true)}>
                         <div class="flex items-center gap-2"><Activity size={18} /> Performance</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => {
                         // Open tutorial in new tab
                         const url = `${window.location.origin}${window.location.pathname}?open=tutorial`;
                         window.open(url, '_blank');
                     }}>
                         <div class="flex items-center gap-2"><BookOpen size={18} /> Tutorial</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => setShowShortcuts(true)} shortcut="Ctrl+/">
                         <div class="flex items-center gap-2"><Keyboard size={18} /> Shortcuts</div>
                     </DropdownItem>
                     <DropdownDivider />
                     {/* Kernel Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Kernel</div>
                     
                     <DropdownItem 
                          onClick={runSelected}
                          disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                          shortcut="Shift+Enter"
                     >
                         <div class="flex items-center gap-2"><Play size={18} /> Run Selected</div>
                     </DropdownItem>
                     <DropdownItem 
                          onClick={clearSelectedOutput}
                          disabled={kernel.status !== "ready" || !notebookStore.activeCellId || (() => {
                              const c = notebookStore.cells.find(c => c.id === notebookStore.activeCellId);
                              return !c || !c.outputs;
                              
                          })()}
                          shortcut="Alt+Backspace"
                     >
                         <div class="flex items-center gap-2"><X size={18} /> Clear Output</div>
                     </DropdownItem>
                     <DropdownItem 
                          onClick={deleteSelected}
                          disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                          shortcut="Ctrl+D"
                     >
                         <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete Cell</div>
                     </DropdownItem>

                     <DropdownDivider />

                     <DropdownItem 
                          onClick={runAll} 
                          disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                          shortcut="Alt+R"
                     >
                         <div class="flex items-center gap-2"><Play size={18} /> Run All</div>
                     </DropdownItem>
                     <DropdownItem 
                          onClick={() => actions.clearAllOutputs()}
                          disabled={kernel.status !== "ready" || !notebookStore.cells.some(c => c.outputs)}
                          shortcut="Alt+C"
                     >
                         <div class="flex items-center gap-2"><X size={18} /> Clear All Outputs</div>
                     </DropdownItem>
                     <DropdownItem 
                          onClick={() => actions.deleteAllCells()}
                          disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                          shortcut="Alt+D"
                     >
                         <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete All Cells</div>
                     </DropdownItem>

                     <DropdownDivider />
                     
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Execution</div>
                     <DropdownItem onClick={() => actions.setExecutionMode("queue_all")}>
                         <div class="flex items-center gap-2">
                             <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "queue_all" ? "bg-accent" : ""}`}></div>
                             Sequential
                         </div>
                     </DropdownItem>
                     <DropdownItem onClick={() => actions.setExecutionMode("hybrid")}>
                         <div class="flex items-center gap-2">
                             <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "hybrid" ? "bg-accent" : ""}`}></div>
                             Hybrid
                         </div>
                     </DropdownItem>
                     <DropdownItem onClick={() => actions.setExecutionMode("direct")}>
                         <div class="flex items-center gap-2">
                             <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "direct" ? "bg-accent" : ""}`}></div>
                             Concurrent
                         </div>
                     </DropdownItem>

                     <DropdownDivider />

                     <DropdownItem onClick={() => { kernel.restart(); actions.resetExecutionState(); }} shortcut="Alt+K">
                         <div class="flex items-center gap-2 text-accent"><RotateCw size={18} /> Restart</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => kernel.terminate()} shortcut="Alt+Q">
                         <div class="flex items-center gap-2 text-primary"><StopCircle size={18} /> Shut Down</div>
                     </DropdownItem>
                   </div>
               </Dropdown>

               {/* Actions Dropdown (Add + Undo/Redo) */}
               <Dropdown trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Actions <ChevronDown size={18} />
                   </button>
               }>
                   <DropdownItem onClick={() => {
                     const idx = (() => {
                       const activeId = notebookStore.activeCellId;
                       if (!activeId) return undefined;
                       const i = notebookStore.cells.findIndex(c => c.id === activeId);
                       if (i === -1) return undefined;
                       return i + 1;
                     })();
                     actions.addCell("code", idx);
                   }}>
                       <div class="flex items-center gap-2"><Code size={18} /> Add Code Cell</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => {
                     const idx = (() => {
                       const activeId = notebookStore.activeCellId;
                       if (!activeId) return undefined;
                       const i = notebookStore.cells.findIndex(c => c.id === activeId);
                       if (i === -1) return undefined;
                       return i + 1;
                     })();
                     actions.addCell("markdown", idx);
                   }}>
                       <div class="flex items-center gap-2"><FileText size={18} /> Add Markdown Cell</div>
                   </DropdownItem>
                   <DropdownDivider />
                   <DropdownItem 
                     onClick={handleUndo}
                     disabled={getUndoDisabled()}
                   >
                       <div class="flex items-center gap-2"><Undo2 size={16} /> Undo</div>
                   </DropdownItem>
                   <DropdownItem 
                     onClick={handleRedo}
                     disabled={getRedoDisabled()}
                   >
                       <div class="flex items-center gap-2"><Redo2 size={16} /> Redo</div>
                   </DropdownItem>
               </Dropdown>
             </div>
             
             <input ref={fileInput} type="file" accept=".ipynb" class="hidden" onChange={handleLoad} />
           </div>
  
           <div class="flex items-center gap-2 max-xs:flex-1 max-xs:justify-center">
             <div class={`text-xs font-mono py-1 rounded-sm flex items-center gap-2 ${
                 kernel.status === "ready" ? "text-green-500" :
                 (kernel.status === "loading" || kernel.status === "running") ? "text-yellow-500" :
                 "text-red-600"
             }`}>
               <div class={`w-2 h-2 rounded-full bg-current max-xs:-mr-1.5 ${ 
                   kernel.status === "running" || kernel.status === "loading" ? "animate-pulse" : "" 
               }`}></div>
               <span class="hidden sm:inline">{kernel.status.toUpperCase()}</span>
             </div>
           </div>
         </div>
       </div>

       <div class="max-w-208 mx-auto">
         {/* Cells List */}
         <DragDropProvider onDragStart={onDragStart} onDragEnd={onDragEnd} collisionDetector={closestCorners}>
           <AutoScroller />
           <DragDropSensors />
           <div class="px-4 max-xs:px-3">
             <For each={[notebookVersion()]}>
               {() => (
                 <SortableProvider ids={notebookStore.cells.map((c) => c.id)}>
                   <TransitionGroup name="cell-list">
                     <For each={notebookStore.cells}>
                       {(cell, index) => {
                         const prevCellId = () => index() > 0 ? notebookStore.cells[index() - 1].id : null;
                         return (
                           <Show 
                              when={cell.type === "code"} 
                              fallback={<MarkdownCell cell={cell} isActive={notebookStore.activeCellId === cell.id} index={index()} prevCellId={prevCellId()} />} 
                           >
                              <CodeCell cell={cell} isActive={notebookStore.activeCellId === cell.id} index={index()} prevCellId={prevCellId()} />
                           </Show>
                         );
                       }}
                     </For>
                   </TransitionGroup>
                 </SortableProvider>
               )}
             </For>
           </div>
           {/* Invisible DragOverlay for collision detection only */}
           <DragOverlay style={{ opacity: 0, "pointer-events": "none" }}>
             <Show when={draggedHeight()}>
               <div style={{ height: `${draggedHeight()}px`, width: "100%" }} />
             </Show>
           </DragOverlay>
           {/* Custom visual overlay that follows cursor */}
           <CustomDragOverlay height={draggedHeight()} grabOffsetX={grabOffsetX()} cellWidth={cellWidth()} />
         </DragDropProvider>
         
         {/* Bottom Add Buttons - Hidden in presentation mode */}
         <Show when={!notebookStore.presentationMode}>
           <div 
             class="flex justify-center gap-4 mt-8 opacity-50 hover:opacity-100 transition-opacity"
             onClick={(e) => e.stopPropagation()}
           >
             <button onClick={() => {
               const idx = (() => {
                 const activeId = notebookStore.activeCellId;
                 if (!activeId) return undefined;
                 const i = notebookStore.cells.findIndex(c => c.id === activeId);
                 if (i === -1) return undefined;
                 return i + 1;
               })();
               actions.addCell("code", idx);
             }} class="flex flex-row items-center gap-2 px-6 py-3 border-2 border-dashed border-foreground bg-background rounded-lg hover:border-accent hover:text-accent text-secondary transition-all shadow-sm">
                <Plus size={20} />
                <span class="text-sm font-bold">Code</span>
             </button>
             <button onClick={() => {
               const idx = (() => {
                 const activeId = notebookStore.activeCellId;
                 if (!activeId) return undefined;
                 const i = notebookStore.cells.findIndex(c => c.id === activeId);
                 if (i === -1) return undefined;
                 return i + 1;
               })();
               actions.addCell("markdown", idx);
             }} class="flex flex-row items-center gap-2 px-6 py-3 border-2 border-dashed border-foreground bg-background rounded-lg hover:border-accent hover:text-accent text-secondary transition-all shadow-sm">
                <Plus size={20} />
                <span class="text-sm font-bold">Text</span>
             </button>
           </div>
         </Show>
       </div>

       {/* Presentation Mode Exit Controls */}
       <Show when={notebookStore.presentationMode}>
         {/* Exit button - top right */}
         <button 
           onClick={() => actions.setPresentationMode(false)}
           class="fixed top-4 right-4 z-50 p-2 bg-background/80 backdrop-blur-md border border-foreground rounded-sm hover:bg-foreground transition-colors shadow-lg"
           title="Exit Presentation Mode"
         >
           <X size={20} class="text-secondary" />
         </button>
         
         {/* Hint message - bottom right */}
         <Show when={showEscHint()}>
           <div class="fixed bottom-4 right-4 z-50 px-4 py-2 bg-background/60 backdrop-blur-md border border-foreground/30 rounded-sm text-sm text-secondary/60 shadow-lg">
             Press Esc to exit
           </div>
         </Show>
       </Show>

       {/* Keyboard Shortcuts Modal */}
       <Show when={showShortcuts()}>
         <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm 2xl:hidden" onClick={() => setShowShortcuts(false)}>
           <div class="bg-background border border-foreground rounded-sm shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
             <div class="flex items-center justify-between p-4 border-b border-foreground shrink-0">
               <h2 class="text-lg font-bold flex items-center gap-2"><Keyboard /> Keyboard Shortcuts</h2>
               <button onClick={() => setShowShortcuts(false)} class="p-1 hover:bg-foreground rounded-sm">
                 <X size={20} />
               </button>
             </div>
             <div class="p-4 space-y-6 overflow-y-auto flex-1">
               
               <div>
                 <h3 class="text-sm font-bold text-accent uppercase mb-2">Global</h3>
                 <div class="grid grid-cols-2 gap-2 text-sm">
                   <For each={SHORTCUTS.global}>
                       {s => <><div class="text-secondary/80">{s.label}</div><div class="font-mono text-right">{s.keys}</div></>}
                   </For>
                 </div>
               </div>

               <div>
                 <h3 class="text-sm font-bold text-accent uppercase mb-2">Command Mode (Cell Selected)</h3>
                 <div class="grid grid-cols-2 gap-2 text-sm">
                   <For each={SHORTCUTS.command}>
                       {s => <><div class="text-secondary/80">{s.label}</div><div class="font-mono text-right">{s.keys}</div></>}
                   </For>
                 </div>
               </div>

               <div>
                 <h3 class="text-sm font-bold text-accent uppercase mb-2">Edit Mode</h3>
                 <div class="grid grid-cols-2 gap-2 text-sm">
                    <For each={SHORTCUTS.edit}>
                       {s => <><div class="text-secondary/80">{s.label}</div><div class="font-mono text-right">{s.keys}</div></>}
                   </For>
                 </div>
               </div>

             </div>
             <div class="p-4 border-t border-foreground text-center text-xs text-secondary/50 shrink-0">
               Click anywhere outside to close
             </div>
           </div>
         </div>
       </Show>

       {/* Side Shortcuts (Visible on 2xl screens) */}
       <Show when={showShortcuts() && !notebookStore.presentationMode}>
          <SideShortcuts 
            activeId={notebookStore.activeCellId} 
            isEditing={!!notebookStore.activeCellId && !!notebookStore.cells.find(c => c.id === notebookStore.activeCellId)?.isEditing} 
            onClose={() => setShowShortcuts(false)}
          />
       </Show>

       {/* Performance Monitor */}
       <Show when={showPerformance()}>
          <PerformanceMonitor onClose={() => setShowPerformance(false)} />
       </Show>
    </div>
  );
};

export default Notebook;
