import { type Component, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { useFormContext } from "./FormContext";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";

interface InputProps {
  id: string;
  props: {
    value: string;
    placeholder?: string;
    input_type?: "text" | "password" | "email" | "number" | "search" | "tel" | "url";
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

const Input: Component<InputProps> = (p) => {
  const componentId = p.id;
  const formContext = useFormContext();
  const [allProps, setAllProps] = createSignal(p.props);
  
  // Reactive accessors
  const value = () => allProps().value ?? "";
  const disabled = () => allProps().disabled ?? false;
  const size = () => allProps().size ?? "md";
  const hidden = () => allProps().hidden ?? false;

  // Size presets - uses CSS variables for global customization
  const sizeConfig = () => {
    switch (size()) {
      case "xs": return { padding: 6, textSize: "text-[length:var(--text-3xs)]" };
      case "sm": return { padding: 8, textSize: "text-[length:var(--text-2xs)]" };
      case "md": return { padding: 12, textSize: "text-sm" };
      case "lg": return { padding: 14, textSize: "text-xl" };
      case "xl": return { padding: 16, textSize: "text-3xl" };
      default: return { padding: 12, textSize: "text-sm" };
    }
  };

  // Keep allProps in sync with parent props
  createEffect(() => {
    setAllProps(p.props);
  });

  onMount(() => {
    // Register with form if inside a Form component
    if (formContext) {
      formContext.registerChild(componentId);
    }
    
    kernel.registerComponentListener(componentId, (data: any) => {
      setAllProps(prev => ({ ...prev, ...data }));
    });
  });

  onCleanup(() => {
    // Unregister from form if inside a Form component
    if (formContext) {
      formContext.unregisterChild(componentId);
    }
    
    kernel.unregisterComponentListener(componentId);
  });

  const handleInput = (e: InputEvent) => {
    const target = e.currentTarget as HTMLInputElement;
    const newValue = target.value;
    setAllProps(prev => ({ ...prev, value: newValue }));
    
    // If inside a form, update form context instead of sending to Python
    if (formContext) {
      formContext.setChildValue(componentId, newValue);
    } else {
      // Not in a form: send immediately to Python
      kernel.sendInteraction(componentId, { value: newValue });
    }
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
  const inputClass = `input-${componentId}`;
  
  // Build input classes
  const inputClasses = () => {
    return [
      inputClass,
      "input",
      "font-mono",
      "border-2",
      "border-foreground",
      "rounded-sm",
      "bg-base-100/30",
      "focus-visible:outline-none",
      "focus-visible:border-primary",
      sizeConfig().textSize
    ].join(" ");
  };
  
  // Generate color styles for focus state
  const generateColorStyles = () => {
    const colorVar = resolveColor(allProps().color, "primary");
    
    return `
      .${inputClass}:focus-visible {
        border-color: ${colorVar} !important;
      }
    `;
  };
  
  // Apply border
  const borderStyles = () => resolveBorder(allProps().border);

  return (
    <>
      <style>
        {generateColorStyles()}
      </style>
      <input
      type={allProps().input_type ?? "text"}
      class={inputClasses()}
      style={{ ...componentStyles(), ...borderStyles(), ...resolveBackground(allProps().background), padding: `${sizeConfig().padding}px` }}
      value={value()}
      placeholder={allProps().placeholder ?? ""}
      onInput={handleInput}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={disabled()}
    />
    </>
  );
};

export default Input;
