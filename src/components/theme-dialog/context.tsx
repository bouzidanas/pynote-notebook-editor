import { createContext, useContext, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { currentTheme, updateTheme } from "../../lib/theme";
import { SECTION_DEFAULTS, SECTIONS_STORAGE_KEY, loadSectionState } from "./constants";

export interface ThemeDialogProps {
  onClose: () => void;
  onSave: (applyToSession: boolean) => void;
  initialScope?: "app-wide" | "session-only";
}

// All dialog state and actions. The factory runs once per mounted dialog
// (called from ThemeDialog's body), so the originalTheme snapshot is taken on
// open and discarded on close, same as when it was inline.
export const createThemeDialogState = (props: ThemeDialogProps) => {
  // Store original theme to restore on cancel
  const originalTheme = {
    font: currentTheme.font,
    fontWeight: currentTheme.fontWeight,
    colors: { ...currentTheme.colors },
    syntaxScheme: currentTheme.syntaxScheme,
    syntax: { ...currentTheme.syntax },
    radii: { ...currentTheme.radii },
    spacing: { ...currentTheme.spacing },
    typography: { ...currentTheme.typography },
    codeTypography: { ...currentTheme.codeTypography },
    editor: { ...currentTheme.editor },
    uiTypography: { ...currentTheme.uiTypography },
    uiBorder: { ...currentTheme.uiBorder },
    mdBorder: { ...currentTheme.mdBorder },
    mdShadow: currentTheme.mdShadow,
    cellBorder: { ...currentTheme.cellBorder },
    cellShadow: { ...currentTheme.cellShadow },
    codeBlock: { ...currentTheme.codeBlock },
    sectionScoping: currentTheme.sectionScoping,
    tableOverflow: currentTheme.tableOverflow,
    outputLayout: currentTheme.outputLayout,
    pageWidth: currentTheme.pageWidth,
    saveToExport: currentTheme.saveToExport,
  };

  const [saveToExport, setSaveToExport] = createSignal(currentTheme.saveToExport);
  const [openPickerId, setOpenPickerId] = createSignal<string | null>(null);
  const [sectionOpen, setSectionOpen] = createStore<Record<string, boolean>>(loadSectionState());
  const [previewCellState, setPreviewCellState] = createSignal<"default" | "hover" | "select" | "edit">("select");
  const [applyScope, setApplyScope] = createSignal<"app-wide" | "session-only">(props.initialScope || "session-only");

  const persistSections = () => {
    try {
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify({ ...sectionOpen }));
    } catch (e) {
      console.warn("Failed to save theme section state:", e);
    }
  };

  const toggleSection = (id: string) => {
    setSectionOpen(id, (v) => !v);
    persistSections();
  };

  const resetSections = () => {
    setSectionOpen({ ...SECTION_DEFAULTS });
    persistSections();
  };

  // Border/shadow the preview cell should show for the currently selected state.
  // Uses the custom override when set, otherwise mirrors the built-in cell styling.
  const previewBorder = (): string => {
    const cb = currentTheme.cellBorder;
    const accent = currentTheme.colors.accent;
    const secondary = currentTheme.colors.secondary;
    switch (previewCellState()) {
      case "edit": return cb.edit || `2px solid ${accent}`;
      case "select": return cb.select || `2px solid color-mix(in srgb, ${accent} 60%, transparent)`;
      case "hover": return cb.hover || `2px solid color-mix(in srgb, ${secondary} 10%, transparent)`;
      default: return cb.default || "2px solid transparent";
    }
  };
  const previewShadow = (): string => {
    const cs = currentTheme.cellShadow;
    const accent = currentTheme.colors.accent;
    switch (previewCellState()) {
      case "edit": return cs.edit || `0 0 5px ${accent}`;
      case "select": return cs.select || "none";
      case "hover": return cs.hover || "none";
      default: return cs.default || "none";
    }
  };

  const handleSave = () => {
    updateTheme({ saveToExport: saveToExport() });
    props.onSave(applyScope() === "session-only");
    props.onClose();
  };

  const handleCancel = () => {
    updateTheme(originalTheme);
    props.onClose();
  };

  const toggleSaveToExport = () => {
    setSaveToExport(prev => !prev);
  };

  return {
    originalTheme,
    saveToExport,
    toggleSaveToExport,
    openPickerId,
    setOpenPickerId,
    sectionOpen,
    toggleSection,
    resetSections,
    previewCellState,
    setPreviewCellState,
    previewBorder,
    previewShadow,
    applyScope,
    setApplyScope,
    handleSave,
    handleCancel,
  };
};

export type ThemeDialogContextValue = ReturnType<typeof createThemeDialogState>;

export const ThemeDialogContext = createContext<ThemeDialogContextValue>();

export const useThemeDialog = (): ThemeDialogContextValue => {
  const ctx = useContext(ThemeDialogContext);
  if (!ctx) throw new Error("useThemeDialog must be used inside ThemeDialog");
  return ctx;
};
