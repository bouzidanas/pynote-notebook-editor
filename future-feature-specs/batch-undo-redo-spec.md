# Batch Undo/Redo System Specification

## Problem Statement

The global undo/redo history system records each action as a separate entry. This works well for most scenarios but creates poor UX for bulk operations:

- **Delete All Cells**: Undoing requires N separate undo operations (one per cell)
- **Stress Test (50 cells)**: Adding 50 cells requires 50 undo operations to reverse
- **Any rapid bulk operation**: Each constituent action is individually undoable

### Why Not Always Batch?

Some rapid actions should remain separate:
- **Add cell + enter edit mode** (via shortcut): The addition and the edit should be separately undoable
- **Quick successive manual edits**: User expects each deliberate action to be reversible

## Implemented Solution: Transaction Wrapper (Option 2)

Wrap batch operations in explicit transaction boundaries:

```typescript
actions.beginBatch();
ids.forEach(id => actions.deleteCell(id));
actions.endBatch();
```

### How It Works

1. `beginBatch()` sets a batching flag and starts collecting entries into a temporary array
2. Normal actions (deleteCell, addCell, etc.) detect the flag and push to the temp array instead of main history
3. `endBatch()` merges all collected entries into a **single compound entry** (`b|[entry1, entry2, ...]`)
4. Undo/redo processes all sub-entries atomically (in reverse order for undo)

### Pros
- Clean API with explicit boundaries
- Doesn't change existing action signatures
- Caller has full control over batching scope
- Easy to understand and debug

### Cons
- Caller must remember to call both begin/end (could use try/finally)
- Nesting batches requires additional logic

---

## Alternative Options (Not Implemented)

### Option 1: Group ID in History Entries

Add a `groupId` field to history entries:

```typescript
// Entry format: "a|0|code|uuid|group:abc123"
actions.deleteCell(id, { groupId: "delete-all-op" });
```

**Undo behavior**: Keep undoing while entries share the same `groupId`.

**Pros:**
- Flexible, opt-in per action
- No wrapper calls needed

**Cons:**
- Requires modifying all action signatures
- Group ID must be generated and passed around
- Parsing complexity increases

---

### Option 3: Compound Action Types

Create dedicated bulk action methods:

```typescript
actions.deleteAllCells();  // Creates: "D|[{idx,type,id,content}, ...]"
actions.addManyCells(50);  // Creates: "A|[{idx,type,id}, ...]"
```

**Pros:**
- Semantic clarity
- Optimal storage (no redundant metadata)

**Cons:**
- Requires new methods for each bulk operation
- New undo/redo handlers for each compound type
- Less flexible for ad-hoc batching

---

### Option 4: Time-Based Debounce/Coalesce

Automatically merge rapid successive actions:

```typescript
// If 5+ deletes occur within 100ms, merge into one entry
const BATCH_THRESHOLD_MS = 100;
const BATCH_MIN_COUNT = 5;
```

**Pros:**
- Fully automatic, no API changes

**Cons:**
- Unpredictable behavior
- Could accidentally merge unrelated actions
- Hard to explain to users why sometimes undo is batched

---

### Option 5: Flag Parameter on Actions

Add optional `batch` parameter to each action:

```typescript
actions.deleteCell(id, { batch: "delete-all" });  // Grouped
actions.deleteCell(id);  // Normal, separate entry
```

**Implementation**: Could use either groupId (Option 1) or transaction mode internally.

**Pros:**
- Explicit opt-in preserves default behavior
- Maximum flexibility

**Cons:**
- Every action signature needs optional parameter
- Batch key management at call sites

---

## Decision Matrix

| Requirement                      | Option 1 | Option 2 | Option 3 | Option 4 | Option 5 |
|----------------------------------|----------|----------|----------|----------|----------|
| Delete all = 1 undo              | ✅       | ✅       | ✅       | ✅       | ✅       |
| Stress test = 1 undo             | ✅       | ✅       | ✅       | ✅       | ✅       |
| Add + edit = 2 separate undos    | ✅       | ✅       | ✅       | ⚠️       | ✅       |
| Minimal API changes              | ❌       | ✅       | ❌       | ✅       | ❌       |
| Predictable behavior             | ✅       | ✅       | ✅       | ❌       | ✅       |
| No wrapper/flag at call sites    | ❌       | ❌       | ✅       | ✅       | ❌       |

---

## Migration Path

If we decide to switch from Option 2 to Option 5 later:

1. Keep the `beginBatch()`/`endBatch()` API for backward compatibility
2. Add optional `{ batch: string }` parameter to actions
3. Internally, both approaches can share the same batching infrastructure
4. Deprecate wrapper API if flag approach proves cleaner

## Usage Examples (Current Implementation)

```typescript
// Delete all cells as one undoable action
const deleteAllCells = () => {
  actions.beginBatch();
  try {
    const ids = store.cells.map(c => c.id);
    ids.forEach(id => actions.deleteCell(id));
  } finally {
    actions.endBatch();
  }
};

// Stress test: add 50 cells as one undoable action
const stressTest = () => {
  actions.beginBatch();
  try {
    for (let i = 0; i < 50; i++) {
      actions.addCell("code");
    }
  } finally {
    actions.endBatch();
  }
};

// Normal add + edit: two separate undo operations (no batching)
const addAndEdit = () => {
  actions.addCell("code");  // Entry 1
  // User edits...           // Entry 2 (when edit session ends)
};
```
