import { type Component, createEffect, createSignal, onMount, onCleanup } from "solid-js";
import { kernel } from "../../lib/pyodide";
import { usePyNoteThemeStyles } from "./utils";

interface SliderProps {
  id: string;
  props: {
    min: number;
    max: number;
    value: number;
    step: number;
    label: string;
  };
}

const Slider: Component<SliderProps> = (p) => {
  const componentId = p.id;
  const [value, setValue] = createSignal(p.props.value);
  let containerRef: HTMLDivElement | undefined;
  
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
  
  return (
    <div 
        ref={containerRef}
        class="flex flex-col w-full border-2 border-foreground rounded-sm bg-base-100/30 overflow-hidden"
        style={usePyNoteThemeStyles(() => containerRef)}
    >
      <style>
        {`
          .${sliderClass}::-webkit-slider-runnable-track {
            height: 7px;
            background: var(--slider-gradient) !important;
            border-radius: var(--radius-sm);
            border: none !important;
            box-shadow: none !important;
          }
          .${sliderClass}::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            height: 16px;
            width: 16px;
            background: var(--primary) !important;
            border-radius: 50%;
            border: none !important;
            box-shadow: none !important;
            margin-top: -4.5px; /* Centers 16px thumb on 7px track */
          }
          
          /* Firefox */
          .${sliderClass}::-moz-range-track {
            height: 7px;
            background: var(--foreground) !important; /* Firefox uses progress for fill */
            border-radius: var(--radius-sm);
            border: none !important;
            box-shadow: none !important;
          }
          .${sliderClass}::-moz-range-progress {
            height: 7px;
            background: var(--primary) !important;
            border-radius: var(--radius-sm);
          }
          .${sliderClass}::-moz-range-thumb {
            height: 16px;
            width: 16px;
            background: var(--primary) !important;
            border: none !important;
            border-radius: 50%;
            box-shadow: none !important;
          }
        `}
      </style>
      <div class="flex items-center justify-between px-3 py-2 bg-base-200/50 border-b-2 border-foreground">
        <span class="text-xs font-semibold uppercase tracking-wider text-secondary/70">{p.props.label}</span>
        <span class="font-mono text-sm font-bold text-primary">{value()}</span>
      </div>
      
      <div class="p-3 flex flex-col gap-1">
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
                "--slider-gradient": `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage()}%, var(--foreground) ${percentage()}%, var(--foreground) 100%)`
            }}
          />
          <div class="flex justify-between w-full px-0.5 mt-1">
            <span class="text-[10px] font-mono text-secondary/40">{p.props.min}</span>
            <span class="text-[10px] font-mono text-secondary/40">{p.props.max}</span>
          </div>
      </div>
    </div>
  );
};

export default Slider;