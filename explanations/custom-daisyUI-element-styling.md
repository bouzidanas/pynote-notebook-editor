# Custom Styling Native Form Elements

## Overview

Native form elements (`<select>`, `<input type="checkbox">`, etc.) and CSS framework component classes (like DaisyUI's `checkbox`, `select`) often have strong built-in styling that's difficult to override. This document explains how to achieve full styling control.

## General Principle: Remove Framework Classes + Use `appearance: none`

When you need complete control over a component's appearance:

1. **Remove framework component classes** - Classes like DaisyUI's `checkbox`, `select`, `toggle` apply opinionated styling that resists customization
2. **Reset native styling with `appearance: none`** - This removes browser default styling
3. **Build custom styles from scratch** - Use scoped CSS to implement exactly what you need

### Why `!important` Doesn't Work

Using `!important` to override framework styles is fragile:
- Framework classes may use multiple layers of specificity
- Pseudo-elements (like `::after`, `::before`) have their own cascade
- Changes to the framework can break your overrides
- Code becomes harder to maintain and debug

**Better approach:** Remove the framework class entirely and take full control.

**Better approach:** Remove the framework class entirely and take full control.

---

## Case Study 1: Custom Checkbox

### The Problem

DaisyUI's `checkbox` class applies complex styling including:
- Background colors for checked/unchecked states
- Custom checkmark using `::after` pseudo-element
- Border styling that's hard to override
- Filter effects for the checkmark color

Attempting to override with `!important` fails because the framework's pseudo-element styles have their own cascade.

### The Solution

Remove the `checkbox` class and use `appearance: none`:

```tsx
// Just the unique class, no DaisyUI class
const checkboxClass = `checkbox-${componentId}`;

const generateColorStyles = () => {
  const color = p.props.color ?? "primary";
  const colorVar = `var(--${color})`;
  
  return `
    .${checkboxClass} {
      appearance: none;
      background-color: transparent;
      border: 2px solid var(--foreground);
      border-radius: 4px;
      cursor: pointer;
      position: relative;
      display: inline-block;
      flex-shrink: 0;
    }
    .${checkboxClass}:checked {
      background-color: ${colorVar};
      border: 2px solid ${colorVar};
    }
    .${checkboxClass}:checked::after {
      content: '';
      position: absolute;
      left: 35%;
      top: 15%;
      width: 25%;
      height: 50%;
      border: solid var(--background);
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
    .${checkboxClass}:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;
};
```

### Key Points

1. **`appearance: none`** - Removes all native browser checkbox styling
2. **Custom checkmark** - Built with CSS borders and rotation (no font or SVG needed)
3. **Full control** - All states (unchecked, checked, disabled) styled exactly as needed
4. **No `!important`** - Clean CSS without specificity battles

See [Checkbox.tsx](../src/components/ui-renderer/Checkbox.tsx) for the full implementation.

---

## Case Study 2: Custom Select Dropdown

### The Problem

Select dropdowns have a unique challenge: even with `appearance: none`, you cannot style the dropdown picker panel (the popup with options). The picker is rendered by the browser/OS and ignores most CSS.

Traditional `appearance: none` limitations:
- You can style the select button itself
- You **cannot** style the dropdown panel (background, border, border-radius)
- You **cannot** style option hover/selected states reliably
- The dropdown uses OS-native rendering

## The Solution: `appearance: base-select` (Chrome 135+)

**Chrome 135+** introduced `appearance: base-select` which enables full styling of both the select button AND the dropdown picker.

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

## Key Points (Select-Specific)

1. **Both elements need `appearance: base-select`** - Setting it only on the select or only on the picker won't work.

2. **Uses `::picker(select)` pseudo-element** - This targets the dropdown panel that appears when the select is opened.

3. **Removes native arrow** - `base-select` provides a styleable native arrow instead of the OS default.

4. **Options become styleable** - Hover, focus, checked states all work properly.

5. **Browser support limited** - Only Chrome/Edge 135+ (as of Feb 2026). Fallback gracefully for other browsers.

## Browser Support (for `appearance: base-select`)

| Browser | Support |
|---------|---------|
| Chrome | 135+ ✅ |
| Edge | 135+ ✅ |
| Firefox | ❌ Not yet |
| Safari | ❌ Not yet |

## Implementation in This Project

Both components use scoped styles with unique classes per instance to avoid conflicts.

### Checkbox Implementation

See [Checkbox.tsx](../src/components/ui-renderer/Checkbox.tsx):
- No DaisyUI `checkbox` class
- Uses `appearance: none` to reset native styling
- Custom checkmark built with CSS borders
- Transparent unchecked state, colored checked state
- Full control over all visual aspects

### Select Implementation

See [Select.tsx](../src/components/ui-renderer/Select.tsx):
- No DaisyUI `select` class
- Uses `appearance: base-select` for full dropdown control
- Custom picker styling with `::picker(select)`
- Themed colors for options and hover states

### Pattern Used

### Pattern Used

```tsx
const componentClass = `component-${componentId}`;

return (
  <>
    <style>
      {`
        .${componentClass} {
          appearance: none; /* or base-select for select elements */
          /* ... custom styles ... */
        }
      `}
    </style>
    <input class={componentClass} />
  </>
);
```

This pattern:
- Generates unique class names to avoid global style conflicts
- Injects scoped CSS directly in the component
- Removes all framework classes for complete control
- Works with SolidJS's reactive rendering

---

## Summary: When to Use This Approach

Use this approach when:
- ✅ You need precise control over all visual aspects
- ✅ Framework classes conflict with your requirements
- ✅ You're implementing custom color schemes or themes
- ✅ Standard CSS overrides are being ignored

Don't use this approach when:
- ❌ Framework defaults work fine (don't over-engineer)
- ❌ You only need minor tweaks (use regular CSS overrides)
- ❌ You're prototyping and don't need pixel-perfect styling

## References

- [MDN: appearance property](https://developer.mozilla.org/en-US/docs/Web/CSS/appearance)
- [MDN: ::picker() pseudo-element](https://developer.mozilla.org/en-US/docs/Web/CSS/::picker)
- [MDN: ::after pseudo-element](https://developer.mozilla.org/en-US/docs/Web/CSS/::after) (used for custom checkmark)
- [CSS-Tricks: Custom Checkbox](https://css-tricks.com/custom-styling-form-inputs-with-modern-css-features/)
