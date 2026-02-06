import { type Component, createSignal, onMount, onCleanup, Show } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { useFormContext } from "./FormContext";

interface ToggleProps {
  id: string;
  props: {
    checked: boolean;
    label?: string | null;
    color?: "primary" | "secondary" | "accent" | "neutral" | "success" | "warning" | "info" | "error" | null;
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

const Toggle: Component<ToggleProps> = (p) => {
  const componentId = p.id;
  const formContext = useFormContext();
  const [checked, setChecked] = createSignal(p.props.checked ?? false);
  const [disabled, setDisabled] = createSignal(p.props.disabled ?? false);
  const [size, setSize] = createSignal<"xs" | "sm" | "md" | "lg" | "xl">(p.props.size ?? "md");

  // Size presets - uses CSS variables for global customization
  const sizeConfig = () => {
    switch (size()) {
      case "xs": return { padding: 6, textSize: "text-[length:var(--text-3xs)]", trackWidth: 28, trackHeight: 16, thumbSize: 12 };
      case "sm": return { padding: 8, textSize: "text-[length:var(--text-2xs)]", trackWidth: 36, trackHeight: 20, thumbSize: 16 };
      case "md": return { padding: 12, textSize: "text-sm", trackWidth: 44, trackHeight: 24, thumbSize: 20 };
      case "lg": return { padding: 14, textSize: "text-xl", trackWidth: 52, trackHeight: 28, thumbSize: 24 };
      case "xl": return { padding: 16, textSize: "text-3xl", trackWidth: 60, trackHeight: 32, thumbSize: 28 };
      default: return { padding: 12, textSize: "text-sm", trackWidth: 44, trackHeight: 24, thumbSize: 20 };
    }
  };

  // Get the color for checked state
  const getCheckedColor = () => {
    const color = p.props.color;
    if (color === "neutral") return "var(--foreground)";
    if (color) return `var(--${color})`;
    return "var(--primary)";
  };

  onMount(() => {
    if (formContext) {
      formContext.registerChild(componentId);
    }
    
    kernel.registerComponentListener(componentId, (data: any) => {
      if (data.checked !== undefined) setChecked(data.checked);
      if (data.disabled !== undefined) setDisabled(data.disabled);
      if (data.size !== undefined) setSize(data.size ?? "md");
    });
  });

  onCleanup(() => {
    if (formContext) {
      formContext.unregisterChild(componentId);
    }
    
    kernel.unregisterComponentListener(componentId);
  });

  const handleChange = (e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    const newChecked = target.checked;
    setChecked(newChecked);
    
    if (formContext) {
      formContext.setChildValue(componentId, newChecked);
    } else {
      kernel.sendInteraction(componentId, { checked: newChecked });
    }
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

  // Calculate thumb position (2px gap from edge)
  const thumbOffset = () => checked() ? sizeConfig().trackWidth - sizeConfig().thumbSize - 2 : 2;
  
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
    <label 
      class={`flex items-center gap-2 cursor-pointer font-mono text-secondary bg-base-200/50 border-2 border-foreground rounded-sm ${sizeConfig().textSize}`}
      style={{ ...componentStyles(), ...borderStyles(), padding: `${sizeConfig().padding}px` }}
    >
      <input
        type="checkbox"
        class="sr-only"
        checked={checked()}
        onChange={handleChange}
        disabled={disabled()}
      />
      {/* Custom toggle track */}
      <div
        class="relative rounded-full transition-colors duration-200"
        style={{
          width: `${sizeConfig().trackWidth}px`,
          height: `${sizeConfig().trackHeight}px`,
          "background-color": checked() ? getCheckedColor() : "var(--foreground)",
          opacity: disabled() ? 0.5 : 1,
        }}
      >
        {/* Toggle thumb */}
        <div
          class="absolute top-1/2 -translate-y-1/2 rounded-full bg-background transition-all duration-200"
          style={{
            width: `${sizeConfig().thumbSize}px`,
            height: `${sizeConfig().thumbSize}px`,
            left: `${thumbOffset()}px`,
          }}
        />
      </div>
      <Show when={p.props.label}>
        <span class="select-none">{p.props.label}</span>
      </Show>
    </label>
  );
};

export default Toggle;
