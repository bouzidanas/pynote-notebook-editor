import { type Component, Show } from "solid-js";
import { ChevronDown, ChevronUp } from "lucide-solid";
import clsx from "clsx";

// Text input that steps numeric values with a unit suffix (px, rem, %...).
export const NumberUnitInput: Component<{
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

    // Pick a sensible step for the unit when none is given.
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
          class="w-full h-9 px-2 pr-7 text-sm bg-background ui-border rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); update(1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); update(-1); }
          }}
        />
        <div class="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
          <button
            type="button"
            onClick={() => update(1)}
            class="p-[calc(var(--spacing)*.4)] pr-1 text-secondary/50 hover:text-secondary transition-colors"
            tabIndex={-1}
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            onClick={() => update(-1)}
            class="p-[calc(var(--spacing)*.4)] pr-1 text-secondary/50 hover:text-secondary transition-colors"
            tabIndex={-1}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const InputField: Component<{
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
      class="w-full h-9 px-2 text-sm bg-background ui-border rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
    />
  </div>
);

export const ToggleField: Component<{
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
