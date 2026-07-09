import { type Component, type JSX, Show } from "solid-js";
import { ChevronDown, ChevronUp } from "lucide-solid";
import { useThemeDialog } from "./context";

// Collapsible section wrapper with persisted open/closed state.
const Section: Component<{ id: string; title: string; children: JSX.Element }> = (sp) => {
  const { sectionOpen, toggleSection } = useThemeDialog();

  return (
    <div class="space-y-2">
      <button
        type="button"
        onClick={() => toggleSection(sp.id)}
        class="w-full flex items-center justify-between text-xs font-bold text-accent uppercase mb-2"
      >
        <span>{sp.title}</span>
        <Show when={sectionOpen[sp.id]} fallback={<ChevronDown size={14} />}>
          <ChevronUp size={14} />
        </Show>
      </button>
      <Show when={sectionOpen[sp.id]}>
        {sp.children}
      </Show>
    </div>
  );
};

export default Section;
