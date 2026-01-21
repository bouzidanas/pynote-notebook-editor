# Guide: Adding New UI Components

This guide walks you through creating a new UI component (e.g., a `Button`) and integrating it into PyNote.

## Step 1: Python Implementation

Create a new class in `packages/pynote_ui/src/pynote_ui/elements.py` (or a new file).

1.  **Inherit** from `UIElement`.
2.  **Initialize** properties in `__init__` and call `super().__init__`.
3.  **Implement** property setters to trigger `send_update`.
4.  **Implement** `handle_interaction` to process frontend events.

```python
# packages/pynote_ui/src/pynote_ui/elements.py
from .core import UIElement

class Button(UIElement):
    def __init__(self, label="Click Me", clicked=False):
        self._label = label
        self._clicked = clicked
        # Pass initial props to base class
        super().__init__(label=label, clicked=clicked)

    def handle_interaction(self, data):
        # Handle 'click' event from JS
        if data.get("type") == "click":
            self._clicked = True
            print(f"Button {self._label} was clicked!")

    @property
    def label(self):
        return self._label

    @label.setter
    def label(self, value):
        self._label = value
        # Push update to JS
        self.send_update(label=value)
```

## Step 2: SolidJS Implementation

Create a new component in `src/components/ui-renderer/Button.tsx`.

1.  **Register Listener:** Use `kernel.registerComponentListener` on mount.
2.  **Render:** Use Tailwind/DaisyUI classes.
3.  **Send Events:** Use `kernel.sendInteraction`.

```tsx
// src/components/ui-renderer/Button.tsx
import { type Component, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";

interface ButtonProps {
  id: string;
  props: {
    label: string;
    clicked: boolean;
  };
}

const Button: Component<ButtonProps> = (p) => {
  const [label, setLabel] = createSignal(p.props.label);

  onMount(() => {
    // Listen for python updates (e.g. btn.label = "New")
    kernel.registerComponentListener(p.id, (data: any) => {
      if (data.label) setLabel(data.label);
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(p.id);
  });

  const handleClick = () => {
    // Send event to Python
    kernel.sendInteraction(p.id, { type: "click" });
  };

  return (
    <button class="btn btn-primary" onClick={handleClick}>
      {label()}
    </button>
  );
};

export default Button;
```

## Step 3: Registration

Register the new component in `src/components/ui-renderer/ComponentRegistry.tsx`.

```tsx
import { lazy } from "solid-js";

export const ComponentRegistry: Record<string, Component<any>> = {
  "Slider": lazy(() => import("./Slider")),
  "Button": lazy(() => import("./Button")), // <--- Add this
};
```

## Step 4: Rebuild

1.  Rebuild the Python package: `./scripts/build_python_pkg.sh`
2.  Refresh the app (if dev server is running).
