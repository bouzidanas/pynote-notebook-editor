# State Management

State management in PyNote is distributed between the Frontend (Application State) and the Backend (Kernel State).

## Frontend State (SolidJS Store)

Managed in `src/lib/store.ts` using SolidJS `createStore`.

### Core Data Structures

*   **Cells:** Array of `CellData` objects.
    *   `id`: UUIDv4
    *   `content`: Source code
    *   `outputs`: Execution results (stdout, stderr, mimebundles)
    *   `isEditing`, `isRunning`, `isQueued`: UI flags
*   **Execution Queue:** A list of Cell IDs waiting to run (supports sequential execution).
*   **History:** A compact action log for Undo/Redo functionality.

### Actions

State mutations are encapsulated in the `actions` object.
*   `executeCell(id)`: Handles the complex lifecycle of running a cell:
    1.  Sets `isRunning` flag.
    2.  **Clears old Kernel State** (`kernel.clearCellState`).
    3.  **Sets new Kernel Context** (`kernel.setCellContext`).
    4.  Runs code via `kernel.run`.
    5.  Updates `outputs`.
    6.  Triggers the next cell in the queue.

## Backend State (Python StateManager)

Managed in `packages/pynote_ui/src/pynote_ui/core.py`.

The `StateManager` class is a singleton that acts as the source of truth for all active UI components.

### Garbage Collection (GC) Strategy

To prevent memory leaks in a long-running notebook session, `StateManager` implements a cell-scoped tracking mechanism:

1.  **Registry:** `_instances_by_cell` maps a `cell_id` to a list of Component UUIDs created within that cell.
2.  **Context Switching:** When `set_current_cell(id)` is called, the manager knows which cell owns any subsequently created objects.
3.  **Pruning:** When `clear_cell(id)` is called (typically before re-running a cell), the manager:
    *   Lookups all UUIDs associated with that cell.
    *   Deletes the instances from the main `_instances` registry.
    *   Removes the entry from `_instances_by_cell`.

This ensures that if you run `slider = Slider()` 100 times in the same cell, you don't end up with 100 orphaned Slider objects in memory.
