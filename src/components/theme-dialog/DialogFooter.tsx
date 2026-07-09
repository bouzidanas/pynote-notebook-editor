import { type Component, Show } from "solid-js";
import clsx from "clsx";
import { useThemeDialog } from "./context";

// Footer: apply-scope toggle, save-to-export checkbox, save button.
const DialogFooter: Component = () => {
  const { applyScope, setApplyScope, saveToExport, toggleSaveToExport, handleSave } = useThemeDialog();

  return (
    <>
        {/* Footer */}
        <div class="relative p-4 [border-top-width:var(--ui-divider-width,1px)] ui-divider shrink-0 flex flex-col gap-4 lg:block">
          {/* Centered Scope Toggle (Order 1 on mobile) */}
          <div class="order-1 flex w-full lg:w-auto lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:z-10">
            <div class="relative flex flex-col items-center gap-2 w-full lg:flex-row lg:items-center lg:justify-between lg:w-auto">
              <div
                class="relative flex items-center p-1 cursor-pointer select-none transition-colors ui-border hover:border-secondary/30 w-40 h-9 rounded-sm"
                onClick={() => setApplyScope(applyScope() === "app-wide" ? "session-only" : "app-wide")}
              >
                {/* Sliding background */}
                <div
                  class="absolute h-[calc(100%-8px)] shadow-sm transition-all duration-300 bg-accent rounded-[calc(var(--radius-sm)-2px)] w-[calc(50%-4px)]"
                  style={{
                    left: applyScope() === "app-wide" ? "4px" : "calc(50% + 0px)",
                    top: "4px"
                  }}
                />

                {/* Text labels */}
                <div class="relative z-10 flex w-full h-full">
                  <div
                    class={clsx(
                      "flex-1 flex items-center justify-center text-xs font-bold tracking-wide transition-colors duration-300",
                      applyScope() === "app-wide" ? "text-background" : "text-secondary"
                    )}
                  >
                    App
                  </div>
                  <div
                    class={clsx(
                      "flex-1 flex items-center justify-center text-xs font-bold tracking-wide transition-colors duration-300",
                      applyScope() === "session-only" ? "text-background" : "text-secondary"
                    )}
                  >
                    Session
                  </div>
                </div>
              </div>

              {/* Warning - Positioned Right */}
              <Show when={applyScope() === "app-wide"}>
                <div class="lg:absolute lg:left-full lg:top-1/2 lg:-translate-y-1/2 lg:ml-3 flex items-center justify-center w-full lg:w-auto animate-in fade-in slide-in-from-left-2 duration-200">
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
    </>
  );
};

export default DialogFooter;
