# Section Anchor Links (Scroll-to-Heading) Specification

## Objective
Allow URLs (and in-app links) to deep-link to a specific markdown heading within a notebook — e.g. `…/notebook#installation` — analogous to the standard "click a `#` next to a heading" behavior on documentation sites. Today PyNote can scroll to a *cell*, but not to a *heading inside a markdown cell*.

## Background / Constraints
- Notebook content is split across many cells; only **markdown cells** contribute headings.
- Markdown is rendered per-cell via `marked.parse()` inside a `createEffect` in [MarkdownCell.tsx](../src/components/MarkdownCell.tsx) and the resulting HTML is injected via `setParsedContent`. Headings currently get **no `id` attribute**.
- Cells may not all be in the DOM at the moment a hash is resolved (e.g. on cold load, or if lazy-rendering is ever introduced), and a target cell may finish rendering *after* `hashchange` fires.
- Heading text can be edited at any time, so any URL scheme must degrade gracefully when slugs change.
- Section scoping (`section-scope` divs) and presentation mode already manipulate the rendered tree — the solution must not interfere with them.

## Chosen Approach: Slug + Registry with Pending-Hash Queue
Pretty hash URLs (`#installation`) backed by a runtime registry of `{slug → {cellId, element}}`. A single hash-scroll dispatcher resolves hashes against the registry; if the slug isn't registered yet (cell not mounted / not rendered), the hash is queued and flushed when the matching heading registers.

### Why this approach
- **Pretty, copy-pasteable URLs** — matches user expectations from MDN, GitHub, etc.
- **No data-model / `.ipynb` schema changes** — IDs are derived at render time.
- **Render-timing safe** — queue + flush handles the "cell not mounted yet" case.
- **Graceful degradation** — stale links (heading renamed, cell deleted) simply do nothing instead of throwing; optional fallback can scroll to the owning cell.
- **Cheap** — ~100–150 LOC, one tiny dependency (`github-slugger`) or an inline 10-line slugger.

## Components

### 1. `src/lib/headingRegistry.ts` (new)
A Solid store + signal-based registry shared across the app.

**Shape:**
```ts
type HeadingEntry = { cellId: string; el: HTMLElement };

interface HeadingRegistry {
  register(slug: string, cellId: string, el: HTMLElement): void;
  unregister(slug: string, cellId: string): void;       // cellId guard prevents stomping
  resolve(slug: string): HeadingEntry | undefined;
  requestScroll(slug: string): void;                    // queues if not yet registered
  // internal: pendingHash signal, flush() called by register()
}
```

**Behavior:**
- Backed by a `Map<string, HeadingEntry>` (not a Solid store — entries are non-reactive DOM nodes).
- A `pendingHash` `createSignal<string | null>` holds at most one queued slug.
- `register` always checks `pendingHash()` and, if it matches, calls the scroll routine and clears the signal.
- `unregister` only removes the entry when the stored `cellId` matches (avoids races when a cell re-renders before the previous cleanup runs).
- A short timeout (e.g. 2s) inside `requestScroll` clears stale pending hashes so they don't fire later when an unrelated cell with the same slug mounts.

### 2. Slug generation
Use [`github-slugger`](https://www.npmjs.com/package/github-slugger) (~2 KB) for GitHub-compatible slugs and per-instance dedupe (`installation`, `installation-1`, …). A `Slugger` instance is created **per markdown cell render** so dedupe is cell-local.

Cross-cell collisions are resolved by the registry on `register`:
- If the slug is free → use as-is.
- If taken by a *different* cell → suffix with a short hash of `cellId` (e.g. `installation--a3f1`). The suffix is also written back onto the heading's `id` so the URL is copyable.

### 3. `MarkdownCell.tsx` post-render hook
Inside the existing `createEffect` that calls `setParsedContent`, after the new HTML mounts:

```ts
// pseudo-code, runs after parsedContent is in the DOM
const container = cellRef;  // existing ref to the rendered markdown container
const slugger = new Slugger();
const ownedSlugs: string[] = [];

container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
  const base = slugger.slug(h.textContent ?? '');
  const finalSlug = headingRegistry.register(base, props.cell.id, h as HTMLElement);
  (h as HTMLElement).id = finalSlug;
  ownedSlugs.push(finalSlug);
});

onCleanup(() => ownedSlugs.forEach(s => headingRegistry.unregister(s, props.cell.id)));
```

Notes:
- Must run **after** `setParsedContent` settles. Use `queueMicrotask` or wrap registration in a second `createEffect` keyed on `parsedContent()`.
- Must **not** run when `shouldHideInPresentation()` is true (or must unregister when toggled).
- `section-scope` wrapper divs are unaffected — the `querySelectorAll` walks through them.

### 4. `useHashScroll` in `Notebook.tsx`
Mounted once at notebook level:

```ts
function useHashScroll() {
  const handle = () => {
    const slug = decodeURIComponent(location.hash.slice(1));
    if (!slug) return;
    const entry = headingRegistry.resolve(slug);
    if (entry) scrollToHeading(entry);
    else headingRegistry.requestScroll(slug);
  };
  onMount(handle);                          // initial load
  window.addEventListener('hashchange', handle);
  onCleanup(() => window.removeEventListener('hashchange', handle));
}
```

`scrollToHeading` calls `el.scrollIntoView({ behavior: 'smooth', block: 'start' })` and optionally:
- Sets `notebookStore.activeCellId` to the owning cell.
- Briefly highlights the heading (CSS class added for ~1.5s) so users see what was matched.
- Accounts for any sticky toolbar via `scroll-margin-top` on `h1–h6` (CSS-only).

### 5. Optional: "Copy link" affordance
GitHub-style `#` icon that appears on hover next to each heading. Implementation: pure CSS (`h1:hover::before { content: '#'; … }`) plus a single delegated click handler on the cell container that copies `${location.origin}${location.pathname}#${heading.id}` to clipboard.

## URL Examples
- `…/notebook` — no scroll behavior (current).
- `…/notebook#installation` — scrolls to the first heading sluggable as `installation`.
- `…/notebook#installation--a3f1` — disambiguated form when the same heading text exists in multiple cells.

## Edge Cases & Decisions
| Case | Behavior |
|------|----------|
| Hash arrives before cell renders | Queued in `pendingHash`; flushed on `register`. Auto-clears after 2s. |
| Heading renamed | Old slug unregisters, new slug registers. Old links no longer resolve (acceptable). |
| Cell deleted | `onCleanup` removes its slugs. Hash becomes a no-op. |
| Same heading text in two cells | Second registration suffixed with `--<cellIdHash>`. |
| Cell hidden in presentation mode | Skip registration; if user hash-navigates to it, no-op (or fall back to nearest visible cell — TBD). |
| Cell collapsed / scrolled out of virtualized window (future) | Registry stores `cellId`; dispatcher can call `scrollToCell(cellId)` first, then re-resolve. |
| Hash with non-existent slug | No-op after pending-queue timeout. Optional console warning in dev. |
| Browser back/forward | Native — `hashchange` fires, listener handles it. |

## Out of Scope (Possible Follow-ups)
- **TOC sidebar** generated from the registry — easy follow-up, all data is already there.
- **Stable persistent heading IDs** stored in the cell model (Solution 3 from the original discussion) — only worth doing if section links become a long-term first-class linking surface (e.g. cross-notebook references).
- **Cross-notebook section links** — would require persistent IDs and a notebook-aware router.
- **Anchor preservation across markdown editing in real time** — current spec only updates anchors on render commit.

## Files Touched
- **New:** `src/lib/headingRegistry.ts`
- **Modified:** [src/components/MarkdownCell.tsx](../src/components/MarkdownCell.tsx) — register/unregister hook after `setParsedContent`.
- **Modified:** [src/components/Notebook.tsx](../src/components/Notebook.tsx) — mount `useHashScroll` once.
- **Modified (optional):** `src/index.css` or component CSS — `scroll-margin-top`, hover `#` affordance, brief highlight animation.
- **Dependency (optional):** `github-slugger`. Alternative: inline ~10-line slugger.

## Estimated Cost
~100–150 LOC across 3 files. No store/schema changes, no `.ipynb` format changes. Runtime overhead: one `querySelectorAll('h1,h2,h3,h4,h5,h6')` per markdown re-render (which already happens on every edit) plus `Map` operations.

## Acceptance Criteria
1. Loading the app with `#some-heading` in the URL scrolls smoothly to that heading once it renders.
2. Changing the URL hash (e.g. via a TOC link) scrolls without a full page reload.
3. Two markdown cells containing the same heading text both get unique, working IDs.
4. Deleting a markdown cell removes its slugs from the registry; subsequent navigation to those slugs is a no-op.
5. Browser back/forward correctly re-triggers scrolling.
6. No regressions in section scoping, presentation mode, or markdown rendering.
