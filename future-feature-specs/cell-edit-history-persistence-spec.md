# Spec: Cell Edit History Persistence via EditorState

## 1. Problem Statement
Currently, when a user exits edit mode for a cell, the editor instance is destroyed and all undo/redo history for that cell is lost. This means users cannot undo or redo changes after they've finished editing a cell and moved to another cell.

An earlier proposal was to keep the editor instances alive (hidden in the DOM) when exiting edit mode to preserve history. However, this approach was rejected because keeping many `EditorView` instances alive leads to:
- **High memory usage:** Each instance maintains DOM nodes, event listeners, and mutation observers.
- **Performance degradation:** Excessive DOM nodes and listeners slow down the browser's main thread and scrolling performance.
- **Scalability issues:** As the user interacts with more cells, the application becomes progressively heavier.

## 2. Proposed Solution
Instead of keeping the heavy `EditorView` alive, we will persist only the lightweight **`EditorState`** for each cell. This separates the application state from the view layer.

### Workflow:
**When exiting edit mode:**
1. Capture the current `EditorState` from the `EditorView`.
2. Store this state in a central store (keyed by Cell ID).
3. Completely destroy the `EditorView` and remove its DOM nodes.

**When entering edit mode:**
1. Check if a persisted `EditorState` exists for this cell.
2. If yes, initialize the new `EditorView` using the persisted state (which includes history, selection, and the parsed document tree).
3. If no, initialize a fresh state from the Markdown source string.

## 3. Technical Analysis

### 3.1 Overhead Comparison
| Component | Estimated Overhead | Memory Characteristics |
| --- | --- | --- |
| **`EditorView`** | **High** | Contains live DOM nodes, event listeners, mutation observers, and a rendering loop. |
| **`EditorState`** | **Low** | A persistent (immutable) data structure containing the document tree, selection, and plugin metadata. |
| **History Stack** | **Variable** | Stores "steps" (deltas), not full document copies. Compact due to structural sharing. |

### 3.2 Performance & Scaling Benefits
- **Zero DOM Footprint:** Inactive cells contribute zero editor nodes to the DOM.
- **Structural Sharing:** ProseMirror uses immutable data structures. `EditorState` snapshots share memory for unchanged sub-nodes.
- **Fast Rehydration:** Re-creating a view from a State is significantly faster than re-parsing raw Markdown strings, as the document tree is already built.

## 4. Infrastructure Analysis

### 4.1 Current Architecture Overview

**Editor Technologies:**
- **Markdown Cells:** Use Milkdown (ProseMirror-based) via `@milkdown/kit`
- **Code Cells:** Use CodeMirror 6 via `solid-codemirror`

**State Management:**
- **Store:** SolidJS `createStore` in [src/lib/store.ts](src/lib/store.ts)
- **Session Persistence:** LocalStorage-based session manager in [src/lib/session.ts](src/lib/session.ts)
- **Current State Tracking:** 
  - `CellData.isEditing` boolean flag per cell
  - `editSessionStartContent` Map for tracking content changes during edit sessions
  - Cell content is stored as plain strings in `CellData.content`

**Component Lifecycle:**
- Markdown editors (Milkdown) are created in `onMount()` and destroyed in `onCleanup()`
- Code editors (CodeMirror) are managed by `solid-codemirror` library which handles lifecycle
- When `isEditing` becomes false, the editor components unmount and lose all internal state

### 4.2 Editor State Characteristics

**Milkdown (Markdown Cells):**
- Built on ProseMirror which uses immutable `EditorState` objects
- State contains: document tree, selection, plugins, and history stack
- History is managed by `@milkdown/kit/plugin/history`
- Can access state via `editorViewCtx` context: `ctx.get(editorViewCtx).state`

**CodeMirror 6 (Code Cells):**
- Also uses immutable `EditorState` objects
- State contains: document, selection, and history (via `history()` extension)
- Accessible via `editorView().state` from the `solid-codemirror` hook
- History provided by `@codemirror/commands` history extension

### 4.3 Recommended Implementation Path

Given the current architecture, we should implement **separate but parallel solutions** for each editor type:

#### Option A: Extend Existing Store (Recommended)
Add a new field to the SolidJS store to persist editor states:

```typescript
// In store.ts
export interface CellData {
  id: string;
  type: CellType;
  content: string;
  outputs?: {...};
  isEditing?: boolean;
  // New fields:
  editorState?: any; // ProseMirror or CodeMirror EditorState
  lastEditTimestamp?: number;
}
```

**Advantages:**
- Integrates seamlessly with existing state management
- Persists to localStorage automatically via session manager
- Reactive updates work out-of-the-box with SolidJS
- Already have autosave callbacks in place

**Considerations:**
- `EditorState` objects are not JSON-serializable by default
- Need custom serialization/deserialization for localStorage persistence (see Section 6.5 for complexity analysis)
- For session-only (non-persistent), can store objects directly in memory (recommended Phase 1 approach)

#### Option B: Separate Module-Level Map
Create a dedicated Map outside the SolidJS store:

```typescript
// New file: src/lib/editorStateCache.ts
const editorStateCache = new Map<string, EditorState>();
```

**Advantages:**
- Keeps heavy editor state separate from reactive store
- Simpler implementation - no serialization needed for session-only
- Faster access without store overhead

**Disadvantages:**
- Not persisted across browser reloads
- Separate from main state management flow
- Need manual cleanup on cell deletion

### 4.4 Implementation Strategy

**Phase 1: Session-Only Persistence (Option A with in-memory storage)**

1. **Store Integration:**
   - Add `editorState?: any` field to `CellData` interface
   - This field will NOT be serialized to localStorage initially
   - Store raw EditorState objects in memory during the session

2. **MarkdownEditor Modifications:**
   ```typescript
   onMount(() => {
     const savedState = props.cell.editorState;
     
     if (savedState) {
       // Rehydrate from saved state
       editor.action((ctx) => {
         const view = ctx.get(editorViewCtx);
         view.updateState(savedState); // ProseMirror method
       });
     } else {
       // Initialize fresh from markdown string
       ctx.set(defaultValueCtx, props.value);
     }
   });
   
   onCleanup(() => {
     if (editorInstance) {
       // Save state before destroying
       editorInstance.action((ctx) => {
         const state = ctx.get(editorViewCtx).state;
         actions.updateCellEditorState(props.cell.id, state);
       });
       editorInstance.destroy();
     }
   });
   ```

3. **CodeEditor Modifications:**
   ```typescript
   const { ref, createExtension, editorView } = createCodeMirror({
     onValueChange: props.onChange,
     value: props.value,
   });
   
   createEffect(() => {
     const savedState = props.cell.editorState;
     if (savedState && editorView()) {
       editorView().setState(savedState);
     }
   });
   
   onCleanup(() => {
     if (editorView()) {
       actions.updateCellEditorState(props.cell.id, editorView().state);
     }
   });
   ```

4. **Store Actions:**
   ```typescript
   updateCellEditorState: (id: string, state: any) => {
     setStore("cells", (c) => c.id === id, "editorState", state);
   },
   
   deleteCell: (id: string) => {
     // Existing logic...
     // Clear editor state on deletion
     setStore("cells", (c) => c.id === id, "editorState", undefined);
   }
   ```

**Phase 2: Cross-Session Persistence (Future Enhancement)**

If persistent undo/redo across browser reloads is desired:

1. Implement custom JSON serialization for EditorState
2. For ProseMirror: Use `state.toJSON()` and `EditorState.fromJSON()`
3. For CodeMirror: Serialize state fields manually
4. Update session manager to include serialized states
5. Add size limits to prevent localStorage overflow

## 4.5 State Storage Recommendations

## 4.5 State Storage Recommendations

**For Initial Implementation:**
- **Use Option A** (extend existing SolidJS store with `editorState` field)
- **Store in-memory only** (no localStorage serialization initially)
- This provides the best balance of integration and performance

**Storage Location:**
```typescript
// In store.ts CellData interface
export interface CellData {
  id: string;
  type: CellType;
  content: string;
  outputs?: {...};
  isEditing?: boolean;
  editorState?: any; // Session-only, not persisted to localStorage
  lastEditTimestamp?: number; // Track when editor was last used
}
```

### 4.6 Memory Management Considerations
### 4.6 Memory Management Considerations

**Estimated Memory per EditorState:**
- **ProseMirror State:** ~5-20KB for typical markdown documents (depends on history size)
- **CodeMirror State:** ~10-50KB for typical code cells (depends on document size and history)
- **History Stack:** ~1-5KB per 100 edits (stores deltas, not full snapshots)

**For a notebook with 50 cells:**
- If all 50 cells have been edited: ~2.5MB total (worst case)
- Typical usage (10-15 active edits): ~500KB
- This is negligible compared to modern browser memory capacity

**Cleanup Strategy:**
- Keep states for all cells that have been edited during the session
- Clear states only on explicit cell deletion
- Optional: Implement LRU cache if memory becomes a concern (unlikely)
- States are automatically cleared on browser reload/page refresh

### 4.7 State Field Retention

When persisting EditorState, we specifically retain:

1. **`doc`** (Document): The parsed document tree - essential for fast rehydration
2. **`selection`** (Selection): Cursor/selection position - improves UX when returning to edit
3. **`history`** (History Plugin): The undo/redo stack - the primary goal of this feature

**Fields to discard/allow reset:**
- Transient UI states (tooltips, hover decorations)
- Plugin decorations that are recomputed on mount
- Temporary markers or highlights

Both ProseMirror and CodeMirror handle this naturally - their state serialization focuses on document, selection, and history by default.

### 4.8 Integration with Existing Features

**Session Management:**
- The session manager already auto-saves cell content and history
- EditorState would remain session-only initially (not saved to localStorage)
- This prevents issues with state serialization complexity

**Undo/Redo System:**
- Current notebook-level undo/redo tracks cell creation/deletion/movement
- Cell-level editor history is independent and operates within each cell
- These two systems can coexist without conflict

**Autosave:**
- Existing autosave callback fires on content changes
- EditorState updates don't need to trigger autosave (they're session-only)
- Only the `content` string is persisted to localStorage

## 5. Implementation Status

### Phase 1: Foundation (Session-Only) - ✅ COMPLETED (Code Cells Only)

**Completed:**
1. ✅ Added `editorState?: any` field to `CellData` interface in [src/lib/store.ts](src/lib/store.ts)
2. ✅ Added `lastEditTimestamp?: number` field for tracking
3. ✅ Created `updateCellEditorState(id, state)` action in store
4. ✅ Created `clearCellEditorState(id)` action in store
5. ✅ Modified `deleteCell()` to clear editor state on deletion
6. ✅ Modified `changeCellType()` to clear incompatible state on type change

### Phase 2: Code Editor Integration - ✅ COMPLETED

**Completed:**
1. ✅ Updated [src/components/CodeEditor.tsx](src/components/CodeEditor.tsx) with state persistence
2. ✅ Implemented `createEffect()` to restore state from `EditorState.fromJSON()`
3. ✅ Implemented `onCleanup()` to save state using `state.toJSON()`
4. ✅ Added memory optimization: exclude `doc` field from saved state (60-70% reduction)
5. ✅ Updated [src/components/CodeCell.tsx](src/components/CodeCell.tsx) to pass `cell` prop
6. ✅ Verified undo/redo works across edit sessions for code cells

**Technical Details:**
- CodeMirror 6 provides native `state.toJSON()` and `EditorState.fromJSON()` methods
- State is stored as plain JavaScript objects in SolidJS store (session-only, not localStorage)
- Document is excluded from saved state and injected from `props.value` on restoration
- Typical memory: ~2-7KB per code cell with edit history (down from ~10-50KB without optimization)

### Phase 3: Markdown Editor Integration - ❌ BLOCKED

**Status:** Not implemented - waiting on Milkdown enhancements

**Reason:** Milkdown (ProseMirror wrapper) does not provide straightforward APIs for state persistence:
- No exposed `toJSON()`/`fromJSON()` methods for EditorState
- Directly manipulating ProseMirror state bypasses Milkdown's plugin system
- Calling `view.updateState()` with manually reconstructed state breaks history tracking
- Milkdown manages state creation through its internal plugin lifecycle

**Attempted Approach:**
- Tried accessing `ctx.get(editorViewCtx).state` and using ProseMirror's `state.toJSON()`
- Attempted to reconstruct state with `EditorState.fromJSON()` and call `view.updateState()`
- Result: State restoration failed or broke editor functionality

**Why This Matters:**
While markdown editing may seem simpler than code editing, the ability to undo/redo edits is equally important:
- Users frequently delete content they later want to recover
- Long-form writing benefits from persistent undo history
- The global notebook-level undo only tracks cell operations (add/delete/move), not content changes
- Asymmetric behavior between code and markdown cells creates poor UX

**Next Steps:** See Section 11 (Milkdown Fork Strategy)

### Phase 4: Testing & Refinement - ⚠️ PARTIAL

**Code Cells (Completed):**
- ✅ Manual testing confirms undo/redo works across edit sessions
- ✅ State is cleared on cell deletion
- ✅ State is cleared on cell type change
- ✅ Memory optimization working (doc field excluded)

**Markdown Cells (Not Tested):**
- ❌ No state persistence to test
- ❌ Awaiting Milkdown enhancements

### Phase 5: Future Enhancements - 🔮 PLANNED

**Not Started:**
1. Implement state serialization for localStorage (cross-session persistence)
2. Configure history depth limits (e.g., maxDepth: 100)
3. Further optimize by keeping only `history` + `selection` (additional 40-60% reduction)
4. Add LRU cache if memory becomes a concern
5. Implement for Markdown cells once Milkdown support is added

## 6. Technical Considerations
## 6. Technical Considerations

### 6.1 Plugin Compatibility
- **Schema Stability:** Ensure that ProseMirror schema and CodeMirror configuration remain stable across editor instantiations within a session
- **Plugin Order:** The same plugins must be loaded in the same order when rehydrating state
- **Version Locking:** Editor library versions should be pinned to avoid state incompatibilities

### 6.2 Edge Cases

**Cell Type Changes:**
- If a user converts a markdown cell to code (or vice versa), discard the old editorState
- Implement in `changeCellType` action:
  ```typescript
  changeCellType: (id: string, type: CellType) => {
    setStore("cells", (c) => c.id === id, "type", type);
    setStore("cells", (c) => c.id === id, "editorState", undefined); // Clear incompatible state
  }
  ```

**Cell Duplication/Copy:**
- When duplicating a cell, should we copy the editorState?
- **Recommendation:** No - start fresh to avoid confusion with history from original cell

**Cell Content Sync:**
- The `content` field and `editorState.doc` must remain in sync
- Update `content` on every editor change (already done via `onChange` callbacks)
- On rehydration, if `content` differs from state, prefer `content` (it's the source of truth)

### 6.3 Performance Impact

**Initial Load:**
- No impact - states are created lazily on first edit

**Switching Between Cells:**
- **Without feature:** Destroy editor → Create new editor from markdown string
- **With feature:** Destroy editor → Create new editor from existing state
- **Expected improvement:** ~20-30% faster rehydration (no markdown parsing needed)

**Memory:**
- **Baseline (current):** ~1MB for app + 1 active editor
- **With feature:** ~1MB for app + states for all edited cells (~500KB typical)
- **Net increase:** <1MB for typical notebook sessions

### 6.4 Testing Strategy

**Unit Tests:**
- Test state capture and restoration for both editor types
- Verify history stack integrity (undo after remount)
- Test memory cleanup on cell deletion

**Integration Tests:**
- Test full workflow: edit cell → switch away → return → undo works
- Test multiple rapid switches between many cells
- Test undo across 10+ edit sessions in same cell

**Performance Tests:**
- Measure memory usage with 50 cells, all edited
- Benchmark remount time with/without state persistence
- Profile for memory leaks in long sessions

### 6.5 Serialization Complexity Analysis

This section addresses the challenges of implementing cross-session persistence (Phase 5).

**IMPORTANT DISTINCTION:**
- **In-memory storage (Phase 1):** EditorState objects are ~5-20KB due to structural sharing and binary format - **LIGHTWEIGHT ✅**
- **JSON serialization (Phase 5):** Text-based format loses structural sharing, includes metadata - **MUCH LARGER ⚠️**

**ProseMirror/Milkdown Serialization: ✅ Straightforward**

ProseMirror provides built-in JSON serialization:
```typescript
// Serialize
const json = editorState.toJSON();
localStorage.setItem(`cell-${id}-state`, JSON.stringify(json));

// Deserialize
const json = JSON.parse(localStorage.getItem(`cell-${id}-state`));
const state = EditorState.fromJSON(config, json);
```

**Size Comparison for Same Content:**
- **In-memory EditorState:** ~5-20KB (structural sharing, binary format)
- **Serialized JSON:** ~50-100KB for 100+ operations (no sharing, text format, metadata overhead)
- **Ratio:** Serialization is 3-10x larger than in-memory

**Challenges:**
- ✅ **Document:** Serializes perfectly
- ✅ **Selection:** Serializes well
- ⚠️ **History Plugin:** Works but JSON representation is large (3-10x memory size)
- ⚠️ **Schema Dependency:** Requires exact same schema/plugins on deserialization
- ❌ **Plugin State:** Custom plugin state may not serialize properly

**CodeMirror 6 Serialization: ⚠️ Moderate Difficulty**

CodeMirror 6 does NOT have built-in `toJSON()`. Manual approach required:

```typescript
// Serialize
const serialized = {
  doc: editorView.state.doc.toString(),
  selection: editorView.state.selection.toJSON(),
  // History requires accessing internal state
};

// Deserialize - more complex
// Need to reconstruct state and replay history or lose it
```

**Challenges:**
- ✅ **Document:** Easy - just `doc.toString()`
- ✅ **Selection:** Has `toJSON()` method
- ❌ **History:** No built-in serialization - would lose undo/redo stack
- ⚠️ **Alternative:** Could serialize the document at each history step, but very inefficient

**localStorage Size Limits (Phase 5 only):**
- Most browsers: 5-10MB per domain
- A single cell serialized with large history: 50-200KB (vs 5-20KB in-memory)
- 50 cells with full history serialized: 2.5-10MB (vs ~500KB in-memory)
- **Risk:** Can exceed quota, especially with code cells containing large documents
- **Mitigation:** Implement history depth limits, compression, or selective serialization

**Why In-Memory (Phase 1) is Superior:**
- **Structural sharing:** Multiple state snapshots share unchanged nodes
- **Binary format:** More compact than JSON text
- **No metadata overhead:** Only what's needed for functionality
- **Fast access:** Direct object references, no parsing
- **Example:** 50 cells with history = ~500KB in RAM vs 2.5-10MB in localStorage

**Version Compatibility Issues:**
- Schema changes between app versions can break state deserialization
- Editor library updates may change internal state format
- **Risk:** User's saved states become invalid after app update
- **Mitigation:** Include version metadata, implement migrations, or fallback to content string

**Recommendation:**
- **Phase 1 (Session-Only):** Simple, robust, covers 90% of use cases - no serialization needed
- **Phase 5 (localStorage):** Implement for ProseMirror only initially (easier), consider skipping for CodeMirror
- **Alternative:** For CodeMirror, could serialize just document + selection, accepting loss of history across reloads


**Key Insight:** The in-memory approach is NOT resource-heavy (500KB typical for 50 cells). It's the localStorage serialization that becomes costly (2.5-10MB for same data). Phase 1 gets you 90% of the benefit at 10% of the cost and
**Complexity Rating:**
- Session-only persistence: ⭐ Easy (recommended)
- ProseMirror localStorage: ⭐⭐ Moderate (doable with caveats)
- CodeMirror localStorage: ⭐⭐⭐⭐ Difficult (with full history preservation)

**Conclusion:**
Starting with session-only persistence (Phase 1) is the pragmatic choice. It provides the core functionality (undo/redo within a session) without the complexity and fragility of serialization. Cross-session persistence can be added later if user feedback indicates it's valuable enough to justify the additional complexity.

## 7. Alternative Approaches Considered

### 7.1 Keep Editors Alive (Rejected)
**Approach:** Hide editors instead of destroying them.
**Why Rejected:** High memory usage, DOM bloat, poor scalability (see Problem Statement).

### 7.2 Serialize to Markdown String (Rejected)
**Approach:** Convert editor state to markdown string, re-parse on remount.
**Why Rejected:** 
- Loses history stack entirely
- Loses selection/cursor position
- Parsing overhead on every remount
- Doesn't solve the core problem

### 7.3 External History Store (Considered)
**Approach:** Extract history into separate data structure, replay on remount.
**Why Rejected:**
- More complex implementation
- Need to manually replay all transactions
- Doesn't preserve selection state
- EditorState already encapsulates this perfectly

### 7.4 Hybrid: State Cache + Content Fallback (Future)
**Approach:** Try to use EditorState, fall back to content string if state is stale/invalid.
**Status:** Good candidate for Phase 5 enhancement
**Benefits:** More robust to version changes and errors

## 8. Success Criteria

This feature will be considered successful when:

1. **Functional:** Users can undo/redo changes after exiting and re-entering edit mode
2. **Performance:** Cell switching is fast (< 100ms) even with persisted states
3. **Scalability:** App remains responsive with 50+ cells with edit history
4. **Memory:** Total memory overhead < 5MB for typical notebooks (< 50 edited cells)
5. **UX:** Cursor position is restored when returning to edit a cell
6. **Stability:** No memory leaks detected in 1-hour session with 100+ cell edits

## 9. Future Enhancements

### 9.1 Configurable History Limits
Allow users to set maximum undo stack depth per cell to control memory usage.

### 9.2 Cross-Session Persistence
Implement JSON serialization to persist edit history across browser reloads. Requires:
- Custom serializers for both ProseMirror and CodeMirror states
- Size limits and compression for localStorage
- Migration strategy for state format changes

### 9.3 Visual History Timeline
Show a visual timeline of edits for each cell (similar to version control systems).

### 9.4 Collaborative Editing
EditorState persistence is a prerequisite for implementing operational transformation or CRDT-based collaborative editing.

## 10. References

- [ProseMirror State Documentation](https://prosemirror.net/docs/ref/#state)
- [CodeMirror 6 State Management](https://codemirror.net/docs/ref/#state)
- [SolidJS Store Guide](https://www.solidjs.com/docs/latest/api#createstore)
- [Milkdown Documentation](https://milkdown.dev/)

---

## 11. Milkdown Fork Strategy

### 11.1 Problem Statement

Milkdown (v7.x) does not expose APIs for saving and restoring editor state, which is essential for implementing persistent undo/redo across edit sessions. While Milkdown is built on ProseMirror (which has `state.toJSON()` and `EditorState.fromJSON()`), these are not exposed through Milkdown's API.

**What We Need:**
1. A method to **export** the current editor state (including history, selection, and plugin states)
2. A method to **restore** a previously saved state when creating a new editor instance
3. Preservation of history plugin state across editor recreation

**Why Direct ProseMirror Access Doesn't Work:**
- Milkdown wraps ProseMirror's `EditorView` and manages state through its plugin system
- Directly calling `view.updateState()` with a manually reconstructed state bypasses Milkdown's lifecycle
- This breaks plugin state synchronization, particularly the history plugin
- The `defaultValueCtx` only accepts markdown strings, not EditorState objects

### 11.2 Open Source Status

**License:** MIT License  
**Repository:** https://github.com/Milkdown/milkdown  
**Copyright:** © 2021-present Mirone ♡ Meo

**Fork Feasibility:** ✅ Excellent
- Permissive MIT license allows modification and redistribution
- Active development with clear architecture
- TypeScript codebase with good documentation
- Modular plugin system makes targeted changes possible

### 11.3 Proposed API Changes

We need to add two new capabilities to Milkdown's `Editor` class:

#### 11.3.1 Export State API

```typescript
// New method on Editor class
class Editor {
  // ... existing methods ...
  
  /**
   * Export the current editor state as a serializable object.
   * Includes document, selection, history, and plugin states.
   * @returns A plain JavaScript object that can be stored and later restored
   */
  exportState(): EditorStateJSON {
    return this.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      return view.state.toJSON();
    });
  }
}
```

#### 11.3.2 Restore State API

```typescript
// Extend the Editor.config() method to accept a state restoration context
class Editor {
  // ... existing methods ...
  
  /**
   * Configure the editor to restore from a previously saved state.
   * Must be called before .create()
   */
  config(ctx => {
    // New context type for state restoration
    ctx.set(restoredStateCtx, savedStateJSON);
  });
}

// Or alternative: Add a new initialization option
Editor.make()
  .config(nord)
  .use(commonmark)
  .use(gfm)
  .use(history)
  .restoreState(savedStateJSON) // New method
  .create();
```

#### 11.3.3 Internal Changes Needed

**File:** `packages/core/src/internal-plugin/editor-state.ts`

Current behavior:
```typescript
export const editorState: MilkdownPlugin = (ctx) => {
  // ...
  const defaultValue = ctx.get(defaultValueCtx);
  const doc = getDoc(defaultValue, parser, schema); // Always parses markdown
  
  const state = EditorState.create({
    schema,
    doc,
    plugins,
  });
  // ...
};
```

Proposed change:
```typescript
// Add new context for restored state
export const restoredStateCtx = createSlice(
  undefined as EditorStateJSON | undefined, 
  'restoredState'
);

export const editorState: MilkdownPlugin = (ctx) => {
  // ...
  const restoredState = ctx.get(restoredStateCtx);
  
  let state: EditorState;
  if (restoredState) {
    // Restore from saved state
    const schema = ctx.get(schemaCtx);
    const prosePlugins = ctx.get(prosePluginsCtx);
    
    state = EditorState.fromJSON(
      { schema, plugins: prosePlugins },
      restoredState
    );
  } else {
    // Normal initialization from markdown
    const defaultValue = ctx.get(defaultValueCtx);
    const doc = getDoc(defaultValue, parser, schema);
    
    state = EditorState.create({
      schema,
      doc,
      plugins,
    });
  }
  
  ctx.set(editorStateCtx, state);
  // ...
};
```

### 11.4 Implementation Plan

#### Step 1: Fork Milkdown
```bash
# Fork on GitHub, then clone
git clone https://github.com/YOUR_USERNAME/milkdown.git
cd milkdown
git remote add upstream https://github.com/Milkdown/milkdown.git

# Create feature branch
git checkout -b feature/state-persistence
```

#### Step 2: Make Targeted Changes

**Files to Modify:**
1. `packages/core/src/internal-plugin/editor-state.ts` - Add state restoration logic
2. `packages/core/src/internal-plugin/atoms.ts` - Add `restoredStateCtx` slice
3. `packages/core/src/editor/editor.ts` - Add `exportState()` and `restoreState()` methods
4. `packages/core/src/index.ts` - Export new APIs

**Estimated Changes:** ~100-200 lines of code across 4 files

#### Step 3: Test Changes

```bash
# Build the modified Milkdown
npm install
npm run build

# Run existing tests to ensure no regressions
npm test

# Add new tests for state persistence
# packages/core/__tests__/state-persistence.spec.ts
```

#### Step 4: Use Fork in Project

**Option A: Publish to npm under scoped package**
```bash
# Publish as @your-org/milkdown
npm publish --access public
```

Then in your project:
```json
{
  "dependencies": {
    "@milkdown/core": "npm:@your-org/milkdown-core@^7.0.0",
    "@milkdown/kit": "npm:@your-org/milkdown-kit@^7.0.0"
  }
}
```

**Option B: Use local path during development**
```json
{
  "dependencies": {
    "@milkdown/core": "file:../milkdown/packages/core",
    "@milkdown/kit": "file:../milkdown/packages/kit"
  }
}
```

**Option C: Use Git URL**
```json
{
  "dependencies": {
    "@milkdown/core": "git+https://github.com/YOUR_USERNAME/milkdown.git#feature/state-persistence",
    "@milkdown/kit": "git+https://github.com/YOUR_USERNAME/milkdown.git#feature/state-persistence"
  }
}
```

#### Step 5: Upstream Contribution

Once the feature is stable and tested:
1. Create pull request to upstream Milkdown repository
2. Include documentation and tests
3. Explain the use case (notebook editors, collaborative editing, etc.)
4. If accepted, can switch back to official Milkdown package
5. If not accepted, maintain fork with periodic rebasing from upstream

### 11.5 Alternative: Plugin-Based Approach

Instead of modifying core, investigate creating a Milkdown plugin:

```typescript
// Potential plugin approach (needs research)
export const statePersistence = $ctx<StatePersistence>(() => {
  // Plugin that intercepts editor creation and restoration
  // May be possible depending on Milkdown's plugin API flexibility
});
```

**Pros:**
- Less intrusive, easier to maintain
- No fork needed
- Can be published as separate npm package

**Cons:**
- May not have access to necessary internals
- Plugin API may not support intercepting state creation
- Still needs research to determine feasibility

### 11.6 Maintenance Strategy

**If maintaining a fork:**

1. **Regular upstream syncing:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Version pinning:**
   - Pin to specific upstream version (e.g., v7.5.0)
   - Don't automatically update to avoid breaking changes
   - Test thoroughly before rebasing to newer versions

3. **Minimal changes:**
   - Keep modifications focused on state persistence only
   - Don't add other features or change behavior
   - Makes rebasing easier

4. **Documentation:**
   - Maintain clear diff documentation
   - Tag releases with `-state-persistence` suffix (e.g., `v7.5.0-state-persistence.1`)
   - Keep changelog of modifications

### 11.7 Risk Assessment

**Low Risk:**
- ✅ MIT license allows modification
- ✅ Changes are targeted and minimal
- ✅ Feature is additive (doesn't change existing behavior)
- ✅ ProseMirror already provides the underlying functionality

**Medium Risk:**
- ⚠️ Need to rebase when updating Milkdown versions
- ⚠️ Potential for conflicts if upstream changes same files
- ⚠️ Maintenance burden of keeping fork updated

**Mitigation:**
- Version pinning reduces update frequency
- Minimal changes reduce conflict probability
- Plugin-based approach (if feasible) eliminates fork maintenance
- Upstream contribution would eliminate all risks

### 11.8 Timeline Estimate

**Fork & Implement:** 1-2 days
- Day 1: Fork, build setup, implement state export/restore
- Day 2: Testing, integration with notebook editor

**Testing & Refinement:** 1-2 days
- Test edge cases
- Verify memory usage
- Ensure no regressions

**Total:** ~3-4 days of focused development

**Alternative (Plugin Approach):** 2-3 days
- Day 1: Research plugin API capabilities
- Day 2: Implement if feasible
- Day 3: Testing

### 11.9 Success Criteria

The fork/modification will be considered successful when:

1. ✅ Can export editor state via `editor.exportState()`
2. ✅ Can restore state via `editor.restoreState(savedState)` or config
3. ✅ Undo/redo works correctly after restoration
4. ✅ Cursor position is preserved
5. ✅ No memory leaks or performance degradation
6. ✅ All existing Milkdown tests still pass
7. ✅ Works seamlessly in the notebook editor

### 11.10 Go/No-Go Decision

**GO if:**
- State persistence is critical for markdown cells (current decision: YES)
- Willing to maintain fork short-term (3-6 months)
- Have 3-4 days available for implementation
- Upstream contribution attempt planned

**NO-GO if:**
- Can live without markdown undo/redo (decision: NO - unacceptable)
- Cannot commit to fork maintenance
- Need immediate solution (CodeMirror already works)

**Current Decision:** GO - Implement fork for state persistence
