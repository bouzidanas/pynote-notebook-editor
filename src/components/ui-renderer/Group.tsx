import { type Component, For, Show } from "solid-js";
import UIOutputRenderer from "./UIOutputRenderer";

interface GroupProps {
  id: string;
  props: {
    children: any[];
    layout: "col" | "row";
    label?: string;
    width?: string | number;
    height?: string | number | null;
    align?: "start" | "left" | "center" | "end" | "right" | "stretch";
    grow?: number | null;
    shrink?: number | null;
    border?: boolean;
    padding?: string | number;
    gap?: string | number;
    overflow?: "visible" | "hidden" | "scroll" | "auto" | "scroll-x" | "scroll-y";
    force_dimensions?: boolean;
  };
}   

const Group: Component<GroupProps> = (p) => {
  // Alignment class for horizontal positioning of children
  // For row: horizontal is main axis → justify-content (items-stretch handles vertical)
  // For col: horizontal is cross axis → align-items (default start to respect fit-content)
  const alignClass = () => {
    const align = p.props.align;
    const isRow = p.props.layout === "row";
    
    if (isRow) {
      // Row: justify controls horizontal, items-stretch is always applied separately
      if (align === "center") return "justify-center";
      if (align === "end" || align === "right") return "justify-end";
      return "justify-start"; // Default
    } else {
      // Column: align-items controls horizontal
      // Default is start (fit-content), stretch must be explicit
      if (align === "center") return "items-center";
      if (align === "end" || align === "right") return "items-end";
      if (align === "stretch") return "items-stretch";
      return "items-start"; // Default: fit content width
    }
  };

  // Helper to convert number to px string
  const toCssValue = (val: string | number | undefined | null): string | undefined => {
    if (val === undefined || val === null) return undefined;
    return typeof val === 'number' ? `${val}px` : val;
  };

  // Compute padding based on explicit value or label/border defaults
  const computePadding = (): string => {
    // If padding explicitly provided, use it
    if (p.props.padding !== undefined && p.props.padding !== null) {
      return toCssValue(p.props.padding) || "0";
    }
    // Default behavior based on label and border
    const hasLabel = !!p.props.label;
    const hasBorder = !!p.props.border;
    const defaultPad = "0.75rem"; // matches p-3
    
    if (hasBorder) {
      return defaultPad; // all sides when border is present
    } else if (hasLabel) {
      return `${defaultPad} 0`; // top/bottom only
    }
    return "0"; // no padding
  };

  // Compute gap based on explicit value or default (3 for both row and col)
  const computeGap = (): string => {
    const gapValue = p.props.gap;
    
    // If gap explicitly provided
    if (gapValue !== undefined && gapValue !== null) {
      // Number: use Tailwind class (gap-1, gap-2, gap-3, etc.)
      if (typeof gapValue === 'number') {
        return `gap-${gapValue}`;
      }
      // String: return as-is for custom CSS
      return gapValue;
    }
    
    // Default: gap-3 for both row and col
    return "gap-3";
  };

  // Build combined styles for flex and dimensions
  const componentStyles = () => {
    const styles: Record<string, string | number | undefined> = {};
    const grow = p.props.grow;
    const shrink = p.props.shrink;
    const force = p.props.force_dimensions;
    const w = p.props.width;
    const h = p.props.height;
    
    // Flex properties for when Group is nested inside another Group
    // Only set when explicitly provided
    if (grow != null) {
      styles["flex-grow"] = grow;
      styles["min-width"] = "0"; // Allow shrinking below content size in row
      styles["min-height"] = "0"; // Allow shrinking below content size in col
    }
    if (shrink != null) {
      styles["flex-shrink"] = shrink;
    }
    
    // Width: "full" means 100%, otherwise use value
    if (w === "full") {
      styles.width = "100%";
    } else if (w != null) {
      const cssWidth = toCssValue(w);
      if (force) {
        styles.width = cssWidth;
      } else {
        styles.width = cssWidth;
      }
    }
    
    // Height
    if (h != null) {
      const cssHeight = toCssValue(h);
      if (force) {
        styles.height = cssHeight;
      } else {
        styles["min-height"] = cssHeight;
      }
    }
    
    // Overflow handling
    const overflow = p.props.overflow;
    if (overflow) {
      if (overflow === "scroll-x") {
        styles["overflow-x"] = "auto";
        styles["overflow-y"] = "visible";
      } else if (overflow === "scroll-y") {
        styles["overflow-x"] = "visible";
        styles["overflow-y"] = "auto";
      } else {
        // visible, hidden, scroll, auto
        styles.overflow = overflow;
      }
    }
    
    return styles;
  };
    
  // Inner Group Container class - includes alignment for children
  const groupClass = () => {
    const isRow = p.props.layout === "row";
    const direction = isRow ? "flex-row" : "flex-col";
    const gap = computeGap();
    // For row: items-stretch makes children fill vertical space (cross axis)
    // alignClass handles: row → justify (horizontal), col → items (horizontal)
    const verticalStretch = isRow ? "items-stretch" : "";
    return `flex ${direction} ${gap} w-full ${verticalStretch} ${alignClass()}`;
  };

  const content = (
    <div class={groupClass()}>
      <For each={p.props.children}>
        {(childData) => <UIOutputRenderer data={childData} />}
      </For>
    </div>
  );

  // Determine if we need the fieldset wrapper (label or border)
  const needsWrapper = () => p.props.label || p.props.border;

  return (
    <div style={componentStyles()}>
      <Show when={needsWrapper()} fallback={content}>
        <fieldset 
          class={`rounded-sm w-full ${p.props.border ? 'border-2 border-foreground bg-base-200/20' : ''}`}
          style={{ padding: computePadding() }}
        >
          <Show when={p.props.label}>
            <legend class="px-2 text-xs font-bold uppercase tracking-wider text-secondary/70">
              {p.props.label}
            </legend>
          </Show>
          {content}
        </fieldset>
      </Show>
    </div>
  );
};

export default Group;
