# Customizable Select Dropdown Styling

## Overview

Native `<select>` elements have historically been impossible to fully style with CSS. The dropdown picker (the popup containing options) is rendered by the browser/OS and ignores most CSS properties.

**Chrome 135+** introduced `appearance: base-select` which enables full styling of select elements and their dropdown pickers.

## The Problem

With traditional `appearance: none`:
- You can style the select button itself
- You **cannot** style the dropdown panel (background, border, border-radius)
- You **cannot** style option hover/selected states reliably
- The dropdown uses OS-native rendering

## The Solution: `appearance: base-select`

```css
/* BOTH the select AND the picker need base-select */
select {
  appearance: base-select;
  /* Now you can style the select button */
}

select::picker(select) {
  appearance: base-select;
  /* Now you can style the dropdown panel */
  background-color: var(--background);
  border: 2px solid var(--primary);
  border-radius: 8px;
  padding: 4px;
}

/* Style options inside the picker */
select option {
  padding: 8px 12px;
}

select option:hover {
  background-color: rgba(128, 128, 128, 0.25);
}

select option:checked {
  background-color: var(--primary);
  color: white;
}
```

## Key Points

1. **Both elements need `appearance: base-select`** - Setting it only on the select or only on the picker won't work.

2. **Uses `::picker(select)` pseudo-element** - This targets the dropdown panel that appears when the select is opened.

3. **Removes native arrow** - `base-select` provides a styleable native arrow instead of the OS default.

4. **Options become styleable** - Hover, focus, checked states all work properly.

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | 135+ ✅ |
| Edge | 135+ ✅ |
| Firefox | ❌ Not yet |
| Safari | ❌ Not yet |

## Implementation in This Project

See [Select.tsx](../src/components/ui-renderer/Select.tsx) for the full implementation.

The select uses scoped styles with a unique class per component instance to avoid conflicts:

```tsx
const selectClass = `select-${componentId}`;

return (
  <>
    <style>
      {`
        .${selectClass} {
          appearance: base-select;
          /* ... button styles ... */
        }
        
        .${selectClass}::picker(select) {
          appearance: base-select;
          /* ... dropdown styles ... */
        }
      `}
    </style>
    <select class={selectClass}>
      {/* options */}
    </select>
  </>
);
```

## References

- [MDN: appearance property](https://developer.mozilla.org/en-US/docs/Web/CSS/appearance)
- [MDN: ::picker() pseudo-element](https://developer.mozilla.org/en-US/docs/Web/CSS/::picker)
