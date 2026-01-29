import { createStore } from "solid-js/store";
import type { CellCodeVisibility } from "./store";

export interface CodeVisibilitySettings {
    showCode: boolean;
    showStdout: boolean;
    showStderr: boolean;
    showResult: boolean;
    showError: boolean;
    showStatusDot: boolean;
    saveToExport: boolean;
}

const STORAGE_KEY = "pynote-code-visibility";

// Default: show everything
const defaultSettings: CodeVisibilitySettings = {
    showCode: true,
    showStdout: true,
    showStderr: true,
    showResult: true,
    showError: true,
    showStatusDot: true,
    saveToExport: false,
};

// Load from localStorage
const loadSettings = (): CodeVisibilitySettings => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return { ...defaultSettings, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.warn("Failed to load code visibility settings:", e);
    }
    return defaultSettings;
};

// Create reactive store
const [settings, setSettings] = createStore<CodeVisibilitySettings>(loadSettings());

// Track if user has manually changed settings in this session
// When true, cell metadata overrides are ignored (user's choice takes precedence)
let userHasOverriddenSettings = false;

// Track if any setting is hidden (for showing toggle button)
export const hasHiddenElements = () => {
    return !settings.showCode || !settings.showStdout || !settings.showStderr ||
        !settings.showResult || !settings.showError || !settings.showStatusDot;
};

// Per-cell override: when true, show all regardless of settings
// Using createStore for proper fine-grained reactivity
const [cellOverrides, setCellOverrides] = createStore<Record<string, boolean>>({});

// Check if a cell is in "show all" mode
export const isCellShowingAll = (cellId: string): boolean => {
    return cellOverrides[cellId] === true;
};

// Toggle a cell's "show all" mode
export const toggleCellShowAll = (cellId: string) => {
    setCellOverrides(cellId, !cellOverrides[cellId]);
};

// Clear all overrides (when settings change)
export const clearAllOverrides = () => {
    // Reset all overrides to false
    Object.keys(cellOverrides).forEach(key => {
        setCellOverrides(key, false);
    });
};

// Export the reactive store
export const codeVisibility = settings;

// Update a single setting (user-initiated change)
export const updateVisibility = <K extends keyof CodeVisibilitySettings>(
    key: K,
    value: CodeVisibilitySettings[K]
) => {
    userHasOverriddenSettings = true;
    setSettings(key, value);
};

// Update all settings at once
// isUserChange: true = user manually changed settings, false = document/tutorial load
export const setVisibilitySettings = (
    newSettings: Partial<CodeVisibilitySettings>,
    isUserChange: boolean = false
) => {
    if (isUserChange) {
        userHasOverriddenSettings = true;
    }
    Object.entries(newSettings).forEach(([key, value]) => {
        setSettings(key as keyof CodeVisibilitySettings, value as any);
    });
};

// Reset the user override flag (called when loading a new document)
export const resetUserOverride = () => {
    userHasOverriddenSettings = false;
};

// Save settings to localStorage (user-initiated)
export const saveVisibilitySettings = () => {
    try {
        userHasOverriddenSettings = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        // Clear overrides when saving new settings
        clearAllOverrides();
    } catch (e) {
        console.warn("Failed to save code visibility settings:", e);
    }
};

// Reset to defaults (user-initiated)
export const resetVisibilitySettings = () => {
    userHasOverriddenSettings = true;
    setSettings(defaultSettings);
    saveVisibilitySettings();
};

/**
 * Get effective visibility for a cell.
 * Priority (highest to lowest):
 * 1. Cell "show all" toggle (via sidebar button) - shows everything
 * 2. User has manually changed settings - global settings apply to all cells
 * 3. Cell metadata overrides (from cell.metadata.pynote.codeview) - only on initial load
 * 4. Document/app-level settings (from codeVisibility store)
 * 
 * Cell metadata only applies if user hasn't manually changed settings.
 */
export const getEffectiveVisibility = (
    cellId: string,
    cellMetadata?: CellCodeVisibility
): CodeVisibilitySettings => {
    // Priority 1: Show all toggle wins
    if (isCellShowingAll(cellId)) {
        return defaultSettings; // Show all
    }

    // Priority 2: If user has manually changed settings, ignore cell metadata
    if (userHasOverriddenSettings) {
        return settings;
    }

    // Priority 3 & 4: Merge cell metadata with global settings
    // Cell metadata overrides global when defined (only if user hasn't overridden)
    if (cellMetadata) {
        return {
            showCode: cellMetadata.showCode ?? settings.showCode,
            showStdout: cellMetadata.showStdout ?? settings.showStdout,
            showStderr: cellMetadata.showStderr ?? settings.showStderr,
            showResult: cellMetadata.showResult ?? settings.showResult,
            showError: cellMetadata.showError ?? settings.showError,
            showStatusDot: cellMetadata.showStatusDot ?? settings.showStatusDot,
            saveToExport: settings.saveToExport, // This is app-level only
        };
    }

    return settings;
};
