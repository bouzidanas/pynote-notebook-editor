import { type Component, createSignal, createEffect, Show, onCleanup } from "solid-js";
import { X, Palette, ChevronDown, Pipette, ChevronUp, RotateCcw, Sparkles } from "lucide-solid";
import clsx from "clsx";
import { currentTheme, updateTheme, defaultTheme } from "../lib/theme";
import { highlightPython } from "../lib/syntax-highlighter";

interface ThemeDialogProps {
  onClose: () => void;
  onSave: (applyToSession: boolean) => void;
  initialScope?: "app-wide" | "session-only";
}

const ThemeDialog: Component<ThemeDialogProps> = (props) => {
  // Store original theme to restore on cancel
  const originalTheme = {
    font: currentTheme.font,
    colors: { ...currentTheme.colors },
    radii: { ...currentTheme.radii },
    spacing: { ...currentTheme.spacing },
    typography: { ...currentTheme.typography },
    editor: { ...currentTheme.editor },
    sectionScoping: currentTheme.sectionScoping,
    tableOverflow: currentTheme.tableOverflow,
    outputLayout: currentTheme.outputLayout,
    saveToExport: currentTheme.saveToExport,
  };

  const [saveToExport, setSaveToExport] = createSignal(currentTheme.saveToExport);
  const [openPickerId, setOpenPickerId] = createSignal<string | null>(null);
  const [applyScope, setApplyScope] = createSignal<"app-wide" | "session-only">(props.initialScope || "session-only");

  const handleSave = () => {
    // Persist saveToExport flag
    updateTheme({ saveToExport: saveToExport() });
    // Notify parent of save scope
    props.onSave(applyScope() === "session-only");
    props.onClose();
  };

  const handleCancel = () => {
    // Restore original theme on cancel
    updateTheme(originalTheme);
    props.onClose();
  };

  const toggleSaveToExport = () => {
    setSaveToExport(prev => !prev);
  };

  // Number input component with unit support
  const NumberUnitInput: Component<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    step?: number;
    min?: number;
  }> = (itemProps) => {

    const parse = () => {
      const match = String(itemProps.value).match(/^([-\d.]+)([a-z%]*)$/i);
      return match ? { num: parseFloat(match[1]), unit: match[2] || '' } : { num: 0, unit: '' };
    };

    const update = (direction: 1 | -1) => {
      const { num, unit } = parse();
      if (isNaN(num)) return;

      // Heuristic for step if not provided
      let step = itemProps.step;
      if (!step) {
        if (unit === 'px') step = 1;
        else if (unit === 'rem' || unit === 'em') step = 0.125;
        else if (!unit) step = 0.1; // Line height etc
        else step = 1;
      }

      const newValue = Number((num + (step * direction)).toFixed(4));
      if (itemProps.min !== undefined && newValue < itemProps.min) return;

      itemProps.onChange(`${newValue}${unit}`);
    };

    return (
      <div class="space-y-1">
        <label class="text-xs font-semibold text-secondary/80">{itemProps.label}</label>
        <div class="relative group">
          <input
            type="text"
            value={itemProps.value}
            onInput={(e) => itemProps.onChange(e.currentTarget.value)}
            placeholder={itemProps.placeholder}
            class="w-full h-9 px-2 pr-6 text-sm bg-background border border-foreground rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') { e.preventDefault(); update(1); }
              if (e.key === 'ArrowDown') { e.preventDefault(); update(-1); }
            }}
          />
          <div class="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
            <button
              type="button"
              onClick={() => update(1)}
              class="p-0.5 text-secondary/50 hover:text-secondary transition-colors"
              tabIndex={-1}
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              onClick={() => update(-1)}
              class="p-0.5 text-secondary/50 hover:text-secondary transition-colors"
              tabIndex={-1}
            >
              <ChevronDown size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Input field component
  const InputField: Component<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }> = (itemProps) => (
    <div class="space-y-1">
      <label class="text-xs font-semibold text-secondary/80">{itemProps.label}</label>
      <input
        type="text"
        value={itemProps.value}
        onInput={(e) => itemProps.onChange(e.currentTarget.value)}
        placeholder={itemProps.placeholder}
        class="w-full h-9 px-2 text-sm bg-background border border-foreground rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
      />
    </div>
  );

  // Color input component
  const ColorInput: Component<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    id: string;
  }> = (itemProps) => {
    const [hue, setHue] = createSignal(0);
    const [saturation, setSaturation] = createSignal(100);
    const [lightness, setLightness] = createSignal(50);
    const [colorFormat, setColorFormat] = createSignal<'hex' | 'rgb' | 'hsl'>('hex');

    const isOpen = () => openPickerId() === itemProps.id;
    const togglePicker = () => {
      setOpenPickerId(isOpen() ? null : itemProps.id);
    };

    // Convert hex to RGB
    const hexToRGB = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return { r: 0, g: 0, b: 0 };
      return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      };
    };

    // Get formatted color string
    const getFormattedColor = () => {
      const format = colorFormat();
      if (format === 'hex') {
        return itemProps.value;
      } else if (format === 'rgb') {
        const rgb = hexToRGB(itemProps.value);
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      } else if (format === 'hsl') {
        return `hsl(${hue()}, ${saturation()}%, ${lightness()}%)`;
      }
      return itemProps.value;
    };

    // Parse color input and convert to hex
    const parseColorInput = (value: string) => {
      // If it's already hex, use it
      if (value.startsWith('#')) {
        return value;
      }
      // Parse RGB
      const rgbMatch = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        const toHex = (n: number) => n.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
      // Parse HSL
      const hslMatch = value.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (hslMatch) {
        const h = parseInt(hslMatch[1]);
        const s = parseInt(hslMatch[2]);
        const l = parseInt(hslMatch[3]);
        return hslToHex(h, s, l);
      }
      return value;
    };

    // Cycle color format
    const cycleFormat = (direction: 'up' | 'down') => {
      const formats: Array<'hex' | 'rgb' | 'hsl'> = ['hex', 'rgb', 'hsl'];
      const currentIndex = formats.indexOf(colorFormat());
      let newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0) newIndex = formats.length - 1;
      if (newIndex >= formats.length) newIndex = 0;
      setColorFormat(formats[newIndex]);
    };

    // Convert hex to HSL
    const hexToHSL = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return { h: 0, s: 100, l: 50 };

      let r = parseInt(result[1], 16) / 255;
      let g = parseInt(result[2], 16) / 255;
      let b = parseInt(result[3], 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }

      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    };

    // Convert HSL to hex
    const hslToHex = (h: number, s: number, l: number) => {
      s /= 100;
      l /= 100;
      const k = (n: number) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
      return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
    };

    // Initialize HSL from current color
    createEffect(() => {
      const hsl = hexToHSL(itemProps.value);
      setHue(hsl.h);
      setSaturation(hsl.s);
      setLightness(hsl.l);
    });

    const updateColor = (h: number, s: number, l: number) => {
      setHue(h);
      setSaturation(s);
      setLightness(l);
      itemProps.onChange(hslToHex(h, s, l));
    };

    const handleEyeDropper = async () => {
      if ('EyeDropper' in window) {
        try {
          const eyeDropper = new (window as any).EyeDropper();
          const result = await eyeDropper.open();
          itemProps.onChange(result.sRGBHex);
        } catch (e) {
          console.log('Eyedropper cancelled or failed');
        }
      }
    };

    const handleColorAreaClick = (e: MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const s = Math.round((x / rect.width) * 100);
      const l = Math.round(100 - (y / rect.height) * 100);
      updateColor(hue(), s, l);
    };

    let containerRef: HTMLDivElement | undefined;

    createEffect(() => {
      if (isOpen()) {
        const onClick = (e: MouseEvent) => {
          if (containerRef && !containerRef.contains(e.target as Node)) {
            setOpenPickerId(null);
          }
        };
        setTimeout(() => document.addEventListener("click", onClick), 0);
        onCleanup(() => document.removeEventListener("click", onClick));
      }
    });

    return (
      <div class="space-y-1 relative" ref={containerRef}>
        <label class="text-xs font-semibold text-secondary/80">{itemProps.label}</label>
        <div class="flex gap-2 items-center">
          <button
            type="button"
            onClick={togglePicker}
            class="w-9 h-9 shrink-0 rounded-full border-2 border-foreground cursor-pointer hover:opacity-80 transition-opacity"
            style={{ "background-color": itemProps.value }}
          />
          <div class="relative flex-1">
            <input
              type="text"
              value={getFormattedColor()}
              onInput={(e) => {
                const hex = parseColorInput(e.currentTarget.value);
                itemProps.onChange(hex);
              }}
              class="w-full h-9 px-2 pr-6 text-sm bg-background border border-foreground rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
            />
            <div class="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
              <button
                type="button"
                onClick={() => cycleFormat('up')}
                class="p-0.5 text-secondary/50 hover:text-secondary transition-colors"
                tabIndex={-1}
              ><ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => cycleFormat('down')}
                class="p-0.5 text-secondary/50 hover:text-secondary transition-colors"
                tabIndex={-1}
              >
                <ChevronDown size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Color Picker Popup */}
        <Show when={isOpen()}>
          <div class="absolute z-50 mt-2 p-3 bg-background border-2 border-foreground shadow-2xl space-y-3 w-64" style={{ "border-radius": currentTheme.radii.sm, left: "0", top: "100%" }}>
            {/* Color Area (Saturation/Lightness) */}
            <div
              class="w-full h-40 relative cursor-crosshair"
              style={{
                background: `linear-gradient(to bottom, transparent, black), linear-gradient(to right, white, hsl(${hue()}, 100%, 50%))`,
                "border-radius": currentTheme.radii.sm,
              }}
              onClick={handleColorAreaClick}
            >
              {/* Color marker */}
              <div
                class="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none"
                style={{
                  left: `${saturation()}%`,
                  top: `${100 - lightness()}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            </div>

            {/* Hue Bar */}
            <div class="relative">
              <input
                type="range"
                min="0"
                max="360"
                value={hue()}
                onInput={(e) => updateColor(parseInt(e.currentTarget.value), saturation(), lightness())}
                class="w-full h-3 rounded-full cursor-pointer hue-slider"
                style={{
                  background: "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                  "-webkit-appearance": "none",
                  "appearance": "none",
                }}
              />
              <style>{`
                .hue-slider::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  width: 16px;
                  height: 16px;
                  border-radius: 50%;
                  background: white;
                  border: 2px solid ${currentTheme.colors.foreground};
                  cursor: pointer;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                }
                .hue-slider::-moz-range-thumb {
                  width: 16px;
                  height: 16px;
                  border-radius: 50%;
                  background: white;
                  border: 2px solid ${currentTheme.colors.foreground};
                  cursor: pointer;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                }
              `}</style>
            </div>

            {/* Color Input and Eyedropper */}
            <div class="flex items-center gap-2">
              <div class="flex-1 relative">
                <input
                  type="text"
                  value={getFormattedColor()}
                  onInput={(e) => {
                    const hex = parseColorInput(e.currentTarget.value);
                    itemProps.onChange(hex);
                  }}
                  class="w-full px-2 py-2 pr-8 text-sm bg-background border border-foreground rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
                />
                <div class="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                  <button
                    type="button"
                    onClick={() => cycleFormat('up')}
                    class="p-0.5 text-secondary/50 hover:text-secondary transition-colors"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => cycleFormat('down')}
                    class="p-0.5 text-secondary/50 hover:text-secondary transition-colors"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>
              <Show when={'EyeDropper' in window}>
                <button
                  type="button"
                  onClick={handleEyeDropper}
                  class="p-2 text-secondary hover:text-accent transition-colors"
                  title="Pick color from screen"
                >
                  <Pipette size={18} />
                </button>
              </Show>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={() => setOpenPickerId(null)}
              class="w-full px-4 py-2 bg-accent text-background text-sm font-bold rounded-sm hover:bg-accent/90 transition-colors"
            >
              Done
            </button>
          </div>
        </Show>
      </div>
    );
  };

  // // Select component
  // const SelectField: Component<{
  //   label: string;
  //   value: string;
  //   options: string[];
  //   onChange: (value: string) => void;
  // }> = (itemProps) => (
  //   <div class="space-y-1">
  //     <label class="text-xs font-semibold text-secondary/80">{itemProps.label}</label>
  //     <div class="relative">
  //       <select
  //         value={itemProps.value}
  //         onChange={(e) => itemProps.onChange(e.currentTarget.value)}
  //         class="w-full px-2 py-1.5 text-sm bg-background border border-foreground rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer pr-8"
  //       >
  //         <For each={itemProps.options}>
  //           {(option) => <option value={option}>{option}</option>}
  //         </For>
  //       </select>
  //       <ChevronDown size={16} class="absolute right-2 top-1/2 -translate-y-1/2 text-secondary/50 pointer-events-none" />
  //     </div>
  //   </div>
  // );

  // Toggle component
  const ToggleField: Component<{
    label: string;
    value: boolean;
    onChange: () => void;
  }> = (itemProps) => (
    <div
      class="flex items-center justify-between py-2 px-2 rounded-sm hover:bg-foreground/50 transition-colors cursor-pointer"
      onClick={itemProps.onChange}
    >
      <label class="text-xs font-semibold text-secondary/80 cursor-pointer">{itemProps.label}</label>
      <div class={clsx(
        "w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0",
        itemProps.value
          ? "bg-accent border-accent"
          : "border-foreground hover:border-secondary/50"
      )}>
        <Show when={itemProps.value}>
          <svg class="w-2.5 h-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </Show>
      </div>
    </div>
  );

  return (
    <div
      class="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        class="bg-background border border-foreground rounded-sm shadow-xl max-w-5xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="relative flex items-center justify-between p-4 border-b border-foreground shrink-0">
          <h2 class="text-lg font-bold flex items-center gap-2">
            <Palette size={20} /> Theme Configuration
          </h2>

          <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4">
            <button
              onClick={() => updateTheme(originalTheme)}
              class="p-1.5 text-secondary/50 hover:text-accent transition-colors rounded-sm"
              title="Undo Changes (Reset to initial state)"
            >
              <RotateCcw size={18} />
            </button>
            <button
              onClick={() => updateTheme({ ...defaultTheme })}
              class="p-1.5 text-secondary/50 hover:text-accent transition-colors rounded-sm"
              title="Reset to App Defaults"
            >
              <Sparkles size={18} />
            </button>
          </div>

          <button onClick={handleCancel} class="p-1 hover:bg-foreground rounded-sm">
            <X size={20} />
          </button>
        </div>

        {/* Content - Two Column Layout */}
        <div class="flex flex-col lg:flex-row flex-1 overflow-hidden">

          {/* Left Panel - Theme Inputs */}
          <div class="flex-1 shrink-3 p-4 overflow-y-auto border-b lg:border-b-0 lg:border-r border-foreground space-y-4">

            {/* Colors Section */}
            <div class="space-y-2">
              <h3 class="text-xs font-bold text-accent uppercase mb-2">Colors</h3>
              <ColorInput
                id="primary"
                label="Primary"
                value={currentTheme.colors.primary}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, primary: v } })}
              />
              <ColorInput
                id="secondary"
                label="Secondary"
                value={currentTheme.colors.secondary}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, secondary: v } })}
              />
              <ColorInput
                id="accent"
                label="Accent"
                value={currentTheme.colors.accent}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, accent: v } })}
              />
              <ColorInput
                id="background"
                label="Background"
                value={currentTheme.colors.background}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, background: v } })}
              />
              <ColorInput
                id="foreground"
                label="Foreground"
                value={currentTheme.colors.foreground}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, foreground: v } })}
              />

              {/* Header Colors */}
              <ColorInput
                id="h1Color"
                label="H1 Color"
                value={currentTheme.typography.headerColors?.[0] || currentTheme.colors.primary}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerColors: [v, currentTheme.typography.headerColors?.[1] || "", currentTheme.typography.headerColors?.[2] || "", currentTheme.typography.headerColors?.[3] || ""] } })}
              />
              <ColorInput
                id="h2Color"
                label="H2 Color"
                value={currentTheme.typography.headerColors?.[1] || currentTheme.colors.primary}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerColors: [currentTheme.typography.headerColors?.[0] || "", v, currentTheme.typography.headerColors?.[2] || "", currentTheme.typography.headerColors?.[3] || ""] } })}
              />
              <ColorInput
                id="h3Color"
                label="H3 Color"
                value={currentTheme.typography.headerColors?.[2] || currentTheme.colors.primary}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerColors: [currentTheme.typography.headerColors?.[0] || "", currentTheme.typography.headerColors?.[1] || "", v, currentTheme.typography.headerColors?.[3] || ""] } })}
              />
              <ColorInput
                id="h4Color"
                label="H4 Color"
                value={currentTheme.typography.headerColors?.[3] || currentTheme.colors.primary}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerColors: [currentTheme.typography.headerColors?.[0] || "", currentTheme.typography.headerColors?.[1] || "", currentTheme.typography.headerColors?.[2] || "", v] } })}
              />
            </div>

            {/* Typography Section */}
            <div class="space-y-2">
              <h3 class="text-xs font-bold text-accent uppercase mb-2">Typography</h3>
              <InputField
                label="Font Family"
                value={currentTheme.font}
                onChange={(v) => updateTheme({ font: v })}
                placeholder='"JetBrains Mono Variable", monospace'
              />
              <NumberUnitInput
                label="Base Font Size"
                value={currentTheme.typography.fontSize}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, fontSize: v } })}
                placeholder="1rem"
                step={0.0625}
              />
              <NumberUnitInput
                label="Header Size Delta"
                value={currentTheme.typography.headerDelta}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerDelta: v } })}
                placeholder="0.225rem"
                step={0.0125}
              />
              <NumberUnitInput
                label="Header Margin Bottom"
                value={currentTheme.typography.headerMarginBottom}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerMarginBottom: v } })}
                placeholder="1.5rem"
                step={0.125}
              />
            </div>

            {/* Spacing Section */}
            <div class="space-y-2">
              <h3 class="text-xs font-bold text-accent uppercase mb-2">Spacing</h3>
              <NumberUnitInput
                label="Line Spacing"
                value={currentTheme.spacing.line}
                onChange={(v) => updateTheme({ spacing: { ...currentTheme.spacing, line: v } })}
                placeholder="1.75"
                step={0.05}
              />
              <NumberUnitInput
                label="Cell Margin"
                value={currentTheme.spacing.cell}
                onChange={(v) => updateTheme({ spacing: { ...currentTheme.spacing, cell: v } })}
                placeholder="0.90rem"
                step={0.05}
              />
              <NumberUnitInput
                label="Block Margin"
                value={currentTheme.spacing.block}
                onChange={(v) => updateTheme({ spacing: { ...currentTheme.spacing, block: v } })}
                placeholder="1.25rem"
                step={0.125}
              />
            </div>

            {/* Border Radius Section */}
            <div class="space-y-2">
              <h3 class="text-xs font-bold text-accent uppercase mb-2">Border Radius</h3>
              <NumberUnitInput
                label="Large Radius"
                value={currentTheme.radii.lg}
                onChange={(v) => updateTheme({ radii: { ...currentTheme.radii, lg: v } })}
                placeholder="9999px"
                step={1}
                min={0}
              />
              <NumberUnitInput
                label="Small Radius"
                value={currentTheme.radii.sm}
                onChange={(v) => updateTheme({ radii: { ...currentTheme.radii, sm: v } })}
                placeholder="0.75rem"
                step={0.125}
                min={0}
              />
            </div>

            {/* Behavior Section */}
            <div class="space-y-2">
              <h3 class="text-xs font-bold text-accent uppercase mb-2">Behavior</h3>
              <ToggleField
                label="Section Scoping"
                value={currentTheme.sectionScoping}
                onChange={() => updateTheme({ sectionScoping: !currentTheme.sectionScoping })}
              />
              <div class="space-y-1">
                <label class="text-xs font-semibold text-secondary/80">Table Overflow</label>
                <select
                  value={currentTheme.tableOverflow}
                  onChange={(e) => updateTheme({ tableOverflow: e.currentTarget.value as "scroll" | "wrap" })}
                  class="w-full h-9 px-2 text-sm bg-background border border-foreground rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="scroll">Horizontal Scroll</option>
                  <option value="wrap">Force 100% Width (Wrap)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div class="flex-1 shrink-2 p-4 overflow-y-auto space-y-4" style={{
            "font-family": currentTheme.font,
            "background-color": currentTheme.colors.background,
            "color": currentTheme.colors.secondary,
            "--preview-primary": currentTheme.colors.primary,
            "--preview-secondary": currentTheme.colors.secondary,
            "--preview-accent": currentTheme.colors.accent,
            "--preview-background": currentTheme.colors.background,
            "--preview-foreground": currentTheme.colors.foreground,
          }}>
            <h3 class="text-xs font-bold uppercase mb-2" style={{ color: currentTheme.colors.accent }}>Preview</h3>

            {/* Markdown Cell Preview */}
            <div
              class="border rounded-sm p-3 space-y-3"
              style={{
                "border-color": currentTheme.colors.foreground,
                "border-radius": currentTheme.radii.sm,
                "line-height": currentTheme.spacing.line,
              }}
            >
              <h1 style={{
                color: currentTheme.typography.headerColors?.[0] || currentTheme.colors.primary,
                "font-size": `calc(${currentTheme.typography.fontSize} + 3 * ${currentTheme.typography.headerDelta})`,
                "margin-bottom": currentTheme.typography.headerMarginBottom,
              }}>
                Heading 1
              </h1>
              <h2 style={{
                color: currentTheme.typography.headerColors?.[1] || currentTheme.colors.primary,
                "font-size": `calc(${currentTheme.typography.fontSize} + 2 * ${currentTheme.typography.headerDelta})`,
                "margin-bottom": currentTheme.typography.headerMarginBottom,
              }}>
                Heading 2
              </h2>
              <p style={{
                color: currentTheme.colors.secondary,
                "font-size": currentTheme.typography.fontSize,
                "margin-bottom": currentTheme.spacing.block,
              }}>
                This is a <strong style={{ color: currentTheme.sectionScoping ? (currentTheme.typography.headerColors?.[1] || currentTheme.colors.primary) : currentTheme.typography.headerColors?.[0] || currentTheme.colors.primary }}>markdown</strong> paragraph with <em>styled text</em> and a <span style={{
                  color: currentTheme.sectionScoping ? (currentTheme.typography.headerColors?.[1] || currentTheme.colors.primary) : currentTheme.typography.headerColors?.[0] || currentTheme.colors.primary,
                  "text-decoration": "underline",
                  "text-underline-offset": "3px"
                }}>link</span>.
              </p>
              <h3 style={{
                color: currentTheme.typography.headerColors?.[2] || currentTheme.colors.primary,
                "font-size": `calc(${currentTheme.typography.fontSize} + 1 * ${currentTheme.typography.headerDelta})`,
                "margin-bottom": currentTheme.typography.headerMarginBottom,
              }}>
                Heading 3
              </h3>
              <h4 style={{
                color: currentTheme.typography.headerColors?.[3] || currentTheme.colors.primary,
                "font-size": `calc(${currentTheme.typography.fontSize} + 0 * ${currentTheme.typography.headerDelta})`,
                "margin-bottom": currentTheme.typography.headerMarginBottom,
              }}>
                Heading 4
              </h4>
              <pre
                style={{
                  "background-color": currentTheme.colors.foreground,
                  padding: "0.75rem",
                  "border-radius": currentTheme.radii.sm,
                  "font-size": "0.875rem",
                }}
              >
                <code innerHTML={highlightPython('print("Hello!")')} />
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div class="relative p-4 border-t border-foreground shrink-0 flex flex-col gap-4 lg:block">
          {/* Centered Scope Toggle (Order 1 on mobile) */}
          <div class="order-1 flex w-full lg:w-auto lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:z-10">
            <div class="relative flex items-center justify-between w-full lg:block lg:w-auto">
              <div
                class="relative flex items-center p-1 cursor-pointer select-none transition-colors bg-opacity-20 hover:bg-opacity-30"
                style={{
                  "border": `1px solid ${currentTheme.colors.foreground}`,
                  "border-radius": currentTheme.radii.sm,
                  width: "160px",
                  height: "36px"
                }}
                onClick={() => setApplyScope(applyScope() === "app-wide" ? "session-only" : "app-wide")}
              >
                {/* Sliding background */}
                <div
                  class="absolute h-[calc(100%-8px)] shadow-sm transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)"
                  style={{
                    "background-color": currentTheme.colors.accent,
                    "border-radius": `calc(${currentTheme.radii.sm} - 2px)`,
                    width: "calc(50% - 4px)",
                    left: applyScope() === "app-wide" ? "4px" : "calc(50% + 0px)",
                    top: "4px"
                  }}
                />

                {/* Text labels */}
                <div class="relative z-10 flex w-full h-full">
                  <div
                    class="flex-1 flex items-center justify-center text-xs font-bold tracking-wide transition-colors duration-300"
                    style={{ color: applyScope() === "app-wide" ? currentTheme.colors.background : currentTheme.colors.secondary }}
                  >
                    App
                  </div>
                  <div
                    class="flex-1 flex items-center justify-center text-xs font-bold tracking-wide transition-colors duration-300"
                    style={{ color: applyScope() === "session-only" ? currentTheme.colors.background : currentTheme.colors.secondary }}
                  >
                    Session
                  </div>
                </div>
              </div>

              {/* Warning - Positioned Right */}
              <Show when={applyScope() === "app-wide"}>
                <div class="lg:absolute lg:left-full lg:top-1/2 lg:-translate-y-1/2 lg:ml-3 flex items-center animate-in fade-in slide-in-from-left-2 duration-200">
                  <span class="text-[10px] font-semibold whitespace-nowrap" style={{ color: "#f59e0b" }}>
                    ⚠️ APP WILL RELOAD
                  </span>
                </div>
              </Show>
            </div>
          </div>

          {/* Save Controls Wrapper (Order 2 on mobile) */}
          <div class="order-2 flex items-center justify-between w-full">
            <div
              class="flex items-center gap-2 cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
              onClick={toggleSaveToExport}
              title="Include theme settings in exported .ipynb files"
            >
              <div class={`w-3.5 h-3.5 rounded border border-secondary flex items-center justify-center ${saveToExport() ? 'bg-secondary' : ''}`}>
                <Show when={saveToExport()}>
                  <svg class="w-2.5 h-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </Show>
              </div>
              <span class="text-xs text-secondary">Save settings to .ipynb</span>
            </div>

            <button
              onClick={handleSave}
              class="px-4 py-1.5 text-sm bg-accent text-background font-bold rounded-sm hover:bg-accent/90 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeDialog;
