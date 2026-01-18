import { type Component, For, Show, createSignal, onCleanup, createEffect, onMount } from "solid-js";
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCorners, useDragDropContext } from "@thisbeyond/solid-dnd";
import { notebookStore, actions, defaultCells } from "../lib/store";
import CodeCell from "./CodeCell";
import MarkdownCell from "./MarkdownCell";
import { Plus, Code, FileText, ChevronDown, StopCircle, RotateCw, Save, FolderOpen, Download, Undo2, Redo2, X, Eye } from "lucide-solid";
import { kernel } from "../lib/pyodide";
import Dropdown, { DropdownItem, DropdownNested, DropdownDivider } from "./ui/Dropdown";

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

  // --- Internal Autosave Mechanism ---
  const AUTOSAVE_KEY = "pynote-autosave";

  // Save notebook state to localStorage (internal, not user-controlled)
  function autosaveNotebook() {
    // Only save essential notebook state (cells, filename, history, historyIndex)
    // Always set isEditing to false for all cells before saving
    const data = {
      cells: notebookStore.cells.map(cell => ({ ...cell, isEditing: false })),
      filename: notebookStore.filename,
      history: notebookStore.history,
      historyIndex: notebookStore.historyIndex
    };
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    } catch (e) {
      // Ignore quota errors, etc.
    }
  }

  // Restore notebook state from localStorage (if present)
  function restoreNotebook() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.cells)) {
        actions.loadNotebook(
          data.cells,
          data.filename || "Untitled.ipynb",
          data.history || []
        );
        // Restore history index if present
        if (typeof data.historyIndex === "number") {
          notebookStore.historyIndex = data.historyIndex;
        }
        return true;
      }
    } catch (e) {
      // Ignore parse errors
    }
    return false;
  }


  // On mount, restore autosaved notebook if present, else load default cells
  onMount(() => {
    const restored = restoreNotebook();
    if (!restored) {
      actions.loadNotebook([...defaultCells], "Untitled.ipynb", []);
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
          actions.loadNotebook(newCells, file.name, history);
          autosaveNotebook();
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
         <div class="max-w-202 mx-auto px-7.5 max-xs:px-6.5 py-4 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
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
                   <DropdownItem onClick={() => { actions.loadNotebook([], "Untitled.ipynb"); autosaveNotebook(); }}> 
                       <div class="flex items-center gap-2"><FileText size={18} /> New Notebook</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => fileInput?.click()}>
                       <div class="flex items-center gap-2"><FolderOpen size={18} /> Open...</div>
                   </DropdownItem>
                   <DropdownItem onClick={handleSave}>
                       <div class="flex items-center gap-2"><Save size={18} /> Save</div>
                   </DropdownItem>
                   <DropdownItem onClick={handleSave}>
                       <div class="flex items-center gap-2"><Download size={18} /> Export .ipynb</div>
                   </DropdownItem>
                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Modes</div>
                   <DropdownItem onClick={() => actions.setPresentationMode(true)}>
                       <div class="flex items-center gap-2"><Eye size={18} /> Presentation</div>
                   </DropdownItem>
               </Dropdown>
    
               {/* Kernel Menu */}
               <Dropdown trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Kernel <ChevronDown size={18} />
                   </button>
               }>
                   <DropdownItem onClick={() => kernel.restart()}>
                       <div class="flex items-center gap-2 text-accent"><RotateCw size={18} /> Restart</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => kernel.terminate()}>
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
                 onClick={() => actions.undo()} 
                 class="btn-toolbar flex items-center gap-1" 
                 title="Undo"
                 disabled={notebookStore.historyIndex < 0}
                 classList={{ "opacity-50 cursor-not-allowed": notebookStore.historyIndex < 0 }}
               >
                 <Undo2 size={20} />
               </button>
               <button 
                 onClick={() => actions.redo()} 
                 class="btn-toolbar flex items-center gap-1" 
                 title="Redo"
                 disabled={notebookStore.historyIndex >= notebookStore.history.length - 1}
                 classList={{ "opacity-50 cursor-not-allowed": notebookStore.historyIndex >= notebookStore.history.length - 1 }}
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
                   {/* Nested on xs+, sectioned on max-xs */}
                   <div class="hidden xs:block">
                     <DropdownNested label={<div class="flex items-center gap-2"><Save size={18} /> File</div>}>
                         <DropdownItem onClick={() => actions.loadNotebook([], "Untitled.ipynb")}>
                             <div class="flex items-center gap-2"><FileText size={18} /> New Notebook</div>
                         </DropdownItem>
                         <DropdownItem onClick={() => fileInput?.click()}>
                             <div class="flex items-center gap-2"><FolderOpen size={18} /> Open...</div>
                         </DropdownItem>
                         <DropdownItem onClick={handleSave}>
                             <div class="flex items-center gap-2"><Save size={18} /> Save</div>
                         </DropdownItem>
                         <DropdownItem onClick={handleSave}>
                             <div class="flex items-center gap-2"><Download size={18} /> Export .ipynb</div>
                         </DropdownItem>
                     </DropdownNested>
                     <DropdownNested label={<div class="flex items-center gap-2"><RotateCw size={18} /> Kernel</div>}>
                         <DropdownItem onClick={() => kernel.restart()}>
                             <div class="flex items-center gap-2 text-accent"><RotateCw size={18} /> Restart</div>
                         </DropdownItem>
                         <DropdownItem onClick={() => kernel.terminate()}>
                             <div class="flex items-center gap-2 text-primary"><StopCircle size={18} /> Shut Down</div>
                         </DropdownItem>
                     </DropdownNested>
                   </div>
                   {/* Sectioned layout on max-xs */}
                   <div class="block xs:hidden">
                     {/* File Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">File</div>
                     <DropdownItem onClick={() => actions.loadNotebook([], "Untitled.ipynb")}>
                         <div class="flex items-center gap-2"><FileText size={18} /> New Notebook</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => fileInput?.click()}>
                         <div class="flex items-center gap-2"><FolderOpen size={18} /> Open...</div>
                     </DropdownItem>
                     <DropdownItem onClick={handleSave}>
                         <div class="flex items-center gap-2"><Save size={18} /> Save</div>
                     </DropdownItem>
                     <DropdownItem onClick={handleSave}>
                         <div class="flex items-center gap-2"><Download size={18} /> Export .ipynb</div>
                     </DropdownItem>
                     <DropdownDivider />
                     {/* Kernel Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Kernel</div>
                     <DropdownItem onClick={() => kernel.restart()}>
                         <div class="flex items-center gap-2 text-accent"><RotateCw size={18} /> Restart</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => kernel.terminate()}>
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
                     onClick={() => actions.undo()}
                     disabled={notebookStore.historyIndex < 0}
                   >
                       <div class="flex items-center gap-2"><Undo2 size={16} /> Undo</div>
                   </DropdownItem>
                   <DropdownItem 
                     onClick={() => actions.redo()}
                     disabled={notebookStore.historyIndex >= notebookStore.history.length - 1}
                   >
                       <div class="flex items-center gap-2"><Redo2 size={16} /> Redo</div>
                   </DropdownItem>
               </Dropdown>
             </div>
             
             <input ref={fileInput} type="file" accept=".ipynb" class="hidden" onChange={handleLoad} />
           </div>
  
           <div class="flex items-center gap-2">
             <div class={`text-xs font-mono py-1 rounded-sm flex items-center gap-2 ${
                 kernel.status === "ready" ? "text-green-500" :
                 (kernel.status === "loading" || kernel.status === "running") ? "text-yellow-500" :
                 "text-red-600"
             }`}>
               <div class={`w-2 h-2 rounded-full bg-current ${ 
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
             <SortableProvider ids={notebookStore.cells.map((c) => c.id)}>
               <For each={notebookStore.cells}>
                 {(cell, index) => (
                   <Show 
                      when={cell.type === "code"} 
                      fallback={<MarkdownCell cell={cell} isActive={notebookStore.activeCellId === cell.id} index={index()} />} 
                   >
                      <CodeCell cell={cell} isActive={notebookStore.activeCellId === cell.id} index={index()} />
                   </Show>
                 )}
               </For>
             </SortableProvider>
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
    </div>
  );
};

export default Notebook;
