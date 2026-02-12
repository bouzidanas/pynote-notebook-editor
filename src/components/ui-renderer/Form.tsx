import { type Component, For, Show, createSignal, onMount, onCleanup } from "solid-js";
import { FormContext } from "./FormContext";
import UIOutputRenderer from "./UIOutputRenderer";
import { kernel } from "../../lib/pyodide";
import { resolveBorder, resolveBackground } from "./colorUtils";

interface FormProps {
  id: string;
  props: {
    children: any[];
    layout?: "col" | "row";
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

const Form: Component<FormProps> = (p) => {
  const formId = p.id;
  const [hidden, setHidden] = createSignal(p.props.hidden ?? false);
  
  // Track child components and their current values
  const childIds = new Set<string>();
  const [childValues, setChildValues] = createSignal<Map<string, any>>(new Map());

  // Register with kernel for Python→Frontend updates
  onMount(() => {
    kernel.registerComponentListener(formId, (data: any) => {
      // Form can receive updates from Python (e.g., reset, error messages)
      if (data.reset) {
        // Clear all child values
        setChildValues(new Map());
      }
      if (data.hidden !== undefined) setHidden(data.hidden);
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(formId);
  });

  // Form context methods
  const registerChild = (componentId: string) => {
    childIds.add(componentId);
  };

  const unregisterChild = (componentId: string) => {
    childIds.delete(componentId);
    setChildValues(prev => {
      const next = new Map(prev);
      next.delete(componentId);
      return next;
    });
  };

  const getChildValue = (componentId: string) => {
    return childValues().get(componentId);
  };

  const setChildValue = (componentId: string, value: any) => {
    setChildValues(prev => {
      const next = new Map(prev);
      next.set(componentId, value);
      return next;
    });
  };

  // Submit handler - triggered by submit-type buttons
  const handleSubmit = () => {
    // Collect all child values
    const formData: Record<string, any> = {};
    childIds.forEach(childId => {
      const value = childValues().get(childId);
      if (value !== undefined) {
        formData[childId] = value;
      }
    });

    // Send collected data to Python
    kernel.sendInteraction(formId, { submitted: true, values: formData });

    // Now sync each child component with Python
    // This allows Python objects to update their internal state
    childIds.forEach(childId => {
      const value = childValues().get(childId);
      if (value !== undefined) {
        kernel.sendInteraction(childId, { value });
      }
    });
  };

  const contextValue = {
    formId,
    registerChild,
    unregisterChild,
    getChildValue,
    setChildValue,
  };

  // Helper to convert number to px string
  const toCssValue = (val: string | number | undefined | null): string | undefined => {
    if (val === undefined || val === null) return undefined;
    return typeof val === 'number' ? `${val}px` : val;
  };

  // Compute padding based on explicit value or label/border defaults
  const computePadding = (): string => {
    if (p.props.padding !== undefined && p.props.padding !== null) {
      return toCssValue(p.props.padding) || "0";
    }
    const hasLabel = !!p.props.label;
    const borderValue = p.props.border ?? true; // Forms default to having borders
    // Has border when: border=true, border="none", or border="custom string"
    // Does NOT have border when: border=false
    const hasBorder = borderValue === true || (typeof borderValue === 'string' && borderValue !== '');
    const defaultPad = "0.75rem";
    const labelExtraPad = "1.1rem"; // p-5 for extra top padding with label
    
    if (hasBorder) {
      // all sides when border is present, extra top padding when label exists
      return hasLabel ? `${labelExtraPad} ${defaultPad} ${defaultPad} ${defaultPad}` : defaultPad;
    } else if (hasLabel) {
      return `${labelExtraPad} 0 ${defaultPad} 0`; // top/bottom only when label but no border
    }
    return "0"; // no padding when neither border nor label
  };

  // Compute gap
  const computeGap = (): string => {
    const gapValue = p.props.gap;
    if (gapValue !== undefined && gapValue !== null) {
      if (typeof gapValue === 'number') {
        return `gap-${gapValue}`;
      }
      return gapValue;
    }
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
    
    // Handle hidden state
    if (hidden()) {
      styles.display = "none";
      return styles;
    }
    
    if (grow != null) {
      styles["flex-grow"] = grow;
      styles["min-width"] = "0";
      styles["min-height"] = "0";
    }
    if (shrink != null) {
      styles["flex-shrink"] = shrink;
    }
    
    if (w === "full") {
      styles.width = "100%";
    } else if (w != null) {
      const cssWidth = toCssValue(w);
      styles.width = cssWidth;
    }
    
    if (h != null) {
      const cssHeight = toCssValue(h);
      if (force) {
        styles.height = cssHeight;
      } else {
        styles["min-height"] = cssHeight;
      }
    }
    
    const overflow = p.props.overflow;
    if (overflow) {
      if (overflow === "scroll-x") {
        styles["overflow-x"] = "auto";
        styles["overflow-y"] = "visible";
      } else if (overflow === "scroll-y") {
        styles["overflow-x"] = "visible";
        styles["overflow-y"] = "auto";
      } else {
        styles.overflow = overflow;
      }
    }
    
    return styles;
  };

  // Alignment class
  const alignClass = () => {
    const align = p.props.align;
    const isRow = p.props.layout === "row";
    
    if (isRow) {
      if (align === "center") return "justify-center";
      if (align === "end" || align === "right") return "justify-end";
      return "justify-start";
    } else {
      if (align === "center") return "items-center";
      if (align === "end" || align === "right") return "items-end";
      if (align === "stretch") return "items-stretch";
      return "items-start";
    }
  };
    
  // Inner form container class
  const formContainerClass = () => {
    const isRow = p.props.layout === "row";
    const direction = isRow ? "flex-row" : "flex-col";
    const gap = computeGap();
    const verticalStretch = isRow ? "items-stretch" : "";
    return `flex ${direction} ${gap} w-full ${verticalStretch} ${alignClass()}`;
  };

  // Fieldset border styling
  const fieldsetBorderClass = () => {
    const borderValue = p.props.border ?? true; // Forms default to border=true
    
    // border=false → no classes (even with label)
    if (borderValue === false) return '';
    
    // border=true → use default border class
    if (borderValue === true) {
      return 'border-2 border-foreground bg-base-200/20';
    }
    
    // border="none" or any string value → background only
    return 'bg-base-200/20';
  };
  
  const fieldsetBorderStyle = () => {
    const borderValue = p.props.border ?? true; // Forms default to border=true
    
    // border=false → no inline styles
    if (borderValue === false) return {};
    
    // border=true → no inline styles (uses class)
    if (borderValue === true) return {};
    
    // border="none" or other string value → resolve and apply
    const { border } = resolveBorder(borderValue);
    if (border) {
      return { border };
    }
    return {};
  };

  return (
    <FormContext.Provider value={contextValue}>
      <div style={componentStyles()}>
        <fieldset 
          class={`rounded-sm w-full ${fieldsetBorderClass()}`}
          style={{ padding: computePadding(), ...fieldsetBorderStyle(), ...resolveBackground(p.props.background) }}
        >
          <Show when={p.props.label}>
            <legend class="px-2 text-xs font-bold uppercase tracking-wider text-secondary/70">
              {p.props.label}
            </legend>
          </Show>
          <div class={formContainerClass()}>
            <For each={p.props.children}>
              {(childData) => <UIOutputRenderer data={childData} onSubmit={handleSubmit} />}
            </For>
          </div>
        </fieldset>
      </div>
    </FormContext.Provider>
  );
};

export default Form;
