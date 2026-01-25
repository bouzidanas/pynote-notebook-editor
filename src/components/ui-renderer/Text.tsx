import { type Component, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";

interface TextProps {
  id: string;
  props: {
    content: string;
    width?: string | number | null;
    height?: string | number | null;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
  };
}

const Text: Component<TextProps> = (p) => {
  const componentId = p.id;
  const [content, setContent] = createSignal(p.props.content);

  onMount(() => {
    kernel.registerComponentListener(componentId, (data: any) => {
      if (data.content !== undefined) setContent(data.content);
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
    
    return styles;
  };

  return (
    <div 
      class="p-3 bg-base-200/50 border-2 border-foreground rounded-sm font-mono text-sm text-secondary"
      style={componentStyles()}
    >
      {content()}
    </div>
  );
};

export default Text;
