import { type Component, createSignal, createEffect, createMemo, onMount, onCleanup } from "solid-js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { kernel } from "../../lib/pyodide";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";

// Sanitization config - mirrors the conservative subset used by the app for
// inline HTML output (no scripts, no event handlers).
const TEXT_PURIFY_OPTIONS = {
  ADD_ATTR: ["class", "style"],
};

// Render markdown to sanitized HTML. Synchronous (uses marked.parse with
// async:false default) so it stays reactive in createMemo.
const renderMarkdown = (src: string): string => {
  try {
    const html = marked.parse(src, { async: false }) as string;
    return DOMPurify.sanitize(html, TEXT_PURIFY_OPTIONS);
  } catch {
    return DOMPurify.sanitize(src, TEXT_PURIFY_OPTIONS);
  }
};

// Size presets for Text component - uses Tailwind's CSS variables
const SIZE_PRESETS = {
  xs: { padding: 6, textSize: "text-[length:var(--text-3xs)]" },
  sm: { padding: 8, textSize: "text-[length:var(--text-2xs)]" },
  md: { padding: 12, textSize: "text-sm" },
  lg: { padding: 14, textSize: "text-xl" },
  xl: { padding: 16, textSize: "text-3xl" },
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
    markdown?: boolean;
  };
}

const Text: Component<TextProps> = (p) => {
  const componentId = p.id;
  const [allProps, setAllProps] = createSignal(p.props);
  
  // Reactive accessors
  const content = () => allProps().content;
  const size = () => allProps().size ?? "md";
  const hidden = () => allProps().hidden ?? false;
  const isMarkdown = () => allProps().markdown === true;

  // Memoised sanitized HTML, only recomputed when content/markdown change.
  const renderedHtml = createMemo(() => isMarkdown() ? renderMarkdown(content() ?? "") : "");
  
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
    // For plain text we use flexbox for align_h/align_v. For markdown we
    // skip flex (block layout) so block-level children stack vertically;
    // alignment is handled via `text-align` instead.
    const alignH = allProps().align_h ?? "left";
    const alignV = allProps().align_v ?? "top";
    if (isMarkdown()) {
      styles.display = "block";
      styles["text-align"] = alignH === "center" ? "center" : alignH === "right" ? "right" : "left";
      // Vertical alignment is meaningful only when an explicit height is set;
      // for markdown blocks, just leave default flow (top-aligned).
    } else {
      styles.display = "flex";
      styles["justify-content"] = alignH === "center" ? "center" : alignH === "right" ? "flex-end" : "flex-start";
      styles["align-items"] = alignV === "center" ? "center" : alignV === "bottom" ? "flex-end" : "flex-start";
    }

    return styles;
  };
  
  // Apply border
  const borderStyles = () => resolveBorder(allProps().border);

  return (
    <div 
      class={`bg-base-200/50 component-border rounded-[var(--component-radius)] font-mono [overflow-wrap:anywhere] ${sizeConfig().textSize}${isMarkdown() ? " prose prose-sm max-w-none" : ""}`}
      style={{ ...componentStyles(), ...borderStyles(), ...resolveBackground(allProps().background), color: colorValue(), padding: `calc(${sizeConfig().padding}px + var(--component-pad-${size()}))` }}
      {...(isMarkdown() ? { innerHTML: renderedHtml() } : {})}
    >
      {isMarkdown() ? null : content()}
    </div>
  );
};

export default Text;
