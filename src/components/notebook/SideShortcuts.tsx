import { type Component, For, Show } from "solid-js";
import { X } from "lucide-solid";
import { SHORTCUTS } from "./shortcuts";

const SideShortcuts: Component<{ activeId: string | null; isEditing: boolean; onClose: () => void }> = (props) => {
  // Global when nothing is selected, command when a cell is selected, edit while editing.
  const section = () => {
    if (!props.activeId) return "global";
    if (props.isEditing) return "edit";
    return "command";
  };

  return (
     <div class="fixed left-[calc(50%+28rem)] px-2 top-32 w-[calc(50%-32rem)] max-w-[20rem] hidden 2xl:flex flex-col text-secondary/60 transition-opacity duration-300 group z-[300000]">
          <button
            onClick={props.onClose}
            class="self-end -mb-5 translate-y-[2px] translate-x-1.5 p-1.5 rounded-lg hover:bg-foreground text-secondary/40 hover:text-secondary opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer z-300002"
            title="Hide Shortcuts"
          >
            <X size={16} />
        </button>

        <div class="flex flex-col gap-6 max-h-[calc(100vh-12rem)] overflow-x-hidden overflow-y-auto">
        <Show when={section() === "global"}>
          <div class="space-y-2">
              <h3 class="text-xs font-bold uppercase tracking-widest opacity-50">Global</h3>
              <For each={SHORTCUTS.global}>
                  {s => <div class="text-xs flex justify-between gap-8"><span class="font-light">{s.label}</span> <span class="font-mono opacity-75">{s.keys}</span></div>}
              </For>
          </div>
        </Show>

        <Show when={section() === "command"}>
          <div class="space-y-2">
              <h3 class="text-xs font-bold uppercase tracking-widest opacity-50">Command Mode</h3>
              <For each={SHORTCUTS.command}>
                  {s => <div class="text-xs flex justify-between gap-8"><span class="font-light">{s.label}</span> <span class="font-mono opacity-75">{s.keys}</span></div>}
              </For>
          </div>
        </Show>

        <Show when={section() === "edit"}>
          <div class="space-y-2">
              <h3 class="text-xs font-bold uppercase tracking-widest opacity-50">Edit Mode</h3>
              <For each={SHORTCUTS.edit}>
                  {s => <div class="text-xs flex justify-between gap-8"><span class="font-light">{s.label}</span> <span class="font-mono opacity-75">{s.keys}</span></div>}
              </For>
          </div>
        </Show>
        </div>
     </div>
  );
};

export default SideShortcuts;
