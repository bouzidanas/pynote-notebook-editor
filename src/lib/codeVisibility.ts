import { createStore } from "solid-js/store";

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

// Update a single setting
export const updateVisibility = <K extends keyof CodeVisibilitySettings>(
    key: K,
    value: CodeVisibilitySettings[K]
) => {
    setSettings(key, value);
};

// Update all settings at once
export const setVisibilitySettings = (newSettings: Partial<CodeVisibilitySettings>) => {
    Object.entries(newSettings).forEach(([key, value]) => {
        setSettings(key as keyof CodeVisibilitySettings, value as any);
    });
};

// Save settings to localStorage
export const saveVisibilitySettings = () => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        // Clear overrides when saving new settings
        clearAllOverrides();
    } catch (e) {
        console.warn("Failed to save code visibility settings:", e);
    }
};

// Reset to defaults
export const resetVisibilitySettings = () => {
    setSettings(defaultSettings);
    saveVisibilitySettings();
};

// Get effective visibility for a cell (considering override)
export const getEffectiveVisibility = (cellId: string): CodeVisibilitySettings => {
    if (isCellShowingAll(cellId)) {
        return defaultSettings; // Show all
    }
    return settings;
};
