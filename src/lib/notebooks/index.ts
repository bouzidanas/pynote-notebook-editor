// Unified built-in notebook registry
// Aggregates all notebook collections via their sub-indexes

import { TUTORIAL_CONFIG, type TutorialType } from "./tutorials";
import { NO_MAGIC_CONFIG, type NoMagicType } from "./no-magic";
import { TESTING_CONFIG, type TestingType } from "./testing";
import type { NotebookConfig } from "./types";

// Re-export shared types for external consumers
export type { NotebookConfig } from "./types";

// Unified type for all built-in notebooks
export type BuiltinNotebookType = TutorialType | NoMagicType | TestingType;

// Unified configuration record — merges all sub-index configs
const BUILTIN_NOTEBOOK_CONFIG: Record<BuiltinNotebookType, NotebookConfig> = {
    ...TUTORIAL_CONFIG,
    ...NO_MAGIC_CONFIG,
    ...TESTING_CONFIG,
};

// Check if a string is a valid built-in notebook type
export function isBuiltinNotebook(value: string | null): value is BuiltinNotebookType {
    return value !== null && value in BUILTIN_NOTEBOOK_CONFIG;
}

// Get cells, filename, and code visibility settings for a built-in notebook
export function getBuiltinNotebook(type: BuiltinNotebookType): NotebookConfig {
    return BUILTIN_NOTEBOOK_CONFIG[type];
}
