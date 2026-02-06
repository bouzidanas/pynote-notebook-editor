import { type Component, createSignal, onMount, onCleanup, Show } from "solid-js";
import { kernel } from "../../lib/pyodide";

interface CheckboxProps {
  id: string;
  props: {
    checked: boolean;
    label?: string | null;
    color?: "primary" | "secondary" | "accent" | "success" | "warning" | "info" | "error" | null;
    size?: "xs" | "sm" | "md" | "lg" | "xl" | null;
    disabled?: boolean;
    width?: string | number | null;
    height?: string | number | null;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
    border?: boolean | string | null;
  };
}

const Checkbox: Component<CheckboxProps> = (p) => {
  const componentId = p.id;
  const [checked, setChecked] = createSignal(p.props.checked ?? false);
  const [disabled, setDisabled] = createSignal(p.props.disabled ?? false);
  const [size, setSize] = createSignal<"xs" | "sm" | "md" | "lg" | "xl">(p.props.size ?? "md");

  // Size presets - uses CSS variables for global customization
  const sizeConfig = () => {
    switch (size()) {
      case "xs": return { padding: 4, textSize: "text-[length:var(--text-2xs)]", checkboxSize: 16 };
      case "sm": return { padding: 6, textSize: "text-xs", checkboxSize: 20 };
      case "md": return { padding: 8, textSize: "text-sm", checkboxSize: 24 };
      case "lg": return { padding: 12, textSize: "text-base", checkboxSize: 28 };
      case "xl": return { padding: 14, textSize: "text-lg", checkboxSize: 32 };
      default: return { padding: 8, textSize: "text-sm", checkboxSize: 24 };
    }
  };

  onMount(() => {
    kernel.registerComponentListener(componentId, (data: any) => {
      if (data.checked !== undefined) setChecked(data.checked);
      if (data.disabled !== undefined) setDisabled(data.disabled);
      if (data.size !== undefined) setSize(data.size ?? "md");
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
  });

  const handleChange = (e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    const newChecked = target.checked;
    setChecked(newChecked);
    kernel.sendInteraction(componentId, { checked: newChecked });
  };

  // Build combined styles for flex and dimensions
  const componentStyles = () => {
    const styles: Record<string, string | number | undefined> = {};
    const grow = p.props.grow;
    const shrink = p.props.shrink;
    const force = p.props.force_dimensions;

    if (grow != null) {
      styles["flex-grow"] = grow;
      styles["min-width"] = "0";
      styles["min-height"] = "0";
    } else {
      styles.width = "fit-content";
    }
    if (shrink != null) {
      styles["flex-shrink"] = shrink;
    }

    if (p.props.width != null) {
      const w = typeof p.props.width === 'number' ? `${p.props.width}px` : p.props.width;
      if (force) {
        styles.width = w;
        styles["flex-grow"] = 0;
        styles["flex-shrink"] = 0;
      } else {
        styles.width = w;
      }
    }

    if (p.props.height != null) {
      const h = typeof p.props.height === 'number' ? `${p.props.height}px` : p.props.height;
      if (force) {
        styles.height = h;
      } else {
        styles["min-height"] = h;
      }
    }

    return styles;
  };

  // Unique class for scoped styles
  const checkboxClass = `checkbox-${componentId}`;
  
  // Build checkbox classes - no DaisyUI class, fully custom styled
  const checkboxClasses = () => {
    return checkboxClass;
  };
  
  // Generate color styles for checked state
  const generateColorStyles = () => {
    const color = p.props.color ?? "primary"; // Default to primary
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
        top: 10%;
        width: 30%;
        height: 60%;
        border: solid var(--background);
        border-width: 0 2.5px 2.5px 0;
        transform: rotate(45deg);
      }
      .${checkboxClass}:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
  };
  
  // Apply custom border
  const borderStyles = () => {
    const borderValue = p.props.border;
    if (borderValue === false || borderValue === "none") {
      return { border: "none" };
    } else if (borderValue && typeof borderValue === 'string') {
      return { border: borderValue };
    }
    // true or null/undefined: Default border (from classes)
    return {};
  };

  return (
    <>
      <style>
        {generateColorStyles()}
      </style>
      <label 
      class={`flex items-center gap-2 cursor-pointer font-mono text-secondary border-2 border-foreground rounded-sm ${sizeConfig().textSize}`}
      style={{ ...componentStyles(), ...borderStyles(), padding: `${sizeConfig().padding}px` }}
    >
      <input
        type="checkbox"
        class={checkboxClasses()}
        style={{ width: `${sizeConfig().checkboxSize}px`, height: `${sizeConfig().checkboxSize}px` }}
        checked={checked()}
        onChange={handleChange}
        disabled={disabled()}
      />
      <Show when={p.props.label}>
        <span class="select-none">{p.props.label}</span>
      </Show>
    </label>
    </>
  );
};

export default Checkbox;
