import { createEffect } from "solid-js";
import { actions, notebookStore } from "./store";
import { kernel } from "./pyodide";

// How cells run: the store's execution queue plus reactive mode's
// bookkeeping (which cell owns which variable, dependency analysis, deleting
// a removed definition and everything downstream of it). The notebook uses it,
// and so do cells embedded in other pages by the pynote package.
//
// Call it inside a reactive owner (a component, or createRoot): it sets up
// effects that follow the execution mode and the kernel's status.
export function createExecution() {
  const executeRunner = async (content: string, id: string) => {
      // In reactive mode, extract definitions and sync ownership BEFORE executing
      if (notebookStore.executionMode === "reactive") {
          const result = await kernel.lint(content, true);
          if (result.definitions) {
              const defNames = result.definitions.map((d: any) => d.name);
              await syncOwnership(id, defNames);
          }
      }
      
      await kernel.run(content, (result) => {
          actions.updateCellOutput(id, result);
      });
  };

  const runCell = (id: string) => {
    // Pass analyzeCell for reactive mode JIT analysis
    actions.runCell(id, executeRunner, analyzeCell);
  };

  // --- Strict Reactive Mode Logic ---
  const variableOwnership = new Map<string, string>();

  // Remove variables from the kernel's namespace. One statement per line: a
  // compound `try` cannot be followed by `except` on the same line.
  const deleteVariables = (names: Iterable<string>) =>
      Promise.all(Array.from(names, (v) => kernel.run(`try: del ${v}\nexcept: pass`)));

  // Cascade delete: remove variables and all downstream variables that depend on them
  const cascadeDeleteVariables = async (deletedVars: Set<string>) => {
      if (deletedVars.size === 0) return;
      
      // Delete the initial set of variables
      for (const v of deletedVars) variableOwnership.delete(v);
      await deleteVariables(deletedVars);
      
      // Find all cells that reference these deleted variables
      const cellsToInvalidate = new Set<string>();
      for (const cell of notebookStore.cells) {
          if (cell.type !== "code") continue;
          const deps = notebookStore.cellDependencies.get(cell.id);
          if (deps && deps.references) {
              for (const deletedVar of deletedVars) {
                  if (deps.references.has(deletedVar)) {
                      cellsToInvalidate.add(cell.id);
                      break;
                  }
              }
          }
      }
      
      // Collect variables defined by those cells for recursive deletion
      const nextToDelete = new Set<string>();
      for (const cellId of cellsToInvalidate) {
          for (const [v, owner] of variableOwnership.entries()) {
              if (owner === cellId) {
                  nextToDelete.add(v);
              }
          }
      }
      
      // Recursively delete downstream dependent variables
      if (nextToDelete.size > 0) {
          await cascadeDeleteVariables(nextToDelete);
      }
  };

  const syncOwnership = async (cellId: string, definitions: string[]) => {
      if (notebookStore.executionMode !== "reactive") return;
      
      const currentOwned = new Set<string>();
      for (const [v, owner] of variableOwnership.entries()) {
          if (owner === cellId) currentOwned.add(v);
      }
      
      const newDefs = new Set(definitions);
      
      // Identify removed variables
      const removedVars = new Set<string>();
      for (const v of currentOwned) {
          if (!newDefs.has(v)) {
              removedVars.add(v);
          }
      }
      
      // Cascade delete removed variables and all downstream dependents
      await cascadeDeleteVariables(removedVars);
      
      // Register new variables
      for (const v of newDefs) {
          if (!variableOwnership.has(v) || variableOwnership.get(v) === cellId) {
             variableOwnership.set(v, cellId);
          }
      }
  };

  const getRedefinitionChecker = (cellId: string) => {
      // If NOT in strict reactive mode, return undefined
      // This signals downstream components (Linter) to disable expensive AST scans
      if (notebookStore.executionMode !== "reactive") return undefined;

      return (definitions: {name: string, line: number, col: number}[]) => {
          // Only check for conflicts - don't sync ownership (that happens on execution)
          const conflicts: {name: string, line: number, col: number}[] = [];
          for (const d of definitions) {
              const owner = variableOwnership.get(d.name);
              if (owner && owner !== cellId) {
                 conflicts.push(d);
              }
          }
          return conflicts;
      };
  };

  // --- Reactive Execution Mode: Cell Analysis ---
  
  // Analyze a single cell and update its dependencies
  const analyzeCell = async (cellId: string, content: string) => {
    if (kernel.status === "loading") return; // Wait for kernel
    
    const result = await kernel.analyzeCell(cellId, content);
    actions.setCellDependencies(cellId, result.definitions, result.references);
    
    // Sync strict ownership
    syncOwnership(cellId, result.definitions);
  };

  // Analyze all code cells (called when switching to reactive mode)
  const analyzeAllCells = async () => {
    if (kernel.status === "loading") {
      // Will be called again when kernel is ready
      return;
    }
    
    // Clear ownership map on full re-analysis
    variableOwnership.clear();
    
    const codeCells = notebookStore.cells.filter(c => c.type === "code");
    
    // Analyze all cells in parallel for speed
    await Promise.all(
      codeCells.map(cell => 
        kernel.analyzeCell(cell.id, cell.content).then(result => {
          actions.setCellDependencies(cell.id, result.definitions, result.references);
          // Sync ownership (order might be random due to parallel, but key/value pairs remain 1:1 consistent per cell)
          // However, if two cells define same variable, race condition determines "owner".
          // In strict mode, user should fix this anyway.
          syncOwnership(cell.id, result.definitions);
        })
      )
    );
    
    actions.setDependenciesStale(false);
  };

  // Watch for mode changes to reactive - analyze all cells
  createEffect(() => {
    if (notebookStore.executionMode === "reactive" && notebookStore.dependenciesStale) {
      analyzeAllCells();
    }
  });

  // Watch for kernel ready when in reactive mode with stale dependencies
  createEffect(() => {
    const status = kernel.status;
    if (status === "ready" && notebookStore.executionMode === "reactive" && notebookStore.dependenciesStale) {
      analyzeAllCells();
    }
  });

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
    const codeCells = notebookStore.cells.filter(c => c.type === "code");
    
    // In reactive mode, analyze first to ensure dependencies are fresh
    if (notebookStore.executionMode === "reactive") {
      await analyzeAllCells();
    }
    
    // Run all cells - the queue logic handles ordering
    // In reactive mode, downstream cells get auto-queued
    // The isQueued guard in runCell prevents duplicate runs
    for (const cell of codeCells) {
      runCell(cell.id);
    }
  };

  // A variable exists only while the cell defining it does. However a cell
  // goes away (shortcut, the cell's delete button, menus, the mobile drawer,
  // Delete All, opening another notebook), its definitions are removed like
  // definitions deleted from a cell: with everything downstream of them.
  const cleanupCellVariables = (cellId: string) => {
      if (notebookStore.executionMode !== "reactive") return;
      const owned = new Set<string>();
      for (const [v, owner] of variableOwnership.entries()) {
          if (owner === cellId) owned.add(v);
      }
      void cascadeDeleteVariables(owned);
  };

  let knownCells = new Set(notebookStore.cells.map((c) => c.id));
  createEffect(() => {
      const current = new Set(notebookStore.cells.map((c) => c.id));
      for (const id of knownCells) if (!current.has(id)) cleanupCellVariables(id);
      knownCells = current;
  });

  return { executeRunner, runCell, runAll, analyzeCell, analyzeAllCells, getRedefinitionChecker };
}
