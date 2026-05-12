# Split-Cell Coordinated Undo Specification

> **Priority: HIGH** — User-facing correctness bug. The current Split Cell feature
> leaves the global undo history in a partially-consistent state.

## Problem Statement

The Split Cell feature mutates state across **two independent history systems**
in a single user gesture:

1. **Global notebook history** (`src/lib/store.ts`) — pipe-delimited entries
   (`a|...`, `u|...`, `d|...`, `m|...`, `b|[...]`).
2. **Milkdown editor's internal ProseMirror history** — per-editor undo stack
   maintained by `@milkdown/kit/plugin/history`.

When the user invokes Split Cell (toolbar button, mobile dropdown, or
`Mod+Shift+Enter`), the implementation in `MarkdownEditor.tsx` does:

```ts
actions.insertMarkdownCell(idx + 1, afterContent); // → global history: a|... + u|newId|...
replaceAll(keepContent)(ctx);                       // → Milkdown internal history only
```

The original cell's truncation only reaches the global history later, when the
user exits edit mode and `commitEditSession` records a `u|originalId|...` entry.
If the user invokes **global undo** (top menubar / `Mod+Z`) **before** exiting
edit mode of the original cell, the global history reverses only the `a|...`
(removes the new sibling) — the original cell remains truncated in the store.

### Symptom

> "There is an issue with the undo function. It restores the original cell but
> does not remove the added cell/new cell created!"
>
> *(Inverted in practice depending on `focusFirst`: the new sibling is removed
> but the original stays truncated.)*

### Root Cause

A coordinated mutation (split = "truncate original" + "insert sibling") is
recorded in two unrelated history logs. Global undo only sees half the change.

## Considered Approaches

### Option A — Bubble-Up: New Global History Entry Type

Add a new entry type, e.g. `s|<origId>|<newId>|<insertIdx>`. On global undo,
"bubble down" by dispatching `actions.dispatchEditorAction(origId, "undo")` so
Milkdown reverts its own `replaceAll` step.

**Why this looks elegant:**
- Reuses Milkdown's existing prose-mirror history.
- Mirrors the existing `Notebook.tsx` `handleUndo`/`handleRedo` pattern that
  already chooses between editor-undo and store-undo based on edit state.

**Why it fails in practice — three real problems:**

1. **Editor-history pollution.** If the user splits, then types more inside the
   original cell, Milkdown's stack becomes
   `[..., replaceAll, type 'a', type 'b', type 'c']`. A single global undo of
   the split must undo `replaceAll` *specifically*, but Milkdown only knows
   "undo the most recent thing." Bubbling one undo reverts `'c'`, not the
   split. We'd need to either (a) bubble undo N times until the `replaceAll`
   step pops (no way to detect N) or (b) snapshot Milkdown's history depth at
   split time and bubble exactly `currentDepth − splitDepth` undos. Option (b)
   is fragile — any external edit (paste, plugin, AI rewrite) breaks the count.

2. **The cell may not be in edit mode at undo time.** User splits, exits edit
   mode, clicks elsewhere, hits global undo. There is no live Milkdown view to
   dispatch to. We'd have to remount/re-enter edit mode just to issue the undo,
   then maybe exit. Visible flicker, focus surprises.

3. **Redo of an undo of a split.** Mirrored problems, plus: Milkdown's *redo*
   stack is cleared on any new edit, so the bubbled redo may have nothing to
   redo. We'd need to re-do the `replaceAll` ourselves — at which point we are
   back to snapshotting content anyway.

### Option B (Recommended) — Snapshot + Batch in the Global Store

Introduce a new store action `actions.splitMarkdownCell(originalCellId,
beforeContent, afterContent, focusFirst)` that records a single batched global
entry:

1. `u|<origId>|<fullPreSplitContent>|<keptHalfContent>` — content change on
   original cell.
2. `a|<insertIdx>|markdown|<newId>` — new sibling inserted.
3. `u|<newId>|""|<otherHalfContent>` — new sibling content set.

All three live inside one `b|[...]` batch so a single user undo reverses
everything atomically.

Additionally:

- **Reset Milkdown's internal history** for the original editor (ProseMirror
  exposes a "clear history" transaction) so its undo stack starts fresh from
  the post-split content. This eliminates the divergence between the two
  histories going forward.
- **Reset `editSessionStart`** for the original cell to the new kept content so
  the existing edit-session commit logic continues to behave normally
  (otherwise a later commit will record a redundant/incorrect `u|...`).
- **Add a one-way store→editor sync** so when global undo/redo touches a cell
  currently being edited, the live editor reflects the new content. Today,
  content sync is one-way the other direction (editor → store). A small
  `createEffect` watching `props.cell.content` that calls `replaceAll(...)`
  when the value diverges from the current doc text is sufficient.

#### Tradeoffs

- ✅ Works regardless of edit-mode state at undo time.
- ✅ One user undo reverses everything atomically — no counting steps.
- ✅ Redo is symmetric and reliable (replays the same batch forward).
- ✅ Aligns with how the rest of global history already works.
- ⚠️ Need a small store→editor sync — new behavior, but reusable for any
  future feature that mutates cell content from outside the editor (AI
  rewrites, formatter, find/replace).
- ⚠️ Clearing Milkdown's history loses fine-grained character-level undo of
  the typing the user did *before* the split. Arguably correct: the split is a
  discrete operation, and after it the content is in a new logical state. If
  this is unacceptable, an alternative is to *not* clear and accept that
  global-undo of the split reverses to the pre-split content in one step
  without visiting intermediate Milkdown steps (the global history never
  visited those steps either).

## Known Risk — Verify Before Implementing

The user has flagged a possible interaction with **session restore + history
restoration**:

> "I remember trying the snapshot approach before and there might be an issue
> with session restore and history being restored."

Before implementing, audit `src/lib/session.ts` (and any history persistence
logic) to confirm:

- Whether the global history is serialized/restored across sessions.
- Whether large `u|...` snapshots in batched entries inflate session payloads
  past any storage limit.
- Whether restored history entries can correctly re-apply against a fresh
  store snapshot (i.e. the `u|origId|esc(pre)|esc(post)` round-trips through
  serialization without escaping issues).

If session restore *does* persist history, ensure the new batched split entry
deserializes correctly and does not break replay.

## Implementation Plan

1. **Audit session restore / history persistence** (see Known Risk above).
   Document findings before touching code.
2. **Refactor `insertMarkdownCell`** in `src/lib/store.ts` so its body can run
   inside an existing batch (split into a `_recordInsert` internal that pushes
   to the active batch when one is open, plus the public wrapper that opens
   its own batch when none is active). Or: make `beginBatch` reentrant /
   no-op when already active rather than rejecting.
3. **Add `actions.splitMarkdownCell(originalCellId, beforeContent,
   afterContent, focusFirst)`** that:
   - Reads the original cell's full content from the store (not the editor).
   - Opens a batch.
   - Records the three entries described in Option B.
   - Sets `editSessionStart[originalCellId]` to `keptContent` so the next
     `commitEditSession` doesn't re-record the truncation.
   - Closes the batch.
4. **Update `splitCell` in `src/components/MarkdownEditor.tsx`** to call the
   new action instead of `insertMarkdownCell` + `replaceAll`. Still call
   `replaceAll(keepContent)(ctx)` for the live editor's visual sync, then
   issue the ProseMirror "clear history" transaction.
5. **Add a store→editor sync `createEffect`** in `MarkdownEditor.tsx` that
   `replaceAll`s when `props.cell.content` diverges from the editor's current
   doc text. Guard against feedback loops (compare before writing).
6. **Tests** in `src/lib/store.test.ts`:
   - Reproduce the bug: seed `[{id:"a", content:"alpha\n\nbeta",
     type:"markdown", isEditing:true}]`, call
     `splitMarkdownCell("a","alpha\n\n","beta",true)`, assert two cells, then
     `actions.undo()`, assert one cell with original content restored.
   - Symmetric case `focusFirst=false` (new cell inserted *before*).
   - Redo round-trip (`undo()` then `redo()` returns to split state).
   - Batch atomicity: `historyIndex` advances by exactly 1 per split.
7. **Update `src/test/README.md`** with a new subsection documenting
   `actions.splitMarkdownCell` and the dual-undo guarantee.
8. **Manual verification** of the original symptom (split → global undo
   restores both halves, regardless of whether edit mode was exited).

## Acceptance Criteria

- A single global undo immediately following Split Cell restores the notebook
  to the exact pre-split state, regardless of:
  - which half was kept focused (`focusFirst` true/false),
  - whether the user has exited edit mode,
  - whether the user typed additional characters in the original editor
    after splitting (those subsequent edits remain individually undoable
    *after* the split is reversed, OR are batched in — implementation choice
    documented).
- A subsequent global redo re-applies the split exactly.
- Session restore continues to work; saved notebooks open without history
  replay errors.
- All existing tests pass; new tests cover the scenarios above.
