# SolidJS Pattern: "Do X When Y Becomes Available"

## The Problem

In SolidJS, you often need to perform an action when some resource becomes available asynchronously. Common scenarios:

- A DOM element reference becomes available after render
- An external library initializes (e.g., CodeMirror editor view)
- Data arrives from an async fetch
- A signal transitions from `undefined`/`null` to a valid value

Unlike React's `useEffect` with dependencies, SolidJS effects automatically track reactive dependencies and re-run when they change.

## The Pattern

```typescript
import { createEffect } from "solid-js";

// Track if we've already performed our one-time action
let hasActed = false;

createEffect(() => {
  const resource = someSignal();  // This is tracked automatically
  
  // Guard: only act when resource is available AND we haven't acted yet
  if (resource && !hasActed) {
    doSomethingWith(resource);
    hasActed = true;  // Prevent re-execution
  }
});
```

### How It Works

1. **First run**: Effect executes immediately. `someSignal()` returns `undefined`. Condition fails, nothing happens. But SolidJS now knows this effect depends on `someSignal`.

2. **Signal updates**: When `someSignal` gets a value, SolidJS automatically re-runs the effect.

3. **Second run**: `resource` is now truthy, `hasActed` is still false. Action executes. `hasActed` becomes true.

4. **Future runs**: If signal changes again, effect re-runs but `hasActed` prevents duplicate execution.

## Why Use a Guard Flag?

Without `hasActed`, the action would run every time the signal changes:

```typescript
// ❌ BAD: Runs multiple times if signal updates
createEffect(() => {
  const resource = someSignal();
  if (resource) {
    doSomethingWith(resource);  // Called again if signal changes!
  }
});

// ✅ GOOD: Runs exactly once when resource becomes available
let hasActed = false;
createEffect(() => {
  const resource = someSignal();
  if (resource && !hasActed) {
    doSomethingWith(resource);
    hasActed = true;
  }
});
```

## Examples from This Project

### Example 1: Reporting Initial Editor Position

**File:** `src/components/CodeEditor.tsx`

**Problem:** When a new code cell is created, we need to record the CodeMirror history position for undo/redo tracking. But the `editorView` signal is `undefined` until CodeMirror finishes initializing asynchronously.

```typescript
// Track if we've reported the initial entry position
let initialPositionReported = false;

// Report initial entry position when view becomes available AND we're in edit mode
createEffect(() => {
  const view = editorView();           // Tracked: re-runs when view initializes
  const isReadOnly = props.readOnly;   // Tracked: re-runs if edit mode changes
  
  if (view && !isReadOnly && !initialPositionReported) {
    const position = undoDepth(view.state);
    console.log(`[CodeEditor] Initial edit mode, entry position ${position}`);
    actions.setCodeCellEntryPosition(props.cell.id, position);
    initialPositionReported = true;
  }
});
```

**Timeline:**
1. Cell created with `isEditing: true` → CodeEditor mounts
2. Effect runs → `editorView()` is `undefined` → nothing happens
3. CodeMirror initializes → `editorView()` updates to EditorView instance
4. Effect re-runs → view exists, not read-only, not reported → reports position
5. User types → effect might re-run if dependencies change → `initialPositionReported` prevents duplicate

### Example 2: Navigating to Target History Position

**File:** `src/components/CodeEditor.tsx`

**Problem:** When global undo/redo sets a target position, we need to navigate CodeMirror's internal history. But we must wait for both the view AND a target position to exist.

```typescript
createEffect(() => {
  const view = editorView();
  const targetPosition = props.cell.targetHistoryPosition;
  
  // Both must be available
  if (view && targetPosition !== undefined) {
    const currentPosition = undoDepth(view.state);
    const delta = targetPosition - currentPosition;
    
    if (delta !== 0) {
      // Navigate CodeMirror history...
    }
  }
});
```

Here, we don't need a guard flag because:
- The action (navigation) is idempotent when delta is 0
- We WANT to react every time `targetPosition` changes

### Example 3: Syncing External Content Changes

**File:** `src/components/CodeEditor.tsx`

```typescript
createEffect(() => {
  const view = editorView();
  const currentValue = props.value;  // Tracked
  
  if (view) {
    const doc = view.state.doc;
    // Only update if content actually differs
    if (doc.length !== currentValue.length || doc.toString() !== currentValue) {
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: currentValue }
      });
    }
  }
});
```

No guard flag here because we WANT continuous syncing whenever `props.value` changes.

## When to Use Each Variant

| Scenario | Guard Flag? |
|----------|-------------|
| One-time initialization | ✅ Yes |
| Continuous sync/reaction | ❌ No |
| Idempotent action | ❌ No (or optional) |
| Expensive operation | ✅ Yes |
| Action with side effects that shouldn't repeat | ✅ Yes |

## Alternative: `on` with `defer`

For more explicit control, SolidJS provides the `on` helper:

```typescript
import { createEffect, on } from "solid-js";

createEffect(on(
  () => editorView(),  // Explicit dependency
  (view, prevView) => {
    if (view && !prevView) {
      // View just became available (was undefined, now has value)
      doSomething(view);
    }
  },
  { defer: true }  // Don't run on initial undefined value
));
```

This is more explicit but more verbose. The simple pattern with a guard flag is often clearer.

## Key Takeaways

1. **Effects auto-track**: Just call a signal inside an effect, and it becomes a dependency
2. **Guard flags prevent repeats**: Use `let flag = false` when you need one-time execution
3. **No flag for continuous reactions**: Skip the flag when you want to react to every change
4. **Combine conditions**: `if (a && b && !flag)` waits for multiple things to be ready
