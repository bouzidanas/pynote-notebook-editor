import { type Component, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { usePyNoteThemeStyles } from "./utils";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";

// Size presets for custom slider styling
const SIZE_PRESETS = {
  xs: { trackHeight: 4, thumbSize: 10, padding: 2, labelSize: "text-[7px]", valueSize: "text-[length:var(--text-3xs)]", tickSize: "text-[6px]", thumbOffset: -3 },
  sm: { trackHeight: 5, thumbSize: 12, padding: 2, labelSize: "text-[8px]", valueSize: "text-[length:var(--text-2xs)]", tickSize: "text-[7px]", thumbOffset: -3.5 },
  md: { trackHeight: 7, thumbSize: 16, padding: 3, labelSize: "text-xs", valueSize: "text-sm", tickSize: "text-[9px]", thumbOffset: -4.5 },
  lg: { trackHeight: 9, thumbSize: 20, padding: 4, labelSize: "text-sm", valueSize: "text-xl", tickSize: "text-xs", thumbOffset: -5.5 },
  xl: { trackHeight: 12, thumbSize: 26, padding: 5, labelSize: "text-base", valueSize: "text-3xl", tickSize: "text-sm", thumbOffset: -7 },
} as const;

interface SliderProps {
  id: string;
  props: {
    min: number;
    max: number;
    value: number;
    step: number;
    label: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl" | null;
    width?: string | number | null;
    height?: string | number | null;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
    border?: boolean | string | null;  // true/false, preset name (primary/secondary/etc), or custom CSS border string
    color?: string | null;  // Preset name (primary/secondary/accent/etc) or custom CSS color (#hex, rgb(), etc)
    background?: boolean | string | null;
    hidden?: boolean;
  };
}

const Slider: Component<SliderProps> = (p) => {
  const componentId = p.id;
  const [allProps, setAllProps] = createSignal(p.props);
  let containerRef: HTMLDivElement | undefined;
  
  // Reactive accessors
  const value = () => allProps().value;
  const size = () => allProps().size ?? "md";
  const hidden = () => allProps().hidden ?? false;
  
  // Get size preset (default to md)
  const sizeConfig = () => SIZE_PRESETS[size()];

  const percentage = () => {
      const min = allProps().min;
      const max = allProps().max;
      if (max === min) return 0;
      return ((value() - min) / (max - min)) * 100;
  };

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

  const handleInput = (e: InputEvent) => {
    const target = e.currentTarget as HTMLInputElement;
    const val = parseFloat(target.value);
    setAllProps(prev => ({ ...prev, value: val }));
    kernel.sendInteraction(componentId, { value: val });
  };
  
  const sliderClass = `slider-${componentId}`;
  
  // Get color for thumb, track fill, and value text
  const colorValue = () => resolveColor(allProps().color, "primary");
  
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
    
    return styles;
  };
  
  // Determine border styling
  const borderValue = () => allProps().border;
  const outerBorderClass = () => {
    const border = borderValue();
    // Only use Tailwind classes when border is explicitly true (default styling)
    return border === true ? "border-2 border-foreground" : "";
  };
  const outerBorderStyle = () => resolveBorder(allProps().border);
  
  // Header divider border class and padding
  const headerBorderClass = () => {
    const border = borderValue();
    // Only use Tailwind classes when border is explicitly true (default styling)
    return border === true ? "border-b-2 border-foreground" : "";
  };
  const headerBorderStyle = () => {
    const { border } = resolveBorder(allProps().border);
    return border ? { "border-bottom": border } : {};
  };
  const headerBottomPadding = () => {
    const border = borderValue();
    if (border === false) {
      return "0px"; // false: Remove bottom padding
    }
    return `${Math.max(4, (sizeConfig().padding - 1) * 4)}px`; // Default bottom padding
  };
  
  return (
    <div 
        ref={containerRef}
        class={`flex flex-col ${outerBorderClass()} rounded-sm bg-base-100/30 overflow-hidden`}
        style={{ ...usePyNoteThemeStyles(() => containerRef), ...componentStyles(), ...outerBorderStyle(), ...resolveBackground(allProps().background) }}
    >
      <style>
        {`
          .${sliderClass}::-webkit-slider-runnable-track {
            height: ${sizeConfig().trackHeight}px;
            background: var(--slider-gradient) !important;
            border-radius: var(--radius-sm);
            border: none !important;
            box-shadow: none !important;
          }
          .${sliderClass}::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            height: ${sizeConfig().thumbSize}px;
            width: ${sizeConfig().thumbSize}px;
            background: ${colorValue()} !important;
            border-radius: 50%;
            border: none !important;
            box-shadow: none !important;
            margin-top: ${sizeConfig().thumbOffset}px;
          }
          
          /* Firefox */
          .${sliderClass}::-moz-range-track {
            height: ${sizeConfig().trackHeight}px;
            background: var(--foreground) !important;
            border-radius: var(--radius-sm);
            border: none !important;
            box-shadow: none !important;
          }
          .${sliderClass}::-moz-range-progress {
            height: ${sizeConfig().trackHeight}px;
            background: ${colorValue()} !important;
            border-radius: var(--radius-sm);
          }
          .${sliderClass}::-moz-range-thumb {
            height: ${sizeConfig().thumbSize}px;
            width: ${sizeConfig().thumbSize}px;
            background: ${colorValue()} !important;
            border: none !important;
            border-radius: 50%;
            box-shadow: none !important;
          }
        `}
      </style>
      <div 
        class={`flex items-center justify-between gap-3 bg-base-200/50 ${headerBorderClass()}`}
        style={{ padding: `${Math.max(4, (sizeConfig().padding - 1) * 4)}px ${sizeConfig().padding * 4}px ${headerBottomPadding()} ${sizeConfig().padding * 4}px`, ...headerBorderStyle() }}
      >
        <span class={`${sizeConfig().labelSize} font-semibold uppercase tracking-wider text-secondary/70`}>{allProps().label}</span>
        <span class={`font-mono ${sizeConfig().valueSize} font-bold`} style={{ color: colorValue() }}>{value()}</span>
      </div>
      
      <div 
        class={`flex flex-col gap-1`}
        style={{ padding: `${sizeConfig().padding * 4}px`, "padding-bottom": `${Math.max(4, (sizeConfig().padding - 1) * 4)}px` }}
      >
          <input 
            type="range" 
            min={allProps().min} 
            max={allProps().max} 
            value={value()} 
            step={allProps().step}
            class={`w-full cursor-pointer focus:outline-none ${sliderClass}`} 
            onInput={handleInput}
            style={{
                "appearance": "none",
                "-webkit-appearance": "none",
                "background": "transparent",
                "--slider-gradient": `linear-gradient(to right, ${colorValue()} 0%, ${colorValue()} ${percentage()}%, var(--foreground) ${percentage()}%, var(--foreground) 100%)`
            }}
          />
          <div class="flex justify-between w-full px-0.5 mt-1">
            <span class={`${sizeConfig().tickSize} font-mono text-secondary/40`}>{allProps().min}</span>
            <span class={`${sizeConfig().tickSize} font-mono text-secondary/40`}>{allProps().max}</span>
          </div>
      </div>
    </div>
  );
};

export default Slider;