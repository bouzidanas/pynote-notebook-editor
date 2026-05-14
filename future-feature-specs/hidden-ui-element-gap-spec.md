# Hidden UI Element Gap / Phantom Spacing

## Problem

When `pynote_ui` components (`Text`, `Group`, `Form`, `Input`, etc.) are
hidden via `hidden=True`, extra vertical space sometimes remains in the
cell output where the element used to be. This is most visible at the end
of cells whose final UI elements are conditionally hidden.

The component itself collapses correctly — `hidden=True` resolves to
`display: none` on the component's root element, and CSS flex `gap` skips
`display: none` children, so the immediate flex gap should not contribute
phantom spacing.

## Suspected Causes

1. **Wrapper divs around UI segments in stdout rendering.**  
   In `src/components/Output.tsx`, each top-level UI segment is wrapped in
   a div like:

   ```tsx
   <div class="mt-2 first:mt-0 min-w-0 w-full">
     <UIOutputRenderer data={segment.data} />
   </div>
   ```

   The wrapper is **not** tied to the child's hidden state. When the
   inner component resolves to `display: none`:
   - The wrapper still occupies a child slot in the parent
     `flex flex-col gap-5` container, consuming a `gap-5` reservation.
   - The wrapper's own `mt-2` margin still applies.

   The same pattern exists in:
   - The UI-only paragraph branch (`<div class="w-full">`)
   - The inline mixed-paragraph branch (`<span class="inline-block align-middle">`)

2. **Group / Form wrapper persists when all children are hidden.**  
   `Group` (and `Form`) render an outer padded/bordered wrapper when
   `border` is truthy or a `label` exists. If every child becomes
   `display: none`, the wrapper itself remains visible as a small empty
   box (~24px of padding plus the label). `Group` does not introspect
   whether all of its children are hidden.

## Constraints

- **Preserve existing transitions.** Although today's hide implementation
  is a hard `display: none`, future work may add height/opacity
  transitions for expand/collapse effects. Any fix must not preclude
  smooth transitions later.
- The Python-side API (`hidden=True`) should remain the source of truth;
  fixes should not require new wrapper-level data plumbing if avoidable.

## Possible Approaches

1. **Hidden-aware wrappers.** Have `UIOutputRenderer` (or its parent
   wrappers in `Output.tsx`) read `data.props.hidden` and apply
   `display: none` on the wrapper as well. Cheap, but couples the
   wrapper to a known prop name.

2. **Auto-collapsing Group / Form.** When every direct child resolves to
   `hidden=True`, treat the Group itself as hidden. Either:
   - Recompute in `Group.tsx` by inspecting `children[*].props.hidden`
     (works only for declared static hidden state), or
   - Move the responsibility to the Python side (`Group.hide_if_empty`).

3. **CSS-only "has hidden children" pattern.** Use `:has()` selectors to
   collapse wrappers when their only child is `display: none`. Avoids
   prop coupling but `:has` browser support and Solid's class generation
   need verification.

## Repro Hint

Build a notebook cell whose last visible output is a `Group` containing
only `Text` elements that all become `hidden=True` after a state change.
Observe the trailing space below the cell content.

## Related Files

- `src/components/Output.tsx` — segment wrappers in stdout rendering.
- `src/components/ui-renderer/UIOutputRenderer.tsx` — generic dispatcher.
- `src/components/ui-renderer/Group.tsx` — wrapper rendering and hidden handling.
- `src/components/ui-renderer/Form.tsx` — same patterns as Group.
- `src/components/ui-renderer/Text.tsx`, `Input.tsx`, etc. — leaf hidden handling.
