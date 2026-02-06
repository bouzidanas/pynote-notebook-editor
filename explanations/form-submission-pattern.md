# Form Submission Pattern

## Overview

The Form component implements a deferred synchronization pattern where child input components don't immediately communicate with the Python backend until a submit action is triggered. This document explains how submission works and how to extend it to new components.

## Architecture

### Form Component Flow

1. **Form creates FormContext** - Provides registration methods for child components
2. **Child components register** - Input components register with FormContext on mount
3. **Values stored locally** - Component values stored in Form's internal Map
4. **Submit triggered** - ANY component with submit capability can trigger submission
5. **Values collected** - Form collects all child values into a dictionary
6. **Two-phase sync**:
   - Phase 1: Send complete dict to Python → `Form.value` populated
   - Phase 2: Sync each child individually → `Input.value`, `Checkbox.checked`, etc. updated

### onSubmit Propagation

The key to extensibility is automatic `onSubmit` propagation:

```tsx
// Form.tsx passes onSubmit to UIOutputRenderer
<UIOutputRenderer data={childData} onSubmit={handleSubmit} />

// UIOutputRenderer passes onSubmit to ALL children via Dynamic
<Dynamic component={Comp()} id={props.data.id} props={props.data.props} onSubmit={props.onSubmit} />
```

This means **every component inside a Form automatically receives the `onSubmit` prop**, whether they use it or not.

## Button Component Pattern

Button demonstrates the canonical submit pattern:

```tsx
interface ButtonProps {
  id: string;
  props: {
    button_type?: "default" | "primary" | "submit" | null;
    // ... other props
  };
  onSubmit?: () => void;  // ← Received from UIOutputRenderer
}

const Button: Component<ButtonProps> = (p) => {
  const buttonType = p.props.button_type ?? "default";

  const handleClick = () => {
    if (!disabled() && !loading()) {
      // Check if this is a submit type AND onSubmit exists (i.e., inside Form)
      if (buttonType === "submit" && p.onSubmit) {
        p.onSubmit();  // Trigger form submission
      } else {
        // Normal behavior - communicate directly with Python
        kernel.sendInteraction(componentId, { clicked: true });
      }
    }
  };

  return <button onClick={handleClick}>...</button>;
};
```

### Key Points

1. **Type parameter** - Component has a type/variant prop (e.g., `button_type`)
2. **Optional onSubmit** - Accept optional `onSubmit?: () => void` in props interface
3. **Conditional logic** - Check if type is "submit" AND `onSubmit` exists
4. **Dual behavior** - Submit type calls `onSubmit()`, other types use `kernel.sendInteraction()`

## Extending to New Components

Any component can support form submission by following this pattern:

### Example: ImageButton with Submit Support

```tsx
interface ImageButtonProps {
  id: string;
  props: {
    image: string;
    action_type?: "default" | "submit" | "reset";  // ← Type parameter
    // ... other props
  };
  onSubmit?: () => void;  // ← Accept onSubmit
}

const ImageButton: Component<ImageButtonProps> = (p) => {
  const actionType = p.props.action_type ?? "default";

  const handleClick = () => {
    // Check for submit type and onSubmit existence
    if (actionType === "submit" && p.onSubmit) {
      p.onSubmit();  // Trigger form submission
    } else if (actionType === "reset") {
      // Handle reset logic
    } else {
      kernel.sendInteraction(componentId, { clicked: true });
    }
  };

  return <img src={p.props.image} onClick={handleClick} />;
};
```

### Example: Link Component with Submit

```tsx
interface LinkProps {
  id: string;
  props: {
    href?: string;
    link_type?: "navigate" | "submit" | "download";  // ← Type parameter
    // ... other props
  };
  onSubmit?: () => void;  // ← Accept onSubmit
}

const Link: Component<LinkProps> = (p) => {
  const linkType = p.props.link_type ?? "navigate";

  const handleClick = (e: Event) => {
    if (linkType === "submit" && p.onSubmit) {
      e.preventDefault();  // Don't navigate
      p.onSubmit();  // Trigger form submission
    } else if (linkType === "navigate") {
      // Normal navigation
    } else {
      kernel.sendInteraction(componentId, { clicked: true });
    }
  };

  return <a href={p.props.href} onClick={handleClick}>...</a>;
};
```

## Python Access Patterns

After form submission, Python can access values in two ways:

### 1. Via Form.value Dictionary

```python
form = Form([input1, input2, checkbox1], label="User Data")

# After submit button clicked...
print(form.value)  # {'input1': 'text', 'input2': 'more text', 'checkbox1': True}
```

### 2. Via Individual Component Properties

```python
form = Form([input1, input2, checkbox1], label="User Data")

# After submit button clicked...
print(input1.value)      # 'text'
print(input2.value)      # 'more text'  
print(checkbox1.checked) # True
```

Both approaches work because `Form.handleSubmit()` does a two-phase sync:

1. Send dict to Form → `form.value` populated
2. Send individual updates → each component's internal state updated

## Requirements for Submit-Capable Components

To support form submission, a component must:

1. ✅ **Accept `onSubmit` prop** - Add `onSubmit?: () => void` to props interface
2. ✅ **Have a type parameter** - Some prop indicating submit vs normal behavior
3. ✅ **Implement conditional logic** - Check type AND onSubmit existence
4. ✅ **Call onSubmit()** - When appropriate, call `p.onSubmit()` instead of `kernel.sendInteraction()`

**No changes needed to Form, UIOutputRenderer, or FormContext!** The infrastructure automatically passes `onSubmit` to all children.

## Design Benefits

### Extensibility
- New components get `onSubmit` automatically via UIOutputRenderer
- No Form modifications needed for new submit-capable components
- Each component decides if/how to use onSubmit

### Flexibility
- Components work both inside and outside Forms
- Submit behavior only activates when both conditions met (type=submit AND onSubmit exists)
- Multiple submit triggers possible in one Form

### Type Safety
- Optional `onSubmit` prop doesn't break existing components
- TypeScript ensures proper typing of submission callbacks
- Clear separation between form-aware and form-agnostic props

## Related Files

- [`Form.tsx`](../src/components/ui-renderer/Form.tsx) - Form component with handleSubmit logic
- [`FormContext.tsx`](../src/components/ui-renderer/FormContext.tsx) - Context for child registration
- [`Button.tsx`](../src/components/ui-renderer/Button.tsx) - Reference implementation of submit pattern
- [`UIOutputRenderer.tsx`](../src/components/ui-renderer/UIOutputRenderer.tsx) - Propagates onSubmit to children
- Input components - Form-aware value storage (Input, Select, Checkbox, Toggle, Textarea)
