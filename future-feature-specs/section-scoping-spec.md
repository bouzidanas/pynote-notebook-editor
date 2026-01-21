# Cross-Cell Section Scoping Specification

## Objective
Enhance the "Section Scoping" feature to work across individual notebook cells. Currently, elements (like bold text, bullets, quotes) inherit the color of the *nearest preceding header* only if that header exists within the *same* cell. The goal is to allow elements to inherit the color of the "active section header" even if that header is located in a previous cell.

## Current Limitation
- **Scope:** Per-cell only.
- **Mechanism:** 
  - *View Mode:* `marked` parser wraps content between headers in `<div>`s with CSS variable overrides.
  - *Edit Mode:* ProseMirror plugin applies `style` decorations to nodes based on preceding headers in the same document fragment.
- **Problem:** If Cell 1 contains `# Header 1` and Cell 2 contains `**Bold Text**`, Cell 2 has no knowledge of Cell 1's header, so `**Bold Text**` uses the default global primary color instead of the H1 color.

## Proposed Solution

### 1. Global Section State
We need a mechanism to track the "current active header level" and "current active header index/color" as we iterate through the list of cells.

- **Store Update:** The `Notebook` component or a dedicated store selector needs to map the linear sequence of cells to a "context-aware" list.
- **Context Object:** Each cell should receive a `context` prop (or similar) containing:
  - `inheritedHeaderLevel`: The level of the last header found in previous cells (H1-H4).
  - `inheritedHeaderColor`: The computed color variable (e.g., `var(--header-color-1)`) active at the start of this cell.

### 2. Cell Rendering Logic

#### A. View Mode (`MarkdownCell.tsx`)
- The `MarkdownCell` needs to accept an `inheritedHeaderLevel` prop.
- **Initial State:** When parsing begins, if the cell content doesn't start with a header, the parser should immediately wrap the initial content in a `<div class="section-scope" data-level="{inheritedHeaderLevel}">`.
- **Transition:** When a new header is encountered within the cell, the wrapping logic proceeds as currently implemented (closing the previous div, opening a new one).

#### B. Edit Mode (`MarkdownEditor.tsx` / `sectionScopePlugin.ts`)
- The `sectionScopePlugin` needs to accept the `inheritedHeaderLevel` configuration.
- **Plugin State:** The plugin currently initializes `currentLevel = 0`. It should instead initialize `currentLevel` based on the passed prop.
- **Dynamic Updates:** This is tricky because ProseMirror plugins are usually isolated. We might need to:
  - Pass the context via `Editor.config(ctx => ctx.set(sectionContextKey, ...))`.
  - Or reconfigure the plugin when the prop changes.

### 3. Notebook-Level Calculation
In `Notebook.tsx`, we need a memoized computation that traverses `notebookStore.cells` to determine the starting context for each cell.

**Algorithm:**
```typescript
let currentHeaderLevel = 0;
const cellContexts = notebookStore.cells.map(cell => {
  const context = { startLevel: currentHeaderLevel };
  
  // Scan cell content for *last* header to update state for NEXT cell
  // This might be expensive if done on every render.
  // Optimization: Store 'lastHeaderLevel' in cell metadata when updating cell content?
  const lastHeader = findLastHeader(cell.content);
  if (lastHeader) {
    currentHeaderLevel = lastHeader.level;
  }
  
  return context;
});
```

### 4. Metadata Optimization (Recommended)
To avoid re-scanning all cell strings on every render:
- When `updateCell` is called, parse the content (lightweight regex) to find the *last* header level defined in that cell.
- Store this `lastHeaderLevel` in the cell's data model (`CellData`).
- The Notebook can then cheaply reduce this array to calculate the running context.

## Implementation Steps Plan

1.  **Update Cell Data Model:** Add `lastHeaderLevel?: number` to `CellData`.
2.  **Update Store Actions:** Modify `updateCell` to regex-scan for the last `#` header and update `lastHeaderLevel`.
3.  **Compute Context:** In `Notebook.tsx`, creating a derived signal `cellContexts` that maps `cells` -> `inheritedLevel`.
4.  **Update Components:**
    - Pass `inheritedLevel` to `MarkdownCell`.
    - Pass `inheritedLevel` to `MarkdownEditor` (and propagates to plugin).
5.  **Refactor Logic:**
    - **View:** Update `marked` loop to use `inheritedLevel` as initial state.
    - **Edit:** Update plugin to read initial state from configuration or props.

## Edge Cases
- **Deleted Cells:** Deleting a cell with a header should trigger a re-calc for all following cells.
- **Moving Cells:** Drag-and-drop should trigger re-calc.
- **Nested Headers:** H2 following H1 should use H2 color. H1 following H2 should reset to H1.
