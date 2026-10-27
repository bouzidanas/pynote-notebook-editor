import { type Component, type JSX, For, Show, createEffect, createSignal, createUniqueId, on, onCleanup, onMount } from "solid-js";
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from "lucide-solid";
import clsx from "clsx";

// Small controls for the Export dialog, in the look of the Theme and Code
// Visibility dialogs (same row hover, checkbox and sliding toggle styles).

export const SectionTitle: Component<{ children: JSX.Element; class?: string }> = (props) => (
  <h3 class={clsx("text-xs font-bold text-accent uppercase mb-2", props.class)}>{props.children}</h3>
);

const CheckMark: Component<{ checked: boolean }> = (props) => (
  <div
    class={clsx(
      "w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0",
      props.checked ? "bg-accent border-accent" : "border-foreground group-hover:border-secondary/50",
    )}
  >
    <Show when={props.checked}>
      <svg class="w-2.5 h-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </Show>
  </div>
);

// The label names the checkbox and the hint describes it, so a screen reader
// (and a test looking for a name) gets the label alone.
export const CheckRow: Component<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = (props) => {
  const id = createUniqueId();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={props.hint ? `${id}-hint` : undefined}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      class="w-full text-left flex items-start gap-2 py-1.5 px-2 rounded-sm hover:bg-foreground/50 transition-colors group cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-accent"
    >
      <span class="mt-0.5">
        <CheckMark checked={props.checked} />
      </span>
      <span class="flex-1 min-w-0">
        <span id={`${id}-label`} class="block text-secondary text-sm">{props.label}</span>
        <Show when={props.hint}>
          <span id={`${id}-hint`} class="block text-xs text-secondary/50 mt-0.5">{props.hint}</span>
        </Show>
      </span>
    </button>
  );
};

const Hint: Component<{ id?: string; children: JSX.Element }> = (props) => (
  <span id={props.id} class="block text-xs text-secondary/50 leading-relaxed">{props.children}</span>
);

// Columns for a number of choices. Many choices wrap to two rows on phones,
// where one row would squeeze their labels.
const SEGMENT_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-3 sm:grid-cols-5",
  6: "grid-cols-3 sm:grid-cols-6",
};

/** Mutually exclusive choices with the sliding accent background. */
export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** What the current choice means. */
  hint?: JSX.Element;
}): JSX.Element {
  const hintId = createUniqueId();
  const buttons: HTMLButtonElement[] = [];
  let group!: HTMLDivElement;

  // The background is measured from the chosen button, so it follows the
  // choices wherever they wrap.
  const [mark, setMark] = createSignal<{ left: number; top: number; width: number; height: number } | null>(null);
  const measure = () => {
    const chosen = buttons[props.options.findIndex((o) => o.value === props.value)];
    setMark(chosen ? { left: chosen.offsetLeft, top: chosen.offsetTop, width: chosen.offsetWidth, height: chosen.offsetHeight } : null);
  };
  onMount(() => {
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    onCleanup(() => observer.disconnect());
  });
  createEffect(on(() => props.value, measure, { defer: true }));

  return (
    <div class="space-y-1.5 px-2 py-1.5">
      <span class="block text-xs font-semibold text-secondary/80">{props.label}</span>
      <div
        ref={group}
        role="radiogroup"
        aria-label={props.label}
        aria-describedby={props.hint ? hintId : undefined}
        class={clsx("relative grid gap-1 p-1 select-none ui-border rounded-sm", SEGMENT_COLUMNS[props.options.length] ?? "grid-cols-2")}
      >
        <Show when={mark()}>
          {(m) => (
            <div
              class="absolute shadow-sm transition-all duration-300 bg-accent rounded-[calc(var(--radius-sm)-2px)]"
              style={{ left: `${m().left}px`, top: `${m().top}px`, width: `${m().width}px`, height: `${m().height}px` }}
            />
          )}
        </Show>
        <For each={props.options}>
          {(option, i) => (
            <button
              ref={(el) => (buttons[i()] = el)}
              type="button"
              role="radio"
              aria-checked={option.value === props.value}
              onClick={() => props.onChange(option.value)}
              class={clsx(
                "relative z-10 h-7 px-1 flex items-center justify-center text-xs font-bold tracking-wide whitespace-nowrap transition-colors duration-300 cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-accent",
                option.value === props.value ? "text-background" : "text-secondary hover:text-secondary/80",
              )}
            >
              {option.label}
            </button>
          )}
        </For>
      </div>
      <Show when={props.hint}>
        <Hint id={hintId}>{props.hint}</Hint>
      </Show>
    </div>
  );
}

/** Compact tabs for switching what a pane shows (labels keep their width). */
export function Tabs<T extends string>(props: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** Labels are file names. */
  mono?: boolean;
}): JSX.Element {
  return (
    <div role="tablist" aria-label={props.label} class="flex items-center gap-0.5 p-0.5 ui-border rounded-sm">
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            role="tab"
            aria-selected={option.value === props.value}
            onClick={() => props.onChange(option.value)}
            class={clsx(
              "px-2 py-0.5 text-xs font-bold rounded-[calc(var(--radius-sm)-2px)] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline focus-visible:outline-accent",
              props.mono && "font-mono",
              option.value === props.value ? "bg-accent text-background" : "text-secondary/70 hover:text-secondary",
            )}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

/**
 * A one-line text input with a label and a hint. As with CheckRow, the label
 * names the input and the hint only describes it, so the hint stays out of
 * the label element.
 */
export const TextField: Component<{
  label: string;
  value: string;
  placeholder?: string;
  hint?: JSX.Element;
  onInput: (value: string) => void;
}> = (props) => {
  const id = createUniqueId();
  return (
    <div class="space-y-1.5 px-2 py-1.5">
      <label for={`${id}-input`} class="block text-xs font-semibold text-secondary/80">{props.label}</label>
      <input
        id={`${id}-input`}
        type="text"
        aria-describedby={props.hint ? `${id}-hint` : undefined}
        value={props.value}
        placeholder={props.placeholder}
        spellcheck={false}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        class="w-full h-9 px-2 text-sm bg-background ui-border rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
      />
      <Show when={props.hint}>
        <Hint id={`${id}-hint`}>{props.hint}</Hint>
      </Show>
    </div>
  );
};

export type NoticeTone = "info" | "warning" | "error" | "success" | "progress";

const TONES: Record<NoticeTone, { icon: Component<{ size?: number; class?: string }>; color: string }> = {
  info: { icon: Info, color: "text-secondary/70" },
  warning: { icon: TriangleAlert, color: "text-warning" },
  error: { icon: CircleX, color: "text-error" },
  success: { icon: CircleCheck, color: "text-success" },
  progress: { icon: LoaderCircle, color: "text-secondary/70" },
};

export const Notice: Component<{ tone: NoticeTone; children: JSX.Element; testId?: string }> = (props) => {
  const tone = () => TONES[props.tone];
  return (
    <div class="flex items-start gap-2 px-2 py-1.5 text-xs leading-relaxed" role={props.tone === "error" || props.tone === "warning" ? "alert" : "status"} data-testid={props.testId}>
      <span class={clsx("mt-px shrink-0", tone().color, props.tone === "progress" && "animate-spin")}>
        {(() => {
          const Icon = tone().icon;
          return <Icon size={14} />;
        })()}
      </span>
      <div class="flex-1 min-w-0 text-secondary/80">{props.children}</div>
    </div>
  );
};
