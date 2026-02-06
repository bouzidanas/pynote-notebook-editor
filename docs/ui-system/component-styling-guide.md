# UI Component Styling Guide

This document outlines the styling conventions and design tokens used across all UI components in the pynote-notebook-editor.

## Size Presets

All interactive components use a consistent 5-step size scale. Font sizes use Tailwind's existing CSS variables.

| Size | Padding | Font Size Variable | Tailwind Class |
|------|---------|-------------------|----------------|
| `xs` | 6px | `var(--text-2xs)` (~0.625rem) | `text-[length:var(--text-2xs)]` |
| `sm` | 8px | `var(--text-xs)` (0.75rem) | `text-xs` |
| `md` | 12px | `var(--text-sm)` (0.875rem) | `text-sm` |
| `lg` | 14px | `var(--text-base)` (1rem) | `text-base` |
| `xl` | 16px | `var(--text-lg)` (1.125rem) | `text-lg` |

**Default size:** `md`

**Note:** `--text-2xs` is defined in `index.css` as `calc(var(--text-xs) * 0.833)`. All other variables (`--text-xs`, `--text-sm`, `--text-base`, `--text-lg`) are provided by Tailwind.

## Color Tokens

### Border Colors

| Usage | Token | Example |
|-------|-------|---------|
| Default border | `var(--foreground)` | `border-foreground` or `border: 2px solid var(--foreground)` |
| Highlight/focus border | `var(--primary)` | `border-primary` or `border-color: var(--primary)` |
| Border width | 2px | `border-2` |

### Background Colors

| Usage | Token | Tailwind Class |
|-------|-------|----------------|
| Component background | `var(--background)` | `bg-background` |
| Subtle container bg | `var(--base-200)` at 50% opacity | `bg-base-200/50` |
| Input background | `var(--base-100)` at 30% opacity | `bg-base-100/30` |

### Text Colors

| Usage | Token | Tailwind Class |
|-------|-------|----------------|
| Primary text | `var(--secondary)` | `text-secondary` |
| Header/label (muted) | `var(--color-secondary)` at 70% | `text-secondary/70` |
| Placeholder text | `color-mix(in oklch, var(--color-secondary) 70%, transparent)` | - |

### Interactive States

| State | Background | Border |
|-------|------------|--------|
| Default | transparent or base color | `var(--foreground)` |
| Hover | `color-mix(in oklch, var(--color-secondary) 20%, transparent)` | unchanged |
| Focus/Open | unchanged | `var(--primary)` |
| Selected/Checked | `var(--primary)` | `var(--primary)` |
| Disabled | 50% opacity | unchanged |

## Component-Specific Patterns

### Select (Dropdown)

```css
/* Use :open instead of :focus for dropdown-only highlight */
select:open {
  border-color: var(--primary);
}

/* Don't highlight on :focus to avoid persistent highlight after closing */
select:focus {
  outline: none;
}

/* Selected option styling */
option:checked {
  background-color: var(--primary);
  color: var(--background);
}

/* Hover state in dropdown */
option:hover {
  background-color: color-mix(in oklch, var(--color-secondary) 25%, transparent);
}
```

### Input / Textarea

```tsx
// Focus-visible styling (keyboard focus only)
"focus-visible:outline-none focus-visible:border-primary"

// Prevent keyboard shortcuts when typing
onKeyDown={(e) => e.stopPropagation()}
```

### Toggle (Sliding Switch)

Custom implementation (DaisyUI toggle had issues):

| Size | Track Width | Track Height | Thumb Size |
|------|-------------|--------------|------------|
| `xs` | 28px | 16px | 12px |
| `sm` | 36px | 20px | 16px |
| `md` | 44px | 24px | 20px |
| `lg` | 52px | 28px | 24px |
| `xl` | 60px | 32px | 28px |

- Track uses `rounded-full`
- Thumb offset: 2px from edge
- Unchecked track color: `var(--foreground)`
- Checked track color: `var(--primary)` or color prop

### Checkbox

| Size | Checkbox Dimensions |
|------|---------------------|
| `xs` | 14px × 14px |
| `sm` | 16px × 16px |
| `md` | 20px × 20px |
| `lg` | 24px × 24px |
| `xl` | 28px × 28px |

### Button

Uses DaisyUI button classes with size-responsive padding and font.

## Common Classes

```tsx
// Container wrapper (for labeled controls like Checkbox, Toggle)
"flex items-center gap-2 cursor-pointer font-mono text-secondary bg-base-200/50 border-2 border-foreground rounded-sm"

// Input/Textarea base
"font-mono border-2 border-foreground rounded-sm bg-base-100/30 focus-visible:outline-none focus-visible:border-primary"

// Text display
"bg-base-200/50 border-2 border-foreground rounded-sm font-mono text-secondary"
```

## Border Radius

Use CSS variable for consistency:
- `border-radius: var(--radius-sm)` or `rounded-sm`

## Typography

All UI components use monospace font:
- `font-mono`

## Accessibility

1. **Keyboard Navigation**: All interactive elements must be keyboard accessible
2. **Focus Indicators**: Use `focus-visible:border-primary` for keyboard focus
3. **Screen Reader**: Use `sr-only` class to hide visual-only elements while keeping them accessible
4. **Stop Propagation**: Text inputs should call `e.stopPropagation()` on `keydown` to prevent triggering notebook shortcuts

## Adding New Components

1. Accept standard props: `size`, `color`, `disabled`, `width`, `height`, `grow`, `shrink`, `force_dimensions`
2. Create a `sizeConfig()` function returning `{ padding, textSize, ...componentSpecific }`
3. Use `createSignal` for reactive state
4. Register component listener in `onMount`, unregister in `onCleanup`
5. Apply consistent border, background, and text color tokens
6. Add `size` property getter/setter to Python class in `elements.py` and `pyodide.worker.ts`
