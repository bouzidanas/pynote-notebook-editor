import { type Component, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { useFormContext } from "./FormContext";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";

interface TextareaProps {
  id: string;
  props: {
    value: string;
    placeholder?: string;
    rows?: number;
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

const Textarea: Component<TextareaProps> = (p) => {
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

  const handleInput = (e: InputEvent) => {
    const target = e.currentTarget as HTMLTextAreaElement;
    const newValue = target.value;
    setAllProps(prev => ({ ...prev, value: newValue }));
    
    if (formContext) {
      formContext.setChildValue(componentId, newValue);
    } else {
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
    const colorVar = resolveColor(allProps().color, "primary");
    
    return `
      .${textareaClass}:focus-visible {
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
      <textarea
      class={textareaClasses()}
      style={{ ...componentStyles(), ...borderStyles(), ...resolveBackground(allProps().background), padding: `${sizeConfig().padding}px` }}
      value={value()}
      placeholder={allProps().placeholder ?? ""}
      rows={allProps().rows ?? 4}
      onInput={handleInput}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={disabled()}
    />
    </>
  );
};

export default Textarea;
