import { type Component, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";

// Size presets for Text component - uses Tailwind's CSS variables
const SIZE_PRESETS = {
  xs: { padding: "p-1.5", textSize: "text-[length:var(--text-3xs)]" },
  sm: { padding: "p-2", textSize: "text-[length:var(--text-2xs)]" },
  md: { padding: "p-3", textSize: "text-sm" },
  lg: { padding: "p-3.5", textSize: "text-xl" },
  xl: { padding: "p-4", textSize: "text-3xl" },
} as const;

interface TextProps {
  id: string;
  props: {
    content: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl" | null;
    width?: string | number | null;
    height?: string | number | null;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
    align_h?: "left" | "center" | "right";
    align_v?: "top" | "center" | "bottom";
    border?: boolean | string | null;  // true/false, preset name (primary/secondary/etc), or custom CSS border string
    color?: string | null;  // Preset name (primary/secondary/accent/etc) or custom CSS color (#hex, rgb(), etc)
    background?: boolean | string | null;
    hidden?: boolean;
  };
}

const Text: Component<TextProps> = (p) => {
  const componentId = p.id;
  const [allProps, setAllProps] = createSignal(p.props);
  
  // Reactive accessors
  const content = () => allProps().content;
  const size = () => allProps().size ?? "md";
  const hidden = () => allProps().hidden ?? false;
  
  // Get size preset (default to md)
  const sizeConfig = () => SIZE_PRESETS[size()];
  
  // Get color for text color
  const colorValue = () => resolveColor(allProps().color, "secondary");

  // Keep allProps in sync with parent props
  createEffect(() => {
    setAllProps(p.props);
  });

  onMount(() => {
    kernel.registerComponentListener(componentId, (data: any) => {
      setAllProps((prev) => ({ ...prev, ...(data as Partial<TextProps["props"]>) }));
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
  });

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
      styles["min-width"] = "0"; // Allow shrinking below content size in row
      styles["min-height"] = "0"; // Allow shrinking below content size in col
    } else {
      // Default: fit to content width
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
    
    // Text alignment (only matters when width/height is set or grow is used)
    // Use flexbox for alignment so it works with any sizing mode
    styles.display = "flex";
    
    // Horizontal alignment
    const alignH = allProps().align_h ?? "left";
    styles["justify-content"] = alignH === "center" ? "center" : alignH === "right" ? "flex-end" : "flex-start";
    
    // Vertical alignment
    const alignV = allProps().align_v ?? "top";
    styles["align-items"] = alignV === "center" ? "center" : alignV === "bottom" ? "flex-end" : "flex-start";
    
    return styles;
  };
  
  // Apply border
  const borderStyles = () => resolveBorder(allProps().border);

  return (
    <div 
      class={`${sizeConfig().padding} bg-base-200/50 border-2 border-foreground rounded-sm font-mono [overflow-wrap:anywhere] ${sizeConfig().textSize}`}
      style={{ ...componentStyles(), ...borderStyles(), ...resolveBackground(allProps().background), color: colorValue() }}
    >
      {content()}
    </div>
  );
};

export default Text;
