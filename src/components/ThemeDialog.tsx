import { type Component } from "solid-js";
import { X, Palette, RotateCcw, Sparkles } from "lucide-solid";
import { updateTheme, defaultTheme } from "../lib/theme";
import { ThemeDialogContext, createThemeDialogState, type ThemeDialogProps } from "./theme-dialog/context";
import CoreSections from "./theme-dialog/CoreSections";
import AdvancedSections from "./theme-dialog/AdvancedSections";
import PreviewPane from "./theme-dialog/PreviewPane";
import DialogFooter from "./theme-dialog/DialogFooter";

const ThemeDialog: Component<ThemeDialogProps> = (props) => {
  const state = createThemeDialogState(props);
  const { originalTheme, resetSections, handleCancel } = state;

  return (
    <ThemeDialogContext.Provider value={state}>
      <div
        class="fixed inset-0 z-[300000] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
        onClick={handleCancel}
      >
        <div
          class="bg-background ui-border ui-font rounded-sm shadow-xl max-w-5xl w-full max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="relative flex items-center justify-between p-4 [border-bottom-width:var(--ui-divider-width,1px)] ui-divider shrink-0">
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
                onClick={() => { updateTheme({ ...defaultTheme }); resetSections(); }}
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
          <div class="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">

            {/* Left Panel - Theme Inputs */}
            <div class="flex-1 max-lg:h-[76%] shrink-3 min-h-0 p-4 overflow-y-auto [border-bottom-width:var(--ui-divider-width,1px)] lg:[border-bottom-width:0px] lg:[border-right-width:var(--ui-divider-width,1px)] ui-divider space-y-4">
              <CoreSections />
              <AdvancedSections />
            </div>

            <PreviewPane />
          </div>

          <DialogFooter />
        </div>
      </div>
    </ThemeDialogContext.Provider>
  );
};

export default ThemeDialog;
