# Solid-DnD SortableProvider Visual Preview Fix Specification

## Problem Statement

The current `SortableProvider` in `@thisbeyond/solid-dnd` does not correctly account for the dragged item being removed from layout flow during drag operations. This causes the visual preview (transform-based cell shifting) to be incorrect when cells have varying heights.

### Current Behavior

During a drag operation:
1. The dragged cell remains in its original DOM position (made semi-transparent with `opacity: 0.5` or hidden)
2. Other cells shift using CSS transforms to show where they'll end up
3. **BUT**: The transform calculations assume the dragged cell still occupies space
4. Result: When dragging past cells of different heights, the preview positions are off by the height of cells that should have been "removed" from flow

### Example Scenario

Given cells: `[Short(50px), Tall(200px), Short(50px)]`

When dragging the first Short cell to after the Tall cell:
- **Expected preview**: Short and Tall cells should shift up 50px (height of dragged cell)
- **Current preview**: Calculations don't account for the removed 50px, so positions are wrong

### Final Drop Behavior (Correct)

When the drag ends, `moveCell(fromIndex, toIndex)` executes:
```typescript
cells.splice(fromIndex, 1);  // Remove from original position
cells.splice(toIndex, 0, moved);  // Insert at new position
```

This produces the correct final layout, but the preview during drag is wrong.

## Proposed Solution

Modify `SortableProvider` to add a configuration option that treats the dragged item as "removed from flow" during transform calculations.

### New Configuration Option

```typescript
interface SortableProviderProps {
  ids: Array<Id>;
  removeFromFlow?: boolean; // NEW: Default false for backward compatibility
}
```

### Implementation Requirements

1. **When `removeFromFlow: true`**:
   - During drag, calculate transforms as if `draggableId` is not in the `ids` array
   - Adjust the sortedIds calculation in `SortableProvider` to exclude the active draggable
   - Recalculate sibling positions accounting for the "missing" dragged element's height/space

2. **Core Changes Needed**:

   In `sortable-context.tsx` (or equivalent file):

   ```typescript
   createEffect(() => {
     if (dndState.active.draggableId && dndState.active.droppableId) {
       untrack(() => {
         const fromIndex = state.sortedIds.indexOf(dndState.active.draggableId);
         const toIndex = state.initialIds.indexOf(dndState.active.droppableId);
         
         // NEW: If removeFromFlow is enabled, treat as if dragged item doesn't exist
         let adjustedSortedIds = [...state.sortedIds];
         if (props.removeFromFlow) {
           // Remove the dragged item from the working array
           adjustedSortedIds = adjustedSortedIds.filter(id => id !== dndState.active.draggableId);
           
           // Recalculate toIndex in the context of the "removed" item
           const adjustedToIndex = adjustedSortedIds.indexOf(dndState.active.droppableId);
           
           // Create new sorted order with item inserted at new position
           adjustedSortedIds.splice(adjustedToIndex + 1, 0, dndState.active.draggableId);
           
           setState("sortedIds", adjustedSortedIds);
         } else {
           // Original behavior
           if (!isValidIndex(fromIndex) || !isValidIndex(toIndex)) return;
           setState("sortedIds", moveArrayItem(state.initialIds, fromIndex, toIndex));
         }
       });
     }
   });
   ```

3. **Transform Calculation**:
   - The existing transform logic in `createSortable` should automatically reflect the new sortedIds
   - No additional changes needed if sortedIds is corrected

4. **Backward Compatibility**:
   - Default `removeFromFlow: false` maintains current behavior
   - All existing implementations continue to work unchanged
   - Users opt-in to the new behavior explicitly

## Testing Scenarios

### Test Case 1: Varying Heights
- Create sortable with cells: 50px, 200px, 50px, 150px
- Drag first cell to each position
- Verify preview shows correct gaps and positions

### Test Case 2: Moving Up vs Down
- When moving up: cells below should shift down by dragged item's height
- When moving down: cells should shift up by dragged item's height

### Test Case 3: Backward Compatibility
- Without `removeFromFlow` prop: behavior identical to current implementation
- With `removeFromFlow={false}`: behavior identical to current implementation

## Usage Example

```typescript
<SortableProvider 
  ids={notebookStore.cells.map((c) => c.id)}
  removeFromFlow={true}  // Enable accurate preview
>
  <For each={notebookStore.cells}>
    {(cell, index) => <Cell cell={cell} index={index()} />}
  </For>
</SortableProvider>
```

## Files to Modify

Based on typical solid-dnd structure:
1. `src/sortable-context.tsx` - Core sortable logic
2. `src/create-sortable.ts` - Sortable primitive (may need adjustments)
3. Type definitions for `SortableProviderProps`

## Success Criteria

- [ ] Visual preview during drag matches final drop position
- [ ] Works correctly with cells of varying heights
- [ ] No flickering or jumping during drag
- [ ] Backward compatible (existing code works unchanged)
- [ ] Configuration option is optional and clearly documented

## Additional Notes

- This fix addresses transform-based position calculations only
- The underlying collision detection and drop logic remain unchanged
- The dragged item should still be visible (as DragOverlay) during drag
- Consider performance implications of recalculating sortedIds on every collision change
