import { type Component, type JSX, createSignal, Show, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import clsx from "clsx";

interface DropdownProps {
  trigger: JSX.Element;
  children: JSX.Element;
  align?: "left" | "right";
  fullWidthMobile?: boolean;
  usePortal?: boolean;
}

const Dropdown: Component<DropdownProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [coords, setCoords] = createSignal({ top: 0, left: 0, right: 0 });
  let containerRef: HTMLDivElement | undefined;
  let menuRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node;
    const inContainer = containerRef && containerRef.contains(target);
    const inMenu = menuRef && menuRef.contains(target);
    
    if (!inContainer && !inMenu) {
      setIsOpen(false);
    }
  };

  const toggleOpen = () => {
    if (!isOpen() && containerRef) {
      const rect = containerRef.getBoundingClientRect();
      setCoords({
        top: rect.bottom,
        left: rect.left,
        right: rect.right
      });
    }
    setIsOpen(!isOpen());
  };

  // Recalculate position on scroll/resize when open
  const updatePosition = () => {
      if (isOpen() && containerRef) {
          const rect = containerRef.getBoundingClientRect();
          setCoords({
              top: rect.bottom,
              left: rect.left,
              right: rect.right
          });
      }
  };

  document.addEventListener("click", handleClickOutside);
  window.addEventListener("scroll", updatePosition, true);
  window.addEventListener("resize", updatePosition);
  
  onCleanup(() => {
      document.removeEventListener("click", handleClickOutside);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
  });

  const menuClasses = clsx(
    "shadow-lg bg-background border border-foreground ring-1 ring-black/5 focus:outline-none z-50",
    props.fullWidthMobile ? "max-xs:fixed max-xs:left-0 max-xs:right-0 max-xs:top-16.25 max-xs:mt-0 max-xs:rounded-none max-xs:border-t-0 max-xs:w-auto" : "",
    props.fullWidthMobile ? "xs:absolute xs:mt-2 xs:w-70 sm:w-40 xs:rounded-sm" : "mt-2 w-70 rounded-sm",
    // If NOT using portal, we use relative positioning classes
    !props.usePortal && (props.align === "right" ? "right-0" : "left-0"),
    !props.usePortal && "absolute"
  );

  const menuContent = (
    <div 
        ref={menuRef}
        class={clsx(menuClasses, props.usePortal && "fixed")}
        style={props.usePortal ? {
            top: `${coords().top - 2}px`, // Lift up by 6px relative to previous +4
            left: props.align === "right" ? 'auto' : `${coords().left}px`,
            right: props.align === "right" ? `${document.documentElement.clientWidth - coords().right}px` : 'auto'
        } : undefined}
    >
      <div class="py-1" role="menu" aria-orientation="vertical" onClick={() => setIsOpen(false)}>
        {props.children}
      </div>
    </div>
  );

  return (
    <div class="relative inline-block text-left" ref={containerRef}>
      <div onClick={toggleOpen}>
        {props.trigger}
      </div>

      <Show when={isOpen()}>
        <Show when={props.usePortal} fallback={menuContent}>
            <Portal>
                {menuContent}
            </Portal>
        </Show>
      </Show>
    </div>
  );
};

export const DropdownItem: Component<{ onClick?: () => void; children: JSX.Element; class?: string; disabled?: boolean; shortcut?: string }> = (props) => {
    return (
        <button
            onClick={props.onClick}
            disabled={props.disabled}
            class={clsx(
                "w-full text-left flex items-center justify-between px-4 py-2 text-sm text-secondary hover:bg-foreground hover:text-secondary disabled:opacity-50 disabled:cursor-not-allowed group",
                props.class
            )}
            role="menuitem"
        >
            <span class="flex items-center gap-2">{props.children}</span>
            <Show when={props.shortcut}>
                <span class="text-xs font-mono opacity-50 group-hover:opacity-80">{props.shortcut}</span>
            </Show>
        </button>
    )
}

// Nested dropdown item with side menu
export const DropdownNested: Component<{ label: JSX.Element; children: JSX.Element }> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <div 
      class="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          // Always open on click (for touch devices)
          setIsOpen(true);
        }}
        class="w-full text-left block px-4 py-2 text-sm text-secondary hover:bg-foreground hover:text-secondary"
        role="menuitem"
      >
        {props.label}
      </button>
      <Show when={isOpen()}>
        <div 
          class="absolute left-full -top-1 w-70 rounded-sm shadow-lg bg-background border border-foreground ring-1 ring-black/5 z-50"
        >
          <div class="py-1" role="menu" aria-orientation="vertical">
            {props.children}
          </div>
        </div>
      </Show>
    </div>
  );
};

// Divider for dropdown sections
export const DropdownDivider: Component = () => {
  return <div class="border-t border-foreground my-1" />;
};

export default Dropdown;