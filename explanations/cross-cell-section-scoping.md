# Cross-Cell Section Scoping: A Reactive Chain Approach

## The Problem

In PyNote, markdown cells can contain headers (`#`, `##`, `###`, etc.) that define "sections." We wanted each section to have a distinct accent color, creating visual continuity across cells. The challenge: **how do we efficiently propagate section context from one cell to the next?**

For example:
```
[Cell 1: Markdown]  # Introduction     → Section level 1 (color A)
[Cell 2: Code]      print("hello")     → Inherits level 1 (color A)
[Cell 3: Markdown]  ## Details         → Section level 2 (color B)
[Cell 4: Code]      x = 42             → Inherits level 2 (color B)
```

## Approaches Considered

### ❌ Approach 1: Global Recalculation
Recalculate all cells' section levels whenever any cell changes.

```typescript
// On any cell change:
function recalculateAllSections() {
  let level = 0;
  for (const cell of cells) {
    cell.sectionLevel = level;
    level = getExitLevel(cell, level);
  }
}
```

**Problems:**
- O(n) on every keystroke
- Triggers re-renders for ALL cells even if only one changed
- Fights against SolidJS's fine-grained reactivity

### ❌ Approach 2: Event-Based Propagation
Each cell emits an event when its section level changes, and the next cell listens.

```typescript
cell.on('sectionLevelChanged', (newLevel) => {
  nextCell.setEntryLevel(newLevel);
});
```

**Problems:**
- Complex event wiring/unwiring on cell reorder
- Memory leak potential
- Imperative code in a declarative framework

### ✅ Approach 3: Reactive Chain (What We Built)

Each cell simply **reads** its previous cell's exit level from the store. SolidJS reactivity handles the rest.

## The Solution

### Key Insight
Instead of pushing data forward, let each cell **pull** from its predecessor. SolidJS's fine-grained reactivity means a cell only re-renders when the specific value it depends on changes.

### Implementation

**1. Store Structure**
```typescript
// In store.ts
interface CellData {
  id: string;
  content: string;
  exitSectionLevel?: number;  // The section level when leaving this cell
  // ...
}
```

**2. Pass Previous Cell ID as Prop**
```tsx
// In Notebook.tsx
<For each={store.cells}>
  {(cell, index) => (
    <CellWrapper
      cell={cell}
      prevCellId={index() > 0 ? store.cells[index() - 1].id : undefined}
    />
  )}
</For>
```

**3. Cell Reads Previous Cell's Exit Level**
```tsx
// In CellWrapper.tsx
const CellWrapper: Component<Props> = (props) => {
  // Reactively read the previous cell's exit level
  const entryLevel = createMemo(() => {
    if (!props.prevCellId) return 0;
    const prevCell = store.cells.find(c => c.id === props.prevCellId);
    return prevCell?.exitSectionLevel ?? 0;
  });

  // Calculate this cell's exit level based on its content
  const exitLevel = createMemo(() => {
    return calculateExitLevel(props.cell.content, entryLevel());
  });

  // Update store when exit level changes
  createEffect(() => {
    actions.setCellExitLevel(props.cell.id, exitLevel());
  });

  // Use entryLevel() for theming
  return (
    <div class={`section-level-${entryLevel()}`}>
      {/* cell content */}
    </div>
  );
};
```

## Why This Works Best for SolidJS

### 1. Fine-Grained Reactivity
SolidJS tracks dependencies at the signal level. When Cell 3's `exitSectionLevel` changes:
- Only Cell 4's `entryLevel` memo re-runs
- Cell 1 and Cell 2 are completely untouched
- No virtual DOM diffing needed

### 2. O(1) Propagation per Change
Each cell only depends on ONE value (its predecessor's exit level). A change propagates through the chain cell-by-cell, but each step is O(1).

```
Cell 1 changes → Cell 2 reacts → Cell 3 reacts → Cell 4 reacts
     O(1)            O(1)            O(1)            O(1)
```

In practice, only cells **after** the edit re-evaluate, and they stop as soon as the level stabilizes (usually immediately).

### 3. Automatic Cleanup
No manual event subscription/unsubscription. SolidJS's reactive graph handles it. When cells are deleted or reordered, the `prevCellId` prop changes and reactivity "just works."

### 4. Declarative, Not Imperative
The relationship is declared once: "my entry level is my previous cell's exit level." No imperative code to manage state synchronization.

## Visual Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        REACTIVE CHAIN                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Cell 1  │    │  Cell 2  │    │  Cell 3  │    │  Cell 4  │  │
│  │          │    │          │    │          │    │          │  │
│  │ entry: 0 │    │ entry: 1 │    │ entry: 1 │    │ entry: 2 │  │
│  │ # Title  │───▶│ code...  │───▶│ ## Sub   │───▶│ code...  │  │
│  │ exit: 1  │    │ exit: 1  │    │ exit: 2  │    │ exit: 2  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │               │               │               │        │
│       ▼               ▼               ▼               ▼        │
│   [Color A]       [Color A]       [Color B]       [Color B]    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

  When Cell 3 content changes from "## Sub" to "# New":
  
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  Cell 1  │    │  Cell 2  │    │  Cell 3  │    │  Cell 4  │
  │ (no change)   │ (no change)   │ exit: 1  │───▶│ entry: 1 │
  │          │    │          │    │ (changed)│    │ (reacts) │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Single cell edit | O(k) | k = cells after the edit that need to re-evaluate |
| Typical edit | O(1) | Most edits don't change section level |
| Add cell at end | O(1) | Only new cell evaluates |
| Delete cell | O(k) | Subsequent cells re-evaluate |
| Reorder cells | O(k) | Affected chain segment re-evaluates |

## Key Takeaway

> **Let the framework do the work.** Instead of building complex synchronization logic, we declared the relationship between cells and let SolidJS's reactivity propagate changes automatically.

This is the "SolidJS way" — fine-grained reactivity with minimal re-renders, achieved through simple, declarative code.
