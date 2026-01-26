# Adding New Components

This guide walks through creating a new UI component. We'll use a Button as the example.

## Overview

You need to touch three places:
1. **Python class** — in `pynote_ui` (embedded in the worker)
2. **SolidJS component** — in `src/components/ui-renderer/`
3. **Component registry** — map the name to the component

## Step 1: Python Class

The `pynote_ui` source is embedded in `src/lib/pyodide.worker.ts` as string templates. For development, you can also edit `packages/pynote_ui/src/pynote_ui/elements.py`, but the embedded version is what actually runs.

```python
from .core import UIElement

class Button(UIElement):
    def __init__(self, label="Click", disabled=False, width=None, height=None, 
                 grow=None, shrink=None, force_dimensions=False):
        self._label = label
        self._disabled = disabled
        super().__init__(
            label=label,
            disabled=disabled,
            width=width, height=height, grow=grow, 
            shrink=shrink, force_dimensions=force_dimensions
        )

    @property
    def label(self):
        return self._label

    @label.setter
    def label(self, value):
        self._label = value
        self.send_update(label=value)

    @property
    def disabled(self):
        return self._disabled

    @disabled.setter
    def disabled(self, value):
        self._disabled = value
        self.send_update(disabled=value)

    def handle_interaction(self, data):
        if data.get("type") == "click" and not self._disabled:
            # Default behavior: just print
            print(f"Button '{self._label}' clicked")
        super().handle_interaction(data)
```

### Key Points

| Pattern | Why |
|:--------|:----|
| Inherit from `UIElement` | Gets UUID, registration, `send_update()`, `_repr_mimebundle_()` |
| Store state as `self._label` | Underscore prefix avoids triggering setter in `__init__` |
| Property setter calls `send_update()` | Pushes changes to frontend |
| `handle_interaction` updates `self._x` directly | Avoids echo back (frontend already has the value) |
| Include layout props | All components should support `width`, `height`, `grow`, `shrink`, `force_dimensions` |

## Step 2: SolidJS Component

Create `src/components/ui-renderer/Button.tsx`:

```tsx
import { type Component, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";

interface ButtonProps {
  id: string;
  props: {
    label: string;
    disabled: boolean;
    width?: string | number | null;
    height?: string | number | null;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
  };
}

const Button: Component<ButtonProps> = (p) => {
  const [label, setLabel] = createSignal(p.props.label);
  const [disabled, setDisabled] = createSignal(p.props.disabled);

  // Sync with props changes (for re-renders)
  createEffect(() => {
    setLabel(p.props.label);
    setDisabled(p.props.disabled);
  });

  onMount(() => {
    // Listen for Python updates
    kernel.registerComponentListener(p.id, (data: any) => {
      if (data.label !== undefined) setLabel(data.label);
      if (data.disabled !== undefined) setDisabled(data.disabled);
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(p.id);
  });

  const handleClick = () => {
    if (!disabled()) {
      kernel.sendInteraction(p.id, { type: "click" });
    }
  };

  // Build styles from layout props
  const styles = () => {
    const s: Record<string, string | number | undefined> = {};
    
    if (p.props.grow != null) {
      s["flex-grow"] = p.props.grow;
      s["min-width"] = "0";
    }
    if (p.props.shrink != null) {
      s["flex-shrink"] = p.props.shrink;
    }
    if (p.props.width != null) {
      const w = typeof p.props.width === 'number' ? `${p.props.width}px` : p.props.width;
      s.width = w;
      if (p.props.force_dimensions) {
        s["flex-grow"] = 0;
        s["flex-shrink"] = 0;
      }
    }
    if (p.props.height != null) {
      const h = typeof p.props.height === 'number' ? `${p.props.height}px` : p.props.height;
      s[p.props.force_dimensions ? "height" : "min-height"] = h;
    }
    
    return s;
  };

  return (
    <button
      class="btn btn-primary"
      classList={{ "btn-disabled": disabled() }}
      onClick={handleClick}
      disabled={disabled()}
      style={styles()}
    >
      {label()}
    </button>
  );
};

export default Button;
```

### Key Points

| Pattern | Why |
|:--------|:----|
| `createSignal` for each prop | Local reactive state |
| `createEffect` syncing from `p.props` | Handles parent re-renders |
| `onMount` registers listener | Subscribe to Python updates |
| `onCleanup` unregisters | Prevent memory leaks |
| `kernel.sendInteraction()` | Send events to Python |
| Copy layout styles pattern | Consistent behavior across components |

## Step 3: Register in ComponentRegistry

Edit `src/components/ui-renderer/ComponentRegistry.tsx`:

```tsx
import type { Component } from "solid-js";
import { lazy } from "solid-js";

export const ComponentRegistry: Record<string, Component<any>> = {
  "Slider": lazy(() => import("./Slider")),
  "Text": lazy(() => import("./Text")),
  "Group": lazy(() => import("./Group")),
  "Button": lazy(() => import("./Button")),  // Add this
};
```

**The key must match the Python class name exactly** (case-sensitive).

<details>
<summary><strong>Why lazy loading?</strong></summary>

`lazy()` defers loading the component's code until it's actually used. If a user never creates a Button, they don't pay the network/parse cost. This keeps the initial bundle smaller.

</details>

## Step 4: Update Worker (if modifying embedded code)

If you edited the embedded Python strings in `pyodide.worker.ts`:

1. Add the class to the `elementsCode` template
2. Add to `__all__` in `__init__.py` template
3. Add the import

## Testing

```python
from pynote_ui import Button

btn = Button(label="Click me!")
btn  # Display
```

Check:
- Does it render?
- Does clicking work?
- Does `btn.label = "New"` update the UI?
- Does `btn.disabled = True` disable it?

## Callbacks

Users can register callbacks:

```python
btn = Button(label="Submit")

def on_click(data):
    print("Clicked!")
    btn.label = "Done"

btn.on_update(on_click)
```

The `on_update` method is from `UIElement`. When `handle_interaction` runs, it calls the callback if one is registered.

## Checklist

- [ ] Python class inherits from `UIElement`
- [ ] Props passed to `super().__init__(**kwargs)`
- [ ] Property setters call `send_update()`
- [ ] `handle_interaction()` updates internal state directly (not via setter)
- [ ] SolidJS component registers listener in `onMount`
- [ ] SolidJS component unregisters in `onCleanup`
- [ ] Component added to `ComponentRegistry`
- [ ] Registry key matches Python class name exactly
