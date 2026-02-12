import { type Component, createSignal, createEffect, onMount, onCleanup, For } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { useFormContext } from "./FormContext";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";

interface SelectProps {
  id: string;
  props: {
    options: Array<string | { label: string; value: string }>;
    value?: string | null;
    placeholder?: string;
    color?: string | null;  // Preset name (primary/secondary/accent/etc) or custom CSS color (#hex, rgb(), etc)
    size?: "xs" | "sm" | "md" | "lg" | "xl" | null;
    disabled?: boolean;
    width?: string | number | null;
    height?: string | number | null;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
    border?: boolean | string | null;
    background?: boolean | string | null;
    hidden?: boolean;
  };
}

const Select: Component<SelectProps> = (p) => {
  const componentId = p.id;
  const formContext = useFormContext();
  const [allProps, setAllProps] = createSignal(p.props);
  
  // Reactive accessors
  const value = () => allProps().value ?? "";
  const options = () => allProps().options ?? [];
  const disabled = () => allProps().disabled ?? false;
  const size = () => allProps().size ?? "md";
  const hidden = () => allProps().hidden ?? false;

  // Keep allProps in sync with parent props
  createEffect(() => {
    setAllProps(p.props);
  });

  onMount(() => {
    if (formContext) {
      formContext.registerChild(componentId);
    }
    
    kernel.registerComponentListener(componentId, (data: any) => {
      setAllProps(prev => ({ ...prev, ...data }));
    });
  });

  onCleanup(() => {
    if (formContext) {
      formContext.unregisterChild(componentId);
    }
    
    kernel.unregisterComponentListener(componentId);
  });

  const handleChange = (e: Event) => {
    const target = e.currentTarget as HTMLSelectElement;
    const newValue = target.value;
    setAllProps(prev => ({ ...prev, value: newValue }));
    
    // Always send to Python for live on_update callbacks
    kernel.sendInteraction(componentId, { value: newValue });
    // Also store in form context for batch submission
    if (formContext) {
      formContext.setChildValue(componentId, newValue);
    }
  };

  // Normalize options to { label, value } format
  const normalizedOptions = () => {
    return options().map(opt => {
      if (typeof opt === 'string') {
        return { label: opt, value: opt };
      }
      return opt;
    });
  };

  // Build combined styles for flex and dimensions
  const componentStyles = () => {
    const styles: Record<string, string | number | undefined> = {};
    const grow = allProps().grow;
    const shrink = allProps().shrink;
    const force = allProps().force_dimensions;

    // Handle hidden state
    if (hidden()) {
      styles.display = "none";
      return styles;
    }

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

    const width = allProps().width;
    if (width != null) {
      const w = typeof width === 'number' ? `${width}px` : width;
      if (force) {
        styles.width = w;
        styles["flex-grow"] = 0;
        styles["flex-shrink"] = 0;
      } else {
        styles.width = w;
      }
    }

    const height = allProps().height;
    if (height != null) {
      const h = typeof height === 'number' ? `${height}px` : height;
      if (force) {
        styles.height = h;
      } else {
        styles["min-height"] = h;
      }
    }

    return styles;
  };

  // Unique class for scoped styles
  const selectClass = `select-${componentId}`;
  
  // Size presets - fontSize uses CSS variables for global customization
  const sizeConfig = () => {
    switch (size()) {
      case "xs": return { padding: 6, fontSize: "var(--text-3xs)", iconSize: 8 };
      case "sm": return { padding: 8, fontSize: "var(--text-2xs)", iconSize: 10 };
      case "md": return { padding: 12, fontSize: "var(--text-sm)", iconSize: 12 };
      case "lg": return { padding: 14, fontSize: "var(--text-xl)", iconSize: 14 };
      case "xl": return { padding: 16, fontSize: "var(--text-3xl)", iconSize: 16 };
      default: return { padding: 12, fontSize: "var(--text-sm)", iconSize: 12 };
    }
  };

  // Apply custom border
  const applyBorder = () => {
    const borderStyle = resolveBorder(allProps().border);
    if (borderStyle.border === "none") {
      return "border: none !important;";
    } else if (borderStyle.border) {
      return `border: ${borderStyle.border} !important;`;
    }
    // Default border
    return "border: 2px solid var(--foreground) !important;";
  };
  
  // Get color
  const colorValue = () => resolveColor(allProps().color, "primary");
  
  return (
    <>
      <style>
        {`
          .${selectClass} {
            /* Remove DaisyUI's inner border/shadow */
            --tw-ring-shadow: none !important;
            --tw-ring-offset-shadow: none !important;
            box-shadow: none !important;
            outline: none !important;
            
            /* Custom border styling */
            ${applyBorder()}
            border-radius: var(--radius-sm);
            
            /* Size-based padding and font */
            padding: ${sizeConfig().padding}px;
            font-size: ${sizeConfig().fontSize};
            
            /* Background */
            background-color: var(--background);
            color: var(--secondary);
            
            /* Vertical center alignment */
            display: flex;
            align-items: center;
            
            /* Enable customizable select (Chrome 135+) */
            appearance: base-select;
          }
          
          /* Style the arrow button */
          .${selectClass}::picker-icon {
            content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${sizeConfig().iconSize}' height='${sizeConfig().iconSize}' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
            margin-left: auto;
            padding-left: ${sizeConfig().padding}px;
          }
          
          /* Highlight border only when dropdown is open (not on focus) */
          .${selectClass}:open {
            border-color: ${colorValue()} !important;
          }

          .${selectClass}:focus {
            outline: none !important;
          }
          
          /* Placeholder option styling */
          .${selectClass} option[disabled] {
            color: color-mix(in oklch, var(--color-secondary) 70%, transparent);
          }
          
          /* Hide checkmark space only for placeholder (empty value disabled option) */
          .${selectClass} option[value=""][disabled]::checkmark {
            display: none;
          }
          
          /* Style the dropdown options */
          .${selectClass} option {
            background-color: var(--background);
            color: var(--secondary);
            padding: ${sizeConfig().padding}px;
            font-size: ${sizeConfig().fontSize};
          }
          
          .${selectClass} option:hover {
            background: color-mix(in oklch, var(--color-secondary) 20%, transparent) !important;
          }

          .${selectClass} option:checked {
            background-color: ${colorValue()};
            color: var(--background);
          }
          
          /* Style the dropdown panel (Chrome 135+) - BOTH select and picker need base-select */
          .${selectClass}::picker(select) {
            appearance: base-select;
            background-color: var(--background);
            border: 2px solid ${colorValue()};
            border-radius: var(--radius-sm);
          }
          
          /* Style selected option in picker */
          .${selectClass}::picker(select) option:checked,
          .${selectClass} option:checked::checkmark {
            background-color: ${colorValue()};
            color: var(--background);
          }
          
          /* Hover state in picker */
          .${selectClass}::picker(select) option:hover {
            background-color: color-mix(in oklch, var(--color-secondary) 25%, transparent);
          }
        `}
      </style>
      <select
        class={`${selectClass} font-mono rounded-sm cursor-pointer`}
        style={{ ...componentStyles(), ...resolveBackground(allProps().background) }}
        value={value()}
        onChange={handleChange}
        disabled={disabled()}
      >
        {allProps().placeholder && (
          <option value="" disabled>
            {allProps().placeholder}
          </option>
        )}
        <For each={normalizedOptions()}>
          {(opt) => (
            <option value={opt.value}>{opt.label}</option>
          )}
        </For>
      </select>
    </>
  );
};

export default Select;
