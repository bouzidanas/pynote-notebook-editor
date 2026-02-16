import { type Component, createSignal, createEffect, Show } from "solid-js";
import { X, Code, EyeOff, TriangleAlert, Terminal, FileOutput, AlertCircle, CircleDot, ArrowUp, ArrowDown, Hash, WrapText, RotateCcw } from "lucide-solid";
import clsx from "clsx";
import { 
  codeVisibility, 
  updateVisibility, 
  saveVisibilitySettings,
  type CodeVisibilitySettings 
} from "../lib/codeVisibility";
import { currentTheme, updateTheme } from "../lib/theme";
import { notebookStore, actions, type CellCodeVisibility } from "../lib/store";

interface CodeVisibilityDialogProps {
  onClose: () => void;
  onSave?: () => void; // Callback after save to trigger session autosave
  activeCellId?: string | null; // Currently selected cell ID (null = no cell selected)
}

const CodeVisibilityDialog: Component<CodeVisibilityDialogProps> = (props) => {
  // Determine if the active cell is a code cell (scope toggle only shows for code cells)
  const activeCodeCell = () => {
    if (!props.activeCellId) return null;
    const cell = notebookStore.cells.find(c => c.id === props.activeCellId);
    return cell?.type === "code" ? cell : null;
  };

  // Scope toggle: "cell" or "notebook" (only available when a code cell is selected)
  const [applyScope, setApplyScope] = createSignal<"cell" | "notebook">("notebook");

  // Local state mirrors the store for preview (before save)
  const [localSettings, setLocalSettings] = createSignal<CodeVisibilitySettings>({
    showCode: codeVisibility.showCode,
    showStdout: codeVisibility.showStdout,
    showStderr: codeVisibility.showStderr,
    showResult: codeVisibility.showResult,
    showError: codeVisibility.showError,
    showStatusDot: codeVisibility.showStatusDot,
    saveToExport: codeVisibility.saveToExport,
    showLineNumbers: codeVisibility.showLineNumbers,
    lineWrap: codeVisibility.lineWrap,
  });

  // Local state for output layout (above/below)
  const [localOutputLayout, setLocalOutputLayout] = createSignal<"above" | "below">(currentTheme.outputLayout);

  // Load cell metadata into local settings when switching to cell scope
  const loadCellSettings = () => {
    const cell = activeCodeCell();
    if (!cell) return;
    const cellCv = cell.metadata?.pynote?.codeview;
    // Start with global settings, then overlay any cell-level overrides
    setLocalSettings({
      showCode: cellCv?.showCode ?? codeVisibility.showCode,
      showStdout: cellCv?.showStdout ?? codeVisibility.showStdout,
      showStderr: cellCv?.showStderr ?? codeVisibility.showStderr,
      showResult: cellCv?.showResult ?? codeVisibility.showResult,
      showError: cellCv?.showError ?? codeVisibility.showError,
      showStatusDot: cellCv?.showStatusDot ?? codeVisibility.showStatusDot,
      saveToExport: codeVisibility.saveToExport, // saveToExport applies at both levels
      showLineNumbers: codeVisibility.showLineNumbers,
      lineWrap: codeVisibility.lineWrap,
    });
  };

  // Load notebook-level settings into local settings
  const loadNotebookSettings = () => {
    setLocalSettings({
      showCode: codeVisibility.showCode,
      showStdout: codeVisibility.showStdout,
      showStderr: codeVisibility.showStderr,
      showResult: codeVisibility.showResult,
      showError: codeVisibility.showError,
      showStatusDot: codeVisibility.showStatusDot,
      saveToExport: codeVisibility.saveToExport,
      showLineNumbers: codeVisibility.showLineNumbers,
      lineWrap: codeVisibility.lineWrap,
    });
  };

  // Sync from store when dialog opens
  createEffect(() => {
    loadNotebookSettings();
    setLocalOutputLayout(currentTheme.outputLayout);
  });

  // When scope changes, reload appropriate settings
  createEffect(() => {
    const scope = applyScope();
    if (scope === "cell") {
      loadCellSettings();
    } else {
      loadNotebookSettings();
    }
  });

  const toggle = (key: keyof CodeVisibilitySettings) => {
    setLocalSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    const settings = localSettings();

    if (applyScope() === "cell" && props.activeCellId) {
      // Cell-scoped save: write to cell metadata
      const cellCv: CellCodeVisibility = {
        showCode: settings.showCode,
        showStdout: settings.showStdout,
        showStderr: settings.showStderr,
        showResult: settings.showResult,
        showError: settings.showError,
        showStatusDot: settings.showStatusDot,
      };
      actions.setCellCodeVisibility(props.activeCellId, cellCv);
      // If saveToExport is checked, the cell metadata will persist to .ipynb on next save
      // (cell metadata is already included in buildNotebookJson when not saving global codeview)
      // Notify parent to trigger session autosave
      props.onSave?.();
      props.onClose();
    } else {
      // Notebook-scoped save (existing behavior)
      updateVisibility("showCode", settings.showCode);
      updateVisibility("showStdout", settings.showStdout);
      updateVisibility("showStderr", settings.showStderr);
      updateVisibility("showResult", settings.showResult);
      updateVisibility("showError", settings.showError);
      updateVisibility("showStatusDot", settings.showStatusDot);
      updateVisibility("saveToExport", settings.saveToExport);
      updateVisibility("showLineNumbers", settings.showLineNumbers);
      updateVisibility("lineWrap", settings.lineWrap);
      // Persist visibility to localStorage
      saveVisibilitySettings();
      // Update theme output layout
      updateTheme({ outputLayout: localOutputLayout() });
      // Notify parent to trigger session autosave
      props.onSave?.();
      props.onClose();
    }
  };

  // Helper to check if any visible output exists in preview
  const hasVisibleOutput = () => {
    const s = localSettings();
    return s.showStdout || s.showStderr || s.showResult || s.showError;
  };

  // Checkbox item with optional position toggle or line numbers toggle
  const CheckboxRow: Component<{
    itemKey: keyof CodeVisibilitySettings;
    label: string;
    icon: Component<{ size?: number }>;
    iconColor: string;
    hasPositionToggle?: boolean;
    hasEditorToggles?: boolean;
  }> = (itemProps) => (
    <div 
      class="flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-foreground/50 transition-colors group cursor-pointer"
      onClick={() => toggle(itemProps.itemKey)}
    >
      <div class={clsx(
        "w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0",
        localSettings()[itemProps.itemKey]
          ? "bg-accent border-accent" 
          : "border-foreground group-hover:border-secondary/50"
      )}>
        <Show when={localSettings()[itemProps.itemKey]}>
          <svg class="w-2.5 h-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </Show>
      </div>
      <span class={clsx(itemProps.iconColor, "shrink-0")}>
        <itemProps.icon size={14} />
      </span>
      <span class="text-secondary text-sm flex-1">{itemProps.label}</span>
      
      {/* Position toggle for stdout */}
      <Show when={itemProps.hasPositionToggle && localSettings()[itemProps.itemKey]}>
        <button
          type="button"
          class={clsx(
            "flex items-center gap-1 px-1.5 py-0.5 text-xs rounded transition-colors",
            applyScope() === "cell"
              ? "text-secondary/25 cursor-not-allowed"
              : "text-secondary/60 hover:text-secondary hover:bg-foreground"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (applyScope() === "cell") return;
            setLocalOutputLayout(prev => prev === "above" ? "below" : "above");
          }}
          title={applyScope() === "cell" ? "Notebook-level setting" : `Output position: ${localOutputLayout()}`}
        >
          <Show when={localOutputLayout() === "above"} fallback={<><ArrowDown size={12} /> below</>}>
            <ArrowUp size={12} /> above
          </Show>
        </button>
      </Show>
      
      {/* Line numbers toggle for code editor */}
      <Show when={itemProps.hasEditorToggles && localSettings()[itemProps.itemKey]}>
        <button
          type="button"
          class={clsx(
            "flex items-center gap-1 px-1.5 py-0.5 text-xs rounded transition-colors",
            applyScope() === "cell"
              ? "text-secondary/25 cursor-not-allowed"
              : "text-secondary/60 hover:text-secondary hover:bg-foreground"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (applyScope() === "cell") return;
            toggle("showLineNumbers");
          }}
          title={applyScope() === "cell" ? "Notebook-level setting" : (localSettings().showLineNumbers ? "Hide line numbers" : "Show line numbers")}
        >
          <Hash size={12} />
          <Show when={localSettings().showLineNumbers} fallback="off">on</Show>
        </button>
        <button
          type="button"
          class={clsx(
            "flex items-center gap-1 px-1.5 py-0.5 text-xs rounded transition-colors",
            applyScope() === "cell"
              ? "text-secondary/25 cursor-not-allowed"
              : "text-secondary/60 hover:text-secondary hover:bg-foreground"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (applyScope() === "cell") return;
            toggle("lineWrap");
          }}
          title={applyScope() === "cell" ? "Notebook-level setting" : (localSettings().lineWrap ? "Disable line wrap" : "Enable line wrap")}
        >
          <WrapText size={12} />
          <Show when={localSettings().lineWrap} fallback="off">on</Show>
        </button>
      </Show>
    </div>
  );

  return (
    <div 
      class="fixed inset-0 z-[300000] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div 
        class="bg-background border border-foreground rounded-sm shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="flex items-center justify-between p-4 border-b border-foreground shrink-0">
          <h2 class="text-lg font-bold flex items-center gap-2">
            <EyeOff size={20} /> Code Cell Visibility
            <Show when={applyScope() === "cell" && activeCodeCell()}>
              <span class="text-xs font-normal text-secondary/60 ml-1">
                — Cell {notebookStore.cells.findIndex(c => c.id === props.activeCellId) + 1}
              </span>
            </Show>
          </h2>

          <button onClick={props.onClose} class="p-1 hover:bg-foreground rounded-sm">
            <X size={20} />
          </button>
        </div>

        {/* Content - Two Column Layout */}
        <div class="flex flex-col sm:flex-row flex-1 overflow-hidden">
          
          {/* Left Panel - Checkboxes */}
          <div class="flex-1 p-4 overflow-y-auto border-b sm:border-b-0 sm:border-r border-foreground">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-bold text-accent uppercase">Show / Hide Elements</h3>
              <button
                onClick={() => {
                  if (props.activeCellId) {
                    actions.clearCellCodeVisibility(props.activeCellId);
                    loadNotebookSettings();
                    setApplyScope("notebook");
                  }
                }}
                class={clsx(
                  "p-1 -mr-1.5 text-secondary/50 hover:text-accent transition-colors rounded-sm",
                  !(applyScope() === "cell" && activeCodeCell()) && "invisible"
                )}
                title="Reset cell to notebook defaults"
              >
                <RotateCcw size={15} />
              </button>
            </div>
            <div class="space-y-0.5">
              <CheckboxRow itemKey="showCode" label="Code Editor" icon={Code} iconColor="text-accent" hasEditorToggles={true} />
              <CheckboxRow itemKey="showStatusDot" label="Status Indicator" icon={CircleDot} iconColor="text-success" />
              <CheckboxRow itemKey="showStdout" label="Standard Output" icon={Terminal} iconColor="text-secondary" hasPositionToggle={true} />
              <CheckboxRow itemKey="showResult" label="Return Value" icon={FileOutput} iconColor="text-secondary/70" />
              <CheckboxRow itemKey="showStderr" label="Warnings (stderr)" icon={TriangleAlert} iconColor="text-warning" />
              <CheckboxRow itemKey="showError" label="Errors" icon={AlertCircle} iconColor="text-error" />
            </div>
            
            {/* Info note */}
            <p class="text-xs text-secondary/50 mt-4">
              <Show when={applyScope() === "cell"} fallback={<>
                Hidden elements still execute — only their display is affected. 
                Use the <EyeOff size={10} class="inline mx-0.5" /> button on cells to reveal all.
              </>}>
                Settings override notebook-level visibility for this cell only.
                Cell overrides take priority.
              </Show>
            </p>
          </div>

          {/* Right Panel - Preview */}
          <div class="flex-1 p-4 overflow-y-auto bg-background/50">
            <h3 class="text-xs font-bold text-accent uppercase mb-2">Preview</h3>
            <div class="border border-foreground rounded-sm bg-background p-3 space-y-2">
              
              {/* Stdout Above (if layout is above) */}
              <Show when={localSettings().showStdout && localOutputLayout() === "above"}>
                <div class="font-mono text-xs text-secondary px-2">Hello!</div>
              </Show>

              {/* Code Editor Preview */}
              <div class={clsx(
                "font-mono text-xs p-2 bg-accent/5 rounded-sm",
                !localSettings().showCode && "hidden"
              )}>
                <div class="flex gap-2">
                  <span class="text-secondary/50 select-none">[1]:</span>
                  <div class="flex gap-2 flex-1">
                    <Show when={localSettings().showLineNumbers}>
                      <div class="text-secondary/30 select-none text-right" style="min-width: 1.5em;">
                        <div>1</div>
                        <div>2</div>
                      </div>
                    </Show>
                    <div>
                      <div><span class="text-[#c678dd]">print</span><span class="text-secondary">(</span><span class="text-[#98c379]">"Hello!"</span><span class="text-secondary">)</span></div>
                      <div><span class="text-[#d19a66]">42</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Dot Preview */}
              <Show when={localSettings().showStatusDot}>
                <div class="flex items-center gap-2 px-2 py-1">
                  <div class="w-2 h-2 rounded-full bg-success"></div>
                  <span class="text-[10px] text-secondary/40">14:32:05</span>
                  <span class="text-[10px] text-secondary/30 font-mono">42ms</span>
                </div>
              </Show>

              {/* Hidden message */}
              <Show when={!localSettings().showCode && !hasVisibleOutput()}>
                <div class="text-secondary/40 italic text-xs py-3 text-center">
                  Code is hidden — cell will still execute
                </div>
              </Show>

              {/* Stderr Preview */}
              <Show when={localSettings().showStderr}>
                <div class="font-mono text-xs text-primary bg-primary/10 p-1.5 rounded-sm">
                  Warning: Deprecated API
                </div>
              </Show>

              {/* Result Preview */}
              <Show when={localSettings().showResult}>
                <div class="flex gap-2 font-mono text-xs">
                  <span class="text-foreground font-bold select-none">Out:</span>
                  <span class="text-secondary/80">42</span>
                </div>
              </Show>

              {/* Stdout Below (if layout is below) */}
              <Show when={localSettings().showStdout && localOutputLayout() === "below"}>
                <div class="font-mono text-xs text-secondary px-2">Hello!</div>
              </Show>

              {/* Error Preview */}
              <Show when={localSettings().showError}>
                <div class="font-mono text-xs text-primary font-bold bg-primary/20 p-1.5 rounded-sm">
                  ValueError: Example error
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div class="relative p-4 border-t border-foreground shrink-0 flex flex-col gap-3 sm:block">
          {/* Scope Toggle - centered, only visible when a code cell is selected */}
          <Show when={activeCodeCell()}>
            <div class="order-1 flex w-full sm:w-auto sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:z-10">
              <div class="relative flex items-center justify-between w-full sm:block sm:w-auto">
                <div
                  class="relative flex items-center p-1 cursor-pointer select-none transition-colors border border-foreground hover:border-secondary/30 w-40 h-9 rounded-sm"
                  onClick={() => setApplyScope(applyScope() === "cell" ? "notebook" : "cell")}
                >
                  {/* Sliding background */}
                  <div
                    class="absolute h-[calc(100%-8px)] shadow-sm transition-all duration-300 bg-accent rounded-[calc(var(--radius-sm)-2px)] w-[calc(50%-4px)]"
                    style={{
                      left: applyScope() === "cell" ? "4px" : "calc(50% + 0px)",
                      top: "4px"
                    }}
                  />

                  {/* Text labels */}
                  <div class="relative z-10 flex w-full h-full">
                    <div
                      class={clsx(
                        "flex-1 flex items-center justify-center text-xs font-bold tracking-wide transition-colors duration-300",
                        applyScope() === "cell" ? "text-background" : "text-secondary"
                      )}
                    >
                      Cell
                    </div>
                    <div
                      class={clsx(
                        "flex-1 flex items-center justify-center text-xs font-bold tracking-wide transition-colors duration-300",
                        applyScope() === "notebook" ? "text-background" : "text-secondary"
                      )}
                    >
                      Notebook
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Show>

          {/* Save Controls */}
          <div class="order-2 flex items-center justify-between w-full">
            <div 
               class="flex items-center gap-2 cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
               onClick={() => toggle("saveToExport")}
               title="Include these view settings in exported .ipynb files"
            >
               <div class={`w-3.5 h-3.5 rounded border border-secondary flex items-center justify-center ${localSettings().saveToExport ? 'bg-secondary' : ''}`}>
                  <Show when={localSettings().saveToExport}>
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

export default CodeVisibilityDialog;
