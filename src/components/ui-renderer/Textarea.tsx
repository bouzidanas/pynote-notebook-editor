import { type Component, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { useFormContext } from "./FormContext";

interface TextareaProps {
  id: string;
  props: {
    value: string;
    placeholder?: string;
    rows?: number;
    color?: "neutral" | "primary" | "secondary" | "accent" | "info" | "success" | "warning" | "error" | null;
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

const Textarea: Component<TextareaProps> = (p) => {
  const componentId = p.id;
  const formContext = useFormContext();
  const [value, setValue] = createSignal(p.props.value ?? "");
  const [disabled, setDisabled] = createSignal(p.props.disabled ?? false);
  const [size, setSize] = createSignal<"xs" | "sm" | "md" | "lg" | "xl">(p.props.size ?? "md");

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

  onMount(() => {
    if (formContext) {
      formContext.registerChild(componentId);
    }
    
    kernel.registerComponentListener(componentId, (data: any) => {
      if (data.value !== undefined) setValue(data.value);
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

  const handleInput = (e: InputEvent) => {
    const target = e.currentTarget as HTMLTextAreaElement;
    const newValue = target.value;
    setValue(newValue);
    
    if (formContext) {
      formContext.setChildValue(componentId, newValue);
    } else {
      kernel.sendInteraction(componentId, { value: newValue });
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

  // Unique class for scoped styles
  const textareaClass = `textarea-${componentId}`;
  
  // Build textarea classes
  const textareaClasses = () => {
    return [
      textareaClass,
      "textarea",
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
    const color = p.props.color;
    const colorVar = color === "neutral" ? "var(--foreground)" : (color ? `var(--${color})` : "var(--primary)");
    
    return `
      .${textareaClass}:focus-visible {
        border-color: ${colorVar} !important;
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
      <textarea
      class={textareaClasses()}
      style={{ ...componentStyles(), ...borderStyles(), padding: `${sizeConfig().padding}px` }}
      value={value()}
      placeholder={p.props.placeholder ?? ""}
      rows={p.props.rows ?? 4}
      onInput={handleInput}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={disabled()}
    />
    </>
  );
};

export default Textarea;
