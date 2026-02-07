import { type Component, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";

interface ButtonProps {
  id: string;
  props: {
    label: string;
    button_type?: "default" | "primary" | "submit" | null;
    color?: string | null;  // Preset name (primary/secondary/accent/etc) or custom CSS color (#hex, rgb(), etc)
    style?: "outline" | "dash" | "soft" | "ghost" | "link" | null;
    size?: "xs" | "sm" | "md" | "lg" | "xl" | null;
    disabled?: boolean;
    loading?: boolean;
    width?: string | number | null;
    height?: string | number | null;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
    border?: boolean | string | null;
    background?: boolean | string | null;
    hidden?: boolean;
  };
  onSubmit?: () => void;
}

const Button: Component<ButtonProps> = (p) => {
  const componentId = p.id;
  const [allProps, setAllProps] = createSignal(p.props);
  
  // Reactive accessors
  const label = () => allProps().label;
  const disabled = () => allProps().disabled ?? false;
  const loading = () => allProps().loading ?? false;
  const size = () => allProps().size ?? "md";
  const hidden = () => allProps().hidden ?? false;
  const buttonType = () => allProps().button_type ?? "default";

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
    kernel.registerComponentListener(componentId, (data: any) => {
      setAllProps(prev => ({ ...prev, ...data }));
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
  });

  const handleClick = () => {
    if (!disabled() && !loading()) {
      // If this is a submit button and we're in a form, trigger form submission
      if (buttonType() === "submit" && p.onSubmit) {
        p.onSubmit();
        // Also send interaction to Python so button's callback is triggered
        kernel.sendInteraction(componentId, { clicked: true, label: label() });
      } else {
        // Normal button behavior - send interaction to Python with label for identification
        kernel.sendInteraction(componentId, { clicked: true, label: label() });
      }
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

    // Only set flex properties when explicitly provided
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

    // Width dimension
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

    // Height dimension
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
  const buttonClass = `button-${componentId}`;
  
  // Build button classes
  const buttonClasses = () => {
    const borderValue = allProps().border;
    const { border } = resolveBorder(borderValue);
    const noBorder = border === "none";
    
    const classes = ["btn", "font-mono", "rounded-sm", buttonClass, sizeConfig().textSize];
    
    // Add non-border classes unless border="none"
    if (!noBorder) {
      classes.push("hover:bg-foreground", "active:bg-primary", "active:text-background");
    }
    
    // Style
    const style = allProps().style;
    if (style) {
      classes.push(`btn-${style}`);
    }
    
    // Loading
    if (loading()) {
      classes.push("loading");
    }
    
    return classes.join(" ");
  };
  
  // Generate color styles for background and active states
  const generateColorStyles = () => {
    const colorVar = resolveColor(allProps().color, "primary");
    const borderValue = allProps().border;
    const { border } = resolveBorder(borderValue);
    const noBorder = border === "none";
    
    // Only apply color styling if not border="none"
    if (noBorder) return "";
    
    // Primary type: always has background, hover brightens
    // Maintain consistent font-weight since text is always light-on-dark
    if (buttonType() === "primary") {
      return `
        .${buttonClass} {
          background-color: ${colorVar} !important;
          color: var(--background) !important;
          font-weight: 600 !important;
        }
        .${buttonClass}:hover {
          filter: brightness(1.15);
        }
        .${buttonClass}:active {
          filter: brightness(1.3);
        }
      `;
    }
    
    // Default/Submit type: active state fills with color
    // Increase font-weight to compensate for optical thinning effect of light-on-dark text
    return `
      .${buttonClass}:active {
        background-color: ${colorVar} !important;
        color: var(--background) !important;
        font-weight: 600 !important;
      }
    `;
  };
  
  // Generate border styles including hover/active states
  const generateBorderStyles = () => {
    const borderValue = allProps().border;
    const colorVar = resolveColor(allProps().color, "primary");
    const { border } = resolveBorder(borderValue);
    
    // Handle border=false or "none" - no border at all
    if (border === "none") {
      return `
        .${buttonClass} {
          border: none !important;
        }
        .${buttonClass}:hover,
        .${buttonClass}:focus,
        .${buttonClass}:focus-within,
        .${buttonClass}:active {
          border: none !important;
        }
      `;
    }
    
    // border=true or null/undefined: Use default from classes, add hover/active color
    if (!border) {
      return `
        .${buttonClass} {
          border: 2px solid var(--foreground);
        }
        .${buttonClass}:hover {
          border-color: ${colorVar};
        }
        .${buttonClass}:active {
          border-color: ${colorVar};
        }
      `;
    }
    
    // Custom border string: Apply border, allow hover/active to change color
    return `
      .${buttonClass} {
        border: ${border};
      }
      .${buttonClass}:hover {
        border-color: ${colorVar};
      }
      .${buttonClass}:active {
        border-color: ${colorVar};
      }
    `;
  };

  return (
    <>
      <style>
        {generateColorStyles()}
        {generateBorderStyles()}
      </style>
      <button
        class={buttonClasses()}
        style={{ ...componentStyles(), ...resolveBackground(allProps().background), padding: `${sizeConfig().padding}px` }}
        onClick={handleClick}
        disabled={disabled() || loading()}
      >
        {loading() && <span class="loading loading-spinner loading-sm mr-2"></span>}
        {label()}
      </button>
    </>
  );
};

export default Button;
