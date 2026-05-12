# PyNote Test Suite

Unit and component tests for the PyNote notebook editor. Tests live next to
the code they cover (`*.test.ts` / `*.test.tsx`) and run on
[Vitest](https://vitest.dev/) with [jsdom](https://github.com/jsdom/jsdom)
and [`@solidjs/testing-library`](https://github.com/solidjs/solid-testing-library).

## Running tests

From the project root:

| Command                     | What it does                                              |
| --------------------------- | --------------------------------------------------------- |
| `npm test`                  | One-shot run (used by CI).                                |
| `npm run test:watch`        | Re-runs on file changes.                                  |
| `npm run test:coverage`     | One-shot + V8 coverage at `reports/coverage/index.html`.  |
| `npm run test:ci`           | One-shot + JUnit XML at `reports/junit.xml`.              |

Targeted runs (forward args after `--`):

- `npm test -- src/lib/markdownSplit.test.ts` — single file
- `npm test -- -t "smart cursor"` — only tests whose name matches
- `npm run test:watch -- src/components` — watch a folder

## Layout

```
src/
  lib/markdownSplit.test.ts       # pure utility — split-cell helpers
  lib/store.test.ts               # Solid store action — insertMarkdownCell
  components/MarkdownEditor.test.tsx  # toolbar JSX + dropdown stacking
src/test/
  setup.ts                        # jest-dom matchers + auto-cleanup
  README.md                       # this file
```

Configuration: [vitest.config.ts](../../vitest.config.ts),
[tsconfig.test.json](../../tsconfig.test.json).

---

## Feature: Split Markdown Cell at Cursor

Splits one markdown cell into two at the caret. Implemented in
[src/components/MarkdownEditor.tsx](../components/MarkdownEditor.tsx) with
its pure helpers in [src/lib/markdownSplit.ts](../lib/markdownSplit.ts) and
the underlying store action in [src/lib/store.ts](../lib/store.ts).

The five behaviors covered by tests:

1. **Smart cursor placement** — after the split, focus stays with whichever
   side has the closest non-whitespace content. Ties keep the cursor in the
   original (first) cell.
2. **Verbatim content** — the markdown to either side of the caret is
   preserved exactly as-is. No trimming of whitespace or newlines.
3. **Desktop toolbar button** — placed between the Table dropdown and the
   "More" dropdown, with a tooltip that shows the keyboard shortcut.
4. **Mobile dropdown entry** — same action exposed inside the mobile "More
   Formatting" menu under the shorter label "Split Cell".
5. **Keyboard shortcut** — `Mod+Shift+Enter` (Cmd on macOS, Ctrl elsewhere).
   Must not collide with browser shortcuts or other in-app bindings.

### `computeSplit` — smart cursor logic

**Where:** [src/lib/markdownSplit.test.ts](../lib/markdownSplit.test.ts),
describe block `"computeSplit — smart cursor logic"`.

**Behavior under test:** given the markdown to the left of the caret
(`beforeMd`) and to the right (`afterMd`), `computeSplit` decides whether
the caret should remain in the first cell (`focusFirst: true`) or move to
the new second cell (`focusFirst: false`). The decision is based on the
distance, in whitespace characters, from the caret to the nearest
non-whitespace character on each side. The closer side wins; on a tie the
first cell wins.

**How it is tested:** the helper is pure, so each case is a single call
with hand-crafted before/after strings and an assertion on `focusFirst`.

| Case | Inputs | Expected `focusFirst` |
| ---- | ------ | --------------------- |
| Closer left | `"hello"`, `"   world"` | `true` |
| Closer right | `"hello   "`, `"world"` | `false` |
| Symmetric tie (newline each side) | `"hello\n"`, `"\nworld"` | `true` |
| Mixed whitespace, right is closer | `"text\n \t\n "`, `" more"` | `false` |
| Empty left half | `""`, `"hello"` | `true` (tie rule) |
| Empty right half | `"hello"`, `""` | `true` |

### `computeSplit` — content is preserved verbatim

**Where:** same file, describe block `"computeSplit — content is preserved verbatim"`.

**Behavior under test:** `beforeContent` and `afterContent` returned by
`computeSplit` must equal `beforeMd` and `afterMd` byte-for-byte. The
helper performs no trimming.

**How it is tested:** for each side, an input with surrounding whitespace
is passed in and the result is compared to the input string directly.

| Case | What is asserted |
| ---- | ---------------- |
| Trailing newlines on first cell | `beforeContent` keeps `"\n\n\n"` suffix |
| Leading newlines on second cell | `afterContent` keeps `"\n\n\n"` prefix |
| Trailing spaces on first cell | preserved |
| Leading spaces on second cell | preserved |
| No surrounding whitespace | unchanged |
| Round-trip | `beforeContent + afterContent === beforeMd + afterMd` |

The round-trip case is the strongest guarantee: it proves no characters
are added, removed, or reordered by the helper.

### `isSplitShortcut` — keyboard shortcut predicate

**Where:** same file, describe block `"isSplitShortcut — keyboard shortcut"`.

**Behavior under test:** the predicate returns `true` only for
`Mod+Shift+Enter` (i.e. `Enter` + `Shift` + (`Cmd` or `Ctrl`), with `Alt`
not pressed). Every other key combination must be rejected so it does not
collide with the browser's shortcuts or with PyNote's existing run/insert
bindings.

**How it is tested:** a small `ev()` helper builds plain
`KeyboardEvent`-shaped objects (jsdom's modifier init is unreliable), and
each case asserts the boolean.

| Combo | Expected |
| ----- | -------- |
| `Enter` + `Shift` + `Meta` (macOS) | `true` |
| `Enter` + `Shift` + `Ctrl` (Linux/Windows) | `true` |
| `Enter` alone | `false` |
| `Enter` + `Shift` only (ProseMirror soft-break) | `false` |
| `Enter` + `Ctrl` (Run & Stay) | `false` |
| `Enter` + `Shift` + `Ctrl` + `Alt` (Alt-modified) | `false` |
| `S` + `Shift` + `Meta` (non-Enter) | `false` |

### Toolbar — Split button placement and labelling

**Where:** [src/components/MarkdownEditor.test.tsx](../components/MarkdownEditor.test.tsx),
describe block `"MarkdownEditor toolbar — Split Cell button"`.

**Behavior under test:** the rendered toolbar must expose the Split action
in two specific places — a desktop icon button between the Table and More
dropdowns, and an entry inside the mobile More menu. The desktop control
shows the long title "Split Cell at Cursor (…)" because it doubles as a
keyboard-shortcut hint; the mobile entry uses the shorter label
"Split Cell".

**How it is tested:** all `@milkdown/*` and ProseMirror modules are
mocked out with `vi.mock(...)` so `MarkdownEditor` mounts with no real
editor instance — the test only inspects the surrounding toolbar JSX. A
helper `renderToolbar()` mounts the component with a fake markdown cell.

| Test | What it does | Why it passes |
| ---- | ------------ | ------------- |
| Desktop button exists | Queries every element with a title matching `Split Cell at Cursor` | Desktop button title starts with that exact phrase |
| Correct relative order | Inside `.hidden.sm:flex` (the desktop toolbar), reads `[title]` attributes in DOM order and asserts `Table Options < Split Cell at Cursor < More Formatting` | The JSX renders the Split button between those two dropdowns |
| Mobile entry exists | Locates the mobile wrapper `.flex.sm:hidden`, clicks its `More Formatting` trigger, then matches the exact text `Split Cell` | Mobile dropdown contains an item with that label |

### Store — `actions.insertMarkdownCell`

**Where:** [src/lib/store.test.ts](../lib/store.test.ts), describe block
`"actions.insertMarkdownCell"`.

**Behavior under test:** `insertMarkdownCell(index, content)` is the
primitive used by the split feature. It must add a new markdown cell at
the requested index without disturbing whichever cell currently has focus
or is being edited, and the operation must be undoable in one step.

**How it is tested:** a `seedNotebook(cells, activeCellId?)` helper resets
the store via `actions.loadNotebook(...)` before each scenario so tests
start from a known baseline. Each test then calls the action and reads
back from `notebookStore`.

| Test | Setup | What is asserted |
| ---- | ----- | ---------------- |
| Inserts at requested index | Two cells `["a", "b"]`, insert content `"inserted"` at index 1 | Cell ids become `["a", <new>, "b"]`; new cell has `type: "markdown"`, given content, `isEditing: false` |
| Active cell preserved | Active id `"a"`, insert at 1 | `notebookStore.activeCellId` still `"a"` |
| Sibling edit-mode preserved | Cell `"a"` has `isEditing: true`, insert at 1 | `"a"` still editing, `"b"` not editing, new cell not editing |
| Insert at start | Insert at index 0 | New cell becomes `cells[0]` |
| Insert at end | Insert at `cells.length` | New cell becomes the last cell |
| Single-step undo | Single existing cell, insert one new cell, then `actions.undo()` | `historyIndex` advanced by the action; one undo restores the original `["a"]` cell list |

The undo case validates that the action records its add + content set as a
batched compound entry, so the user does not need two undos to reverse a
split.

---

## Feature: Toolbar dropdown stacking

The markdown formatting toolbar contains several dropdowns. Each cell in
the notebook has a high `z-index` set in
[CellWrapper.tsx](../components/CellWrapper.tsx) so earlier cells visually
overlap later ones for shadows and handle affordances. A toolbar dropdown
that renders into a portal becomes a sibling of every cell in `<body>`
and gets painted **under** the cells, even at `z-50`.

**Behavior under test:** every dropdown in the markdown toolbar must
render in-flow (inside the cell's stacking context), not via `<Portal>`.

**Where:** [src/components/MarkdownEditor.test.tsx](../components/MarkdownEditor.test.tsx),
describe block `"MarkdownEditor toolbar — dropdowns are not clipped by the cell"`.

**How it is tested:** with the same mocked-Milkdown render harness, the
test:

1. Selects every toolbar trigger whose `title` matches a known dropdown
   (`Heading Options`, `More Formatting` × 2, `Table Options`).
2. For each trigger, clicks it, then queries `baseElement` (the test's
   document body) for any element with `role="menu"` that is **not** a
   descendant of the toolbar's `container`.
3. Asserts that this list is empty — i.e. no menu escaped into a portal.
4. Clicks the trigger again to close it before moving on.

If a future change re-introduces `usePortal={true}` on a toolbar dropdown,
this test fails with a message naming the offending trigger.
