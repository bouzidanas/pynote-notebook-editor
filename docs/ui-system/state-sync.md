# State Synchronization

UI components live in two places: Python objects in the worker, and SolidJS components in the DOM. This doc explains how their state stays in sync.

## The Two Directions

```
Python                                    SolidJS
slider._value = 50                        const [value, setValue] = createSignal(50)
      │                                          │
      │                                          │
      ▼                                          ▼
slider.value = 75      ───────────────▶    setValue(75)
(property setter)         postMessage       (UI re-renders)
      
      
User drags slider      ◀───────────────    onInput event
slider._value = 75        postMessage       sendInteraction()
```

**Python → Frontend:** When Python code does `slider.value = 75`, the property setter calls `send_update()`, which posts a message. The frontend component's listener fires, updating its signal.

**Frontend → Python:** When the user drags a slider, the component calls `kernel.sendInteraction()`. The worker routes this to the Python object's `handle_interaction()` method.

## Python Side

### UIElement Base Class

Every component inherits from `UIElement` (`pynote_ui/core.py`):

```python
class UIElement:
    def __init__(self, **props):
        self.id = str(uuid.uuid4())
        self.props = props
        self._on_update = None
        StateManager.register(self)

    def send_update(self, **kwargs):
        """Push changes to frontend."""
        self.props.update(kwargs)
        StateManager.send_update(self.id, kwargs)  # Routes via comm_target callback

    def on_update(self, callback):
        """Register callback for interactions."""
        self._on_update = callback

    def handle_interaction(self, data):
        """Receive user interaction."""
        if self._on_update:
            self._on_update(data)
```

### Property Pattern

Components use property descriptors to trigger updates:

```python
class Slider(UIElement):
    def __init__(self, value=50, ...):
        self._value = value  # Internal storage (no update)
        super().__init__(value=value, ...)

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, val):
        self._value = val
        self.send_update(value=val)  # Push to frontend
```

When Python code does `slider.value = 75`:
1. Setter stores in `self._value`
2. Setter calls `send_update(value=75)`
3. Message goes to frontend
4. Component signal updates

### Handling Interactions

When the frontend sends an interaction:

```python
def handle_interaction(self, data):
    if "value" in data:
        self._value = data["value"]  # Direct update, NOT self.value = ...
    super().handle_interaction(data)  # Calls user callback
```

**Important:** Use `self._value`, not `self.value`. Using the property setter would call `send_update()` again, which is wasteful—the frontend already has the new value.

## Frontend Side

### Component Pattern

SolidJS components use signals for local state:

```tsx
const Slider: Component<SliderProps> = (p) => {
  const [value, setValue] = createSignal(p.props.value);

  onMount(() => {
    // Subscribe to Python updates
    kernel.registerComponentListener(p.id, (data: any) => {
      if (data.value !== undefined) {
        setValue(data.value);
      }
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(p.id);
  });

  const handleInput = (e: Event) => {
    const newValue = (e.target as HTMLInputElement).valueAsNumber;
    setValue(newValue);  // Optimistic local update
    kernel.sendInteraction(p.id, { value: newValue });
  };

  return <input type="range" value={value()} onInput={handleInput} />;
};
```

<details>
<summary><strong>Background: SolidJS signals</strong></summary>

`createSignal` returns a getter function and a setter function. When you read `value()`, SolidJS tracks that the current rendering context depends on this signal. When you call `setValue(75)`, SolidJS updates only the DOM nodes that depend on it—not the whole component.

This is "fine-grained reactivity": updates are surgical, not tree-wide.

</details>

### Listener Registration

`Kernel` maintains a map of component listeners:

```typescript
class Kernel {
  private componentListeners = new Map<string, Function[]>();

  registerComponentListener(id: string, callback: Function) {
    const listeners = this.componentListeners.get(id) || [];
    this.componentListeners.set(id, [...listeners, callback]);
  }

  unregisterComponentListener(id: string) {
    this.componentListeners.delete(id);
  }

  // Called when worker sends "component_update" message
  private handleUIUpdate(uid: string, data: any) {
    const listeners = this.componentListeners.get(uid) || [];
    listeners.forEach(cb => cb(data));
  }
}
```

## Flow Examples

### User Drags Slider

1. `onInput` fires on the DOM element
2. Component does `setValue(75)` (optimistic update—UI responds immediately)
3. Component calls `kernel.sendInteraction(id, {value: 75})`
4. Message posted to worker: `{type: "interaction", uid: id, data: {value: 75}}`
5. Worker calls `StateManager.update(id, {value: 75})`
6. Python `slider.handle_interaction({value: 75})` runs
7. `self._value = 75` (internal update)
8. User callback fires if registered

### Python Updates Slider

```python
slider.value = 75
```

1. Property setter stores `self._value = 75`
2. Setter calls `self.send_update(value=75)`
3. `StateManager.send_update()` invokes the comm_target callback
4. Callback posts message: `{type: "component_update", uid: id, data: {value: 75}}`
5. `Kernel.handleUIUpdate()` looks up listeners
6. Component callback fires: `setValue(75)`
7. SolidJS updates the DOM

### Callback Triggers Another Update

```python
def on_change(data):
    slider.label = f"Value: {data['value']}"

slider.on_update(on_change)
```

When user drags:
1. Interaction arrives
2. `handle_interaction` updates `_value`
3. `handle_interaction` calls `on_change`
4. `on_change` does `slider.label = "Value: 75"`
5. Property setter calls `send_update(label="Value: 75")`
6. Another `component_update` message goes to frontend
7. Label updates

This is intentional chaining—the callback explicitly asked to change the label.

## Avoiding Circular Updates

The pattern prevents infinite loops:

1. **User interaction:** Frontend updates signal first (optimistic), then sends message
2. **Python receives:** Updates `self._value` directly (not via setter)
3. **No echo back:** `handle_interaction` doesn't call `send_update()` for the same property

If user drags slider to 75:
- Frontend already has 75 (optimistic update)
- Python stores 75 internally
- No message back to frontend

If callback does `slider.value = 76` (changing to different value), that goes through the setter and pushes to frontend. That's intentional, not circular.

## Initial Display

When a cell displays a component:

1. Python: `_repr_mimebundle_()` returns JSON with current props
2. JSON sent via stdout marker
3. Frontend parses, mounts component with initial props
4. Component's `createSignal` initializes from `p.props.value`
5. `onMount` registers listener for future updates

The component starts with Python's current state and stays in sync via messages.

## Cleanup

When a cell is cleared or re-run:

1. **Frontend:** `onCleanup` hook fires, calls `unregisterComponentListener(id)`
2. **Python:** `StateManager.clear_cell(cellId)` removes objects from registry

If an old component receives a `component_update` message after cleanup, it's harmless—the listener map no longer has that ID, so the message is ignored.
