# Tailwind v4 Theme System with Runtime Color Switching

## How It Works

Our app uses Tailwind v4's `@theme` directive combined with runtime CSS variable updates to enable dynamic theme switching.

### Architecture

1. **@theme block in index.css** - Defines color utilities that reference CSS variables:
```css
@theme {
  --color-primary: var(--primary);
  --color-secondary: var(--secondary);
  --color-accent: var(--accent);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-success: var(--success);
  --color-error: var(--error);
  --color-warning: var(--warning);
  --color-info: var(--info);
}
```

This tells Tailwind to generate utilities like `text-success`, `bg-error`, `text-primary` that reference the `--color-*` CSS variables.

2. **theme.ts runtime updates** - Sets color values dynamically:
```typescript
root.style.setProperty("--success", theme.colors.success);
root.style.setProperty("--color-success", theme.colors.success);
```

Both the base variable (`--success`) and the Tailwind variable (`--color-success`) must be set at runtime.

3. **Component usage** - Use standard Tailwind utilities:
```tsx
<div class="text-success">Success!</div>
<div class="bg-error">Error</div>
```

## CRITICAL: Do NOT Define :root Defaults for Theme Colors

**WRONG:**
```css
:root {
  --success: #22c55e;
  --error: #dc2626;
  --warning: #eab308;
}
```

**RIGHT:**
```css
:root {
  /* Only non-theme variables here */
  --bg-color: #ffffff;
}
```

### Why?

When you define `:root` defaults for theme colors, they **interfere with the @theme block's variable references**. The chain breaks:

- `@theme { --color-success: var(--success) }` references `--success`
- If `:root { --success: #22c55e }` exists, it creates priority conflicts
- Tailwind v4 struggles to resolve the variable chain correctly
- Utilities like `text-success` may not apply colors properly

Instead, let `theme.ts` handle ALL color variable initialization at runtime. The app loads fast enough that users won't see unstyled content.

## Adding New Theme Colors

To add a new themeable color:

1. Add to `@theme` block in index.css:
```css
@theme {
  --color-mynew: var(--mynew);
}
```

2. Add to Theme interface in theme.ts:
```typescript
export interface Theme {
  colors: {
    mynew: string;
  }
}
```

3. Set both variables in initTheme():
```typescript
root.style.setProperty("--mynew", theme.colors.mynew);
root.style.setProperty("--color-mynew", theme.colors.mynew);
```

4. Use in components:
```tsx
<div class="text-mynew bg-mynew/10">Content</div>
```

## Status Colors

The success/error/warning/info colors follow the exact same pattern as primary/secondary/accent. They were added to support semantic status indicators throughout the app:

- **Success** (green): Kernel ready, successful execution, valid states
- **Error** (red): Errors, critical issues, failed states  
- **Warning** (yellow): Warnings, stderr output, loading/running states
- **Info** (cyan): Informational content, neutral status

These integrate with the theme system and can be customized just like any other theme color.

## Tailwind v4 Differences from v3

- Uses `@theme` directive instead of `theme:` in config file
- CSS variables are first-class citizens
- No JIT mode toggle needed (always on)
- Cleaner integration with runtime CSS variable updates
- Better performance with native CSS features
