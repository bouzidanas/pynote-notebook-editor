import { type Component, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { ChevronDown, ChevronUp, Pipette } from "lucide-solid";
import { currentTheme } from "../../lib/theme";
import { hexToRGB, hexToHSL, hslToHex, parseColorInput } from "./color-utils";
import { useThemeDialog } from "./context";

const ColorInput: Component<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  id: string;
  placeholder?: string;
  // Free-text mode: the main input accepts any CSS value verbatim (no hex
  // normalization, no hex/rgb/hsl cycling). The swatch and picker stay as a
  // quick way to drop a color into the field.
  freeText?: boolean;
}> = (itemProps) => {
  const { openPickerId, setOpenPickerId } = useThemeDialog();

  const [hue, setHue] = createSignal(0);
  const [saturation, setSaturation] = createSignal(100);
  const [lightness, setLightness] = createSignal(50);
  const [colorFormat, setColorFormat] = createSignal<'hex' | 'rgb' | 'hsl'>('hex');

  const isOpen = () => openPickerId() === itemProps.id;
  const togglePicker = () => {
    setOpenPickerId(isOpen() ? null : itemProps.id);
  };

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

  const cycleFormat = (direction: 'up' | 'down') => {
    const formats: Array<'hex' | 'rgb' | 'hsl'> = ['hex', 'rgb', 'hsl'];
    const currentIndex = formats.indexOf(colorFormat());
    let newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0) newIndex = formats.length - 1;
    if (newIndex >= formats.length) newIndex = 0;
    setColorFormat(formats[newIndex]);
  };

  // Initialize HSL from current color. When the value is blank, seed from the
  // placeholder (e.g. the active scheme's token color) so the picker opens on
  // the effective color rather than defaulting to red.
  createEffect(() => {
    const hsl = hexToHSL(itemProps.value || itemProps.placeholder || '');
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
          style={{ background: itemProps.value || itemProps.placeholder }}
        />
        <div class="relative flex-1">
          <input
            type="text"
            value={itemProps.freeText ? itemProps.value : getFormattedColor()}
            placeholder={itemProps.placeholder}
            onInput={(e) => {
              const raw = e.currentTarget.value;
              itemProps.onChange(itemProps.freeText ? raw : parseColorInput(raw));
            }}
            class="w-full h-9 px-2 pr-6 text-sm bg-background ui-border rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
          />
          <Show when={!itemProps.freeText}>
          <div class="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
            <button
              type="button"
              onClick={() => cycleFormat('up')}
              class="p-[calc(var(--spacing)*.4)] pr-1 text-secondary/50 hover:text-secondary transition-colors"
              tabIndex={-1}
            ><ChevronUp size={12} />
            </button>
            <button
              type="button"
              onClick={() => cycleFormat('down')}
              class="p-[calc(var(--spacing)*.4)] pr-1 text-secondary/50 hover:text-secondary transition-colors"
              tabIndex={-1}
            >
              <ChevronDown size={12} />
            </button>
          </div>
          </Show>
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
                value={itemProps.freeText ? itemProps.value : getFormattedColor()}
                placeholder={itemProps.placeholder}
                onInput={(e) => {
                  const raw = e.currentTarget.value;
                  itemProps.onChange(itemProps.freeText ? raw : parseColorInput(raw));
                }}
                class="w-full px-2 py-2 pr-8 text-sm bg-background ui-border rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
              />
              <Show when={!itemProps.freeText}>
              <div class="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                <button
                  type="button"
                  onClick={() => cycleFormat('up')}
                  class="p-[calc(var(--spacing)*.4)] pr-1 text-secondary/50 hover:text-secondary transition-colors"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => cycleFormat('down')}
                  class="p-[calc(var(--spacing)*.4)] pr-1 text-secondary/50 hover:text-secondary transition-colors"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
              </Show>
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

export default ColorInput;
