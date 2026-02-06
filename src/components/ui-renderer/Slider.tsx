import { type Component, createEffect, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { usePyNoteThemeStyles } from "./utils";

// Size presets for custom slider styling
const SIZE_PRESETS = {
  xs: { trackHeight: 4, thumbSize: 10, padding: 2, labelSize: "text-[9px]", valueSize: "text-xs", tickSize: "text-[8px]", thumbOffset: -3 },
  sm: { trackHeight: 5, thumbSize: 12, padding: 2, labelSize: "text-[10px]", valueSize: "text-xs", tickSize: "text-[9px]", thumbOffset: -3.5 },
  md: { trackHeight: 7, thumbSize: 16, padding: 3, labelSize: "text-xs", valueSize: "text-sm", tickSize: "text-[10px]", thumbOffset: -4.5 },
  lg: { trackHeight: 9, thumbSize: 20, padding: 4, labelSize: "text-xs", valueSize: "text-base", tickSize: "text-[11px]", thumbOffset: -5.5 },
  xl: { trackHeight: 12, thumbSize: 26, padding: 5, labelSize: "text-sm", valueSize: "text-lg", tickSize: "text-xs", thumbOffset: -7 },
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
    border?: boolean | string | null;
    color?: string | null;
  };
}

const Slider: Component<SliderProps> = (p) => {
  const componentId = p.id;
  const [value, setValue] = createSignal(p.props.value);
  const [size, setSize] = createSignal<"xs" | "sm" | "md" | "lg" | "xl">(p.props.size ?? "md");
  let containerRef: HTMLDivElement | undefined;
  
  // Get size preset (default to md)
  const sizeConfig = () => SIZE_PRESETS[size()];
  
  createEffect(() => {
    setValue(p.props.value);
  });

  const percentage = () => {
      const min = p.props.min;
      const max = p.props.max;
      if (max === min) return 0;
      return ((value() - min) / (max - min)) * 100;
  };

  onMount(() => {
    kernel.registerComponentListener(componentId, (data: any) => {
        if (typeof data.value === "number") {
            setValue(data.value);
        }
        if (data.size !== undefined) {
            setSize(data.size ?? "md");
        }
    });
  });

  onCleanup(() => {
    kernel.unregisterComponentListener(componentId);
  });

  const handleInput = (e: InputEvent) => {
    const target = e.currentTarget as HTMLInputElement;
    const val = parseFloat(target.value);
    setValue(val);
    kernel.sendInteraction(componentId, { value: val });
  };
  
  const sliderClass = `slider-${componentId}`;
  
  // Get color variable for thumb, track fill, and value text
  const getColorVar = () => {
    const color = p.props.color;
    if (color === "neutral") return "var(--foreground)";
    return color ? `var(--${color})` : "var(--primary)";
  };
  
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
  
  // Determine border styling
  const borderValue = () => p.props.border;
  const outerBorderClass = () => {
    const border = borderValue();
    return (border === false || border === "none") ? "" : "border-2 border-foreground";
  };
  const outerBorderStyle = () => {
    const border = borderValue();
    if (border === false || border === "none") {
      return { border: "none" };
    } else if (border && typeof border === 'string') {
      return { border };
    }
    return {};
  };
  
  // Header divider border class and padding
  const headerBorderClass = () => {
    const border = borderValue();
    return border === false ? "" : "border-b-2 border-foreground";
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
        style={{ ...usePyNoteThemeStyles(() => containerRef), ...componentStyles(), ...outerBorderStyle() }}
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
            background: ${getColorVar()} !important;
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
            background: ${getColorVar()} !important;
            border-radius: var(--radius-sm);
          }
          .${sliderClass}::-moz-range-thumb {
            height: ${sizeConfig().thumbSize}px;
            width: ${sizeConfig().thumbSize}px;
            background: ${getColorVar()} !important;
            border: none !important;
            border-radius: 50%;
            box-shadow: none !important;
          }
        `}
      </style>
      <div 
        class={`flex items-center justify-between gap-3 bg-base-200/50 ${headerBorderClass()}`}
        style={{ padding: `${Math.max(4, (sizeConfig().padding - 1) * 4)}px ${sizeConfig().padding * 4}px ${headerBottomPadding()} ${sizeConfig().padding * 4}px` }}
      >
        <span class={`${sizeConfig().labelSize} font-semibold uppercase tracking-wider text-secondary/70`}>{p.props.label}</span>
        <span class={`font-mono ${sizeConfig().valueSize} font-bold`} style={{ color: getColorVar() }}>{value()}</span>
      </div>
      
      <div 
        class={`flex flex-col gap-1`}
        style={{ padding: `${sizeConfig().padding * 4}px`, "padding-bottom": `${Math.max(4, (sizeConfig().padding - 1) * 4)}px` }}
      >
          <input 
            type="range" 
            min={p.props.min} 
            max={p.props.max} 
            value={value()} 
            step={p.props.step}
            class={`w-full cursor-pointer focus:outline-none ${sliderClass}`} 
            onInput={handleInput}
            style={{
                "appearance": "none",
                "-webkit-appearance": "none",
                "background": "transparent",
                "--slider-gradient": `linear-gradient(to right, ${getColorVar()} 0%, ${getColorVar()} ${percentage()}%, var(--foreground) ${percentage()}%, var(--foreground) 100%)`
            }}
          />
          <div class="flex justify-between w-full px-0.5 mt-1">
            <span class={`${sizeConfig().tickSize} font-mono text-secondary/40`}>{p.props.min}</span>
            <span class={`${sizeConfig().tickSize} font-mono text-secondary/40`}>{p.props.max}</span>
          </div>
      </div>
    </div>
  );
};

export default Slider;