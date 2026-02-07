import { type Component, For, Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import UIOutputRenderer from "./UIOutputRenderer";
import { kernel } from "../../lib/pyodide";
import { resolveBorder, resolveBackground } from "./colorUtils";

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
    border?: boolean | string;
    background?: boolean | string | null;
    padding?: string | number;
    gap?: string | number;
    overflow?: "visible" | "hidden" | "scroll" | "auto" | "scroll-x" | "scroll-y";
    force_dimensions?: boolean;
    hidden?: boolean;
  };
}   

const Group: Component<GroupProps> = (p) => {
  const componentId = p.id;
  const [allProps, setAllProps] = createSignal(p.props);
  
  // Create reactive accessors
  const hidden = () => allProps().hidden ?? false;
  
  // Keep allProps in sync with parent props
  createEffect(() => {
    setAllProps(p.props);
  });
  
  onMount(() => {
    kernel.registerComponentListener(componentId, (data: any) => {
      setAllProps(prev => ({ ...prev, ...data }));
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
  });
  
  // Alignment class for horizontal positioning of children
  // For row: horizontal is main axis → justify-content (items-stretch handles vertical)
  // For col: horizontal is cross axis → align-items (default start to respect fit-content)
  const alignClass = () => {
    const align = allProps().align;
    const isRow = allProps().layout === "row";
    
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
    if (allProps().padding !== undefined && allProps().padding !== null) {
      return toCssValue(allProps().padding) || "0";
    }
    // Default behavior based on label and border
    const hasLabel = !!allProps().label;
    const borderValue = allProps().border;
    // Has border when: border=true, border="none", or border="custom string"
    // Does NOT have border when: border=false, border=undefined, border=null
    const hasBorder = borderValue === true || (typeof borderValue === 'string' && borderValue !== '');
    const defaultPad = "0.75rem"; // matches p-3
    const labelExtraPad = "1.1rem"; // p-5 for extra top padding with label
    
    if (hasBorder) {
      // all sides when border is present, extra top padding when label exists
      return hasLabel ? `${labelExtraPad} ${defaultPad} ${defaultPad} ${defaultPad}` : defaultPad;
    } else if (hasLabel) {
      return `${labelExtraPad} 0 ${defaultPad} 0`; // top/bottom only when label but no border
    }
    return "0"; // no padding when neither border nor label
  };

  // Compute gap based on explicit value or default (3 for both row and col)
  const computeGap = (): string => {
    const gapValue = allProps().gap;
    
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
    const grow = allProps().grow;
    const shrink = allProps().shrink;
    const force = allProps().force_dimensions;
    const w = allProps().width;
    const h = allProps().height;
    
    // Handle hidden state
    if (hidden()) {
      styles.display = "none";
      return styles;
    }
    
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
    const overflow = allProps().overflow;
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
    const isRow = allProps().layout === "row";
    const direction = isRow ? "flex-row" : "flex-col";
    const gap = computeGap();
    // For row: items-stretch makes children fill vertical space (cross axis)
    // alignClass handles: row → justify (horizontal), col → items (horizontal)
    const verticalStretch = isRow ? "items-stretch" : "";
    return `flex ${direction} ${gap} w-full ${verticalStretch} ${alignClass()}`;
  };

  const content = (
    <div class={groupClass()}>
      <For each={allProps().children}>
        {(childData) => <UIOutputRenderer data={childData} />}
      </For>
    </div>
  );

  // Determine if we need the wrapper (label or border)
  // Always need wrapper if label exists (regardless of border)
  // Need wrapper if border is not false
  const needsWrapper = () => {
    // If there's a label, always need wrapper
    if (allProps().label) return true;
    
    const borderValue = allProps().border;
    // border=false → no wrapper if no label
    if (borderValue === false) return false;
    // border=undefined/null → no wrapper if no label
    if (borderValue === undefined || borderValue === null) return false;
    // border=true or any string value → need wrapper
    return true;
  };
  
  // Apply custom border to container
  const containerBorderClass = () => {
    const borderValue = allProps().border;
    
    // border=false → no classes at all
    if (borderValue === false) return '';
    
    // border=true → use default border class
    if (borderValue === true) {
      return 'border-2 border-foreground bg-base-200/20';
    }
    
    // border=undefined/null → no border styling (but wrapper may exist for label)
    if (borderValue === undefined || borderValue === null) return '';
    
    // border="none" or any string value → background only (border applied via style)
    return 'bg-base-200/20';
  };
  
  const containerBorderStyle = () => {
    const borderValue = allProps().border;
    
    // border=false → no inline styles
    if (borderValue === false) return {};
    
    // border=true → no inline styles (uses class)
    if (borderValue === true) return {};
    
    // border=undefined/null → no inline styles
    if (borderValue === undefined || borderValue === null) return {};
    
    // border="none" or other string value → resolve and apply
    const { border } = resolveBorder(borderValue);
    if (border) {
      return { border };
    }
    return {};
  };

  // // Label background should match container background for proper border-cutting effect
  // const labelBgClass = () => {
  //   const borderValue = allProps().border;
  //   // If we have a border styling (true or string, not false/undefined/null)
  //   if (borderValue === true || (typeof borderValue === 'string' && borderValue !== '')) {
  //     return 'bg-base-200/20';
  //   }
  //   // Fallback to page background
  //   return 'bg-base-100';
  // };

  return (
    <div style={componentStyles()}>
      <Show when={needsWrapper()} fallback={content}>
        <div 
          class={`relative rounded-sm w-full ${containerBorderClass()}`}
          style={{ padding: computePadding(), ...containerBorderStyle(), ...resolveBackground(allProps().background) }}
        >
          <Show when={allProps().label}>
            <span class={`absolute left-3 -top-2 px-2 text-xs font-bold uppercase tracking-wider text-secondary/70`}>
              {allProps().label}
            </span>
          </Show>
          {content}
        </div>
      </Show>
    </div>
  );
};

export default Group;
