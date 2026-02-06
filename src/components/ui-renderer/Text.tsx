import { type Component, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";

// Size presets for Text component - uses Tailwind's CSS variables
const SIZE_PRESETS = {
  xs: { padding: "p-1.5", textSize: "text-[length:var(--text-2xs)]" },
  sm: { padding: "p-2", textSize: "text-xs" },
  md: { padding: "p-3", textSize: "text-sm" },
  lg: { padding: "p-4", textSize: "text-base" },
  xl: { padding: "p-5", textSize: "text-lg" },
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
    border?: boolean | string | null;
    color?: string | null;
  };
}

const Text: Component<TextProps> = (p) => {
  const componentId = p.id;
  const [content, setContent] = createSignal(p.props.content);
  const [size, setSize] = createSignal<"xs" | "sm" | "md" | "lg" | "xl">(p.props.size ?? "md");
  
  // Get size preset (default to md)
  const sizeConfig = () => SIZE_PRESETS[size()];
  
  // Get color variable for text color
  const getColorVar = () => {
    const color = p.props.color;
    if (color === "neutral") return "var(--foreground)";
    return color ? `var(--${color})` : "var(--secondary)";
  };

  onMount(() => {
    kernel.registerComponentListener(componentId, (data: any) => {
      if (data.content !== undefined) setContent(data.content);
      if (data.size !== undefined) setSize(data.size ?? "md");
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
  });

  // Build combined styles for flex and dimensions
  const componentStyles = () => {
    const styles: Record<string, string | number | undefined> = {};
    const grow = p.props.grow;
    const shrink = p.props.shrink;
    const force = p.props.force_dimensions;
    
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
    
    // Height dimension
    if (p.props.height != null) {
      const h = typeof p.props.height === 'number' ? `${p.props.height}px` : p.props.height;
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
    const alignH = p.props.align_h ?? "left";
    styles["justify-content"] = alignH === "center" ? "center" : alignH === "right" ? "flex-end" : "flex-start";
    
    // Vertical alignment
    const alignV = p.props.align_v ?? "top";
    styles["align-items"] = alignV === "center" ? "center" : alignV === "bottom" ? "flex-end" : "flex-start";
    
    return styles;
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
    <div 
      class={`${sizeConfig().padding} bg-base-200/50 border-2 border-foreground rounded-sm font-mono ${sizeConfig().textSize}`}
      style={{ ...componentStyles(), ...borderStyles(), color: getColorVar() }}
    >
      {content()}
    </div>
  );
};

export default Text;
