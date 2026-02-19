import { type Component, createSignal, createEffect, For, Show, onCleanup } from "solid-js";
import { ChevronDown } from "lucide-solid";

export interface ComboBoxOption {
  /** Display label shown in the dropdown */
  label: string;
  /** Actual value stored/applied (e.g. the CSS font-family string) */
  value: string;
}

interface ComboBoxProps {
  label: string;
  value: string;
  options: ComboBoxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

const ComboBox: Component<ComboBoxProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [inputValue, setInputValue] = createSignal(props.value);
  const [highlightedIndex, setHighlightedIndex] = createSignal(-1);
  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  // Sync input value when the external value prop changes
  createEffect(() => {
    setInputValue(props.value);
  });

  // Get the display label for the current value (if it matches an option)
  const getDisplayValue = () => {
    const match = props.options.find((o) => o.value === inputValue());
    return match ? match.label : inputValue();
  };

  // Filter options based on what the user actually sees in the input
  const filteredOptions = () => {
    const display = getDisplayValue().toLowerCase().trim();
    // If the display matches a known option label exactly, show all options (no filtering needed)
    const isExactMatch = props.options.some((o) => o.label.toLowerCase() === display);
    if (!display || isExactMatch) return props.options;
    // Otherwise the user is typing a custom value — filter to matching options
    return props.options.filter(
      (o) =>
        o.label.toLowerCase().includes(display) ||
        o.value.toLowerCase().includes(display)
    );
  };

  const selectOption = (option: ComboBoxOption) => {
    setInputValue(option.value);
    props.onChange(option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef?.blur();
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    props.onChange(value);
    if (!isOpen()) setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleFocus = () => {
    setIsOpen(true);
    // Show all options on focus by clearing highlight
    setHighlightedIndex(-1);
  };

  const handleBlur = (e: FocusEvent) => {
    // Don't close if clicking within the combobox container
    if (containerRef?.contains(e.relatedTarget as Node)) return;
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const opts = filteredOptions();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen()) {
          setIsOpen(true);
        }
        setHighlightedIndex((prev) => Math.min(prev + 1, opts.length - 1));
        scrollToHighlighted();
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        scrollToHighlighted();
        break;
      case "Enter":
        e.preventDefault();
        if (isOpen() && highlightedIndex() >= 0 && highlightedIndex() < opts.length) {
          selectOption(opts[highlightedIndex()]);
        } else {
          setIsOpen(false);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case "Tab":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const scrollToHighlighted = () => {
    requestAnimationFrame(() => {
      const idx = highlightedIndex();
      if (idx < 0 || !listRef) return;
      const item = listRef.children[idx] as HTMLElement;
      if (item) item.scrollIntoView({ block: "nearest" });
    });
  };

  // Close on outside click
  const handleDocClick = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  createEffect(() => {
    document.addEventListener("mousedown", handleDocClick);
    onCleanup(() => document.removeEventListener("mousedown", handleDocClick));
  });

  return (
    <div class="space-y-1" ref={containerRef}>
      <label class="text-xs font-semibold text-secondary/80">{props.label}</label>
      <div class="relative">
        <input
          ref={inputRef}
          type="text"
          value={getDisplayValue()}
          onInput={(e) => handleInputChange(e.currentTarget.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={props.placeholder}
          class="w-full h-9 px-2 pr-8 text-sm bg-background border border-foreground rounded-sm text-secondary focus:outline-none focus:border-accent transition-colors font-mono"
          role="combobox"
          aria-expanded={isOpen()}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setIsOpen(!isOpen());
            if (!isOpen()) inputRef?.focus();
          }}
          class="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-secondary/50 hover:text-secondary transition-colors"
        >
          <ChevronDown
            size={14}
            class="transition-transform"
            classList={{ "rotate-180": isOpen() }}
          />
        </button>

        <Show when={isOpen() && filteredOptions().length > 0}>
          <div
            ref={listRef}
            role="listbox"
            class="absolute z-[10] left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-background border border-foreground rounded-sm shadow-lg"
          >
            <For each={filteredOptions()}>
              {(option, index) => {
                const isSelected = () => props.value === option.value;
                const isHighlighted = () => highlightedIndex() === index();
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected()}
                    tabIndex={-1}
                    class="w-full text-left px-2.5 py-1.5 text-sm transition-colors cursor-pointer"
                    classList={{
                      "bg-accent/15 text-accent": isHighlighted(),
                      "bg-accent/5 text-secondary": isSelected() && !isHighlighted(),
                      "text-secondary hover:bg-foreground/60": !isSelected() && !isHighlighted(),
                    }}
                    style={{ "font-family": option.value }}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent input blur
                      selectOption(option);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index())}
                  >
                    {option.label}
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default ComboBox;
