import { type Component, createSignal, createEffect, onMount, onCleanup, Show } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { useFormContext } from "./FormContext";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";

interface ToggleProps {
  id: string;
  props: {
    checked: boolean;
    label?: string | null;
    color?: string | null;  // Preset name (primary/secondary/accent/etc) or custom CSS color (#hex, rgb(), etc)
    size?: "xs" | "sm" | "md" | "lg" | "xl" | null;
    disabled?: boolean;
    align?: "left" | "center" | "right" | null;
    spaced?: boolean;
    reverse?: boolean;
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

const Toggle: Component<ToggleProps> = (p) => {
  const componentId = p.id;
  const formContext = useFormContext();
  const [allProps, setAllProps] = createSignal(p.props);
  
  // Reactive accessors
  const checked = () => allProps().checked ?? false;
  const disabled = () => allProps().disabled ?? false;
  const size = () => allProps().size ?? "md";
  const hidden = () => allProps().hidden ?? false;
  const align = () => allProps().align ?? "left";
  const spaced = () => allProps().spaced ?? false;
  const reverse = () => allProps().reverse ?? false;

  // Size presets - uses CSS variables for global customization
  const sizeConfig = () => {
    switch (size()) {
      case "xs": return { padding: 6, textSize: "text-[length:var(--text-3xs)]", trackWidth: 19, trackHeight: 11, thumbSize: 8.5 };
      case "sm": return { padding: 8, textSize: "text-[length:var(--text-2xs)]", trackWidth: 26, trackHeight: 14, thumbSize: 11 };
      case "md": return { padding: 12, textSize: "text-sm", trackWidth: 34, trackHeight: 19, thumbSize: 16 };
      case "lg": return { padding: 14, textSize: "text-xl", trackWidth: 50, trackHeight: 27, thumbSize: 22 };
      case "xl": return { padding: 16, textSize: "text-3xl", trackWidth: 60, trackHeight: 30, thumbSize: 25 };
      default: return { padding: 12, textSize: "text-sm", trackWidth: 34, trackHeight: 19, thumbSize: 16 };
    }
  };

  // Get the color for checked state
  const checkedColor = () => resolveColor(allProps().color, "primary");

  // Keep allProps in sync with parent props
  createEffect(() => {
    setAllProps(p.props);
  });

  onMount(() => {
    if (formContext) {
      formContext.registerChild(componentId);
    }
    
    kernel.registerComponentListener(componentId, (data: any) => {
      setAllProps(prev => ({ ...prev, ...(data as Partial<typeof p.props>) }));
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
    setAllProps(prev => ({ ...prev, checked: newChecked }));
    
    // Always send to Python for live on_update callbacks
    kernel.sendInteraction(componentId, { checked: newChecked });
    // Also store in form context for batch submission
    if (formContext) {
      formContext.setChildValue(componentId, newChecked);
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

  // Calculate thumb position (2px gap from edge)
  const thumbOffset = () => checked() ? sizeConfig().trackWidth - sizeConfig().thumbSize - 2 : 2;
  
  // Apply border
  const borderStyles = () => resolveBorder(allProps().border);

  // Layout classes based on align, spaced, and reverse
  const layoutClasses = () => {
    const classes = ["flex", "items-center", "cursor-pointer", "font-mono", "text-secondary", "bg-base-200/50", "border-2", "border-foreground", "rounded-sm", sizeConfig().textSize];
    
    // Handle reverse (order)
    if (reverse()) {
      classes.push("flex-row-reverse");
    }
    
    // Handle spaced vs aligned
    if (spaced()) {
      classes.push("justify-between");
      classes.push("gap-3"); // slightly larger gap when spaced
    } else {
      classes.push("gap-3"); // increased from gap-2
      // Apply alignment - invert when reversed so alignment stays consistent
      const alignValue = align();
      const isReversed = reverse();
      if (alignValue === "center") {
        classes.push("justify-center");
      } else if (alignValue === "right") {
        classes.push(isReversed ? "justify-start" : "justify-end");
      } else {
        classes.push(isReversed ? "justify-end" : "justify-start");
      }
    }
    
    return classes.join(" ");
  };

  return (
    <label 
      class={layoutClasses()}
      style={{ ...componentStyles(), ...borderStyles(), ...resolveBackground(allProps().background), padding: `${sizeConfig().padding}px` }}
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
          "background-color": checked() ? checkedColor() : "var(--foreground)",
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
      <Show when={allProps().label}>
        <span class="select-none">{allProps().label}</span>
      </Show>
    </label>
  );
};

export default Toggle;
