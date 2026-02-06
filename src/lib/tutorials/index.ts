// Tutorial index - exports all tutorial content
export { tutorialQuickstartCells, tableOfContentsCells } from "./tutorial-quickstart";
export { tutorialUIPart1Cells } from "./tutorial-ui-part1";
export { tutorialUIPart2Cells } from "./tutorial-ui-part2";
export { tutorialUICells } from "./tutorial-ui";
export { tutorialChartsCells } from "./tutorial-charts";
export { tutorialReactiveCells } from "./tutorial-reactive";
export { tutorialAPICells } from "./tutorial-api";

import { tutorialQuickstartCells } from "./tutorial-quickstart";
import { tutorialUIPart1Cells } from "./tutorial-ui-part1";
import { tutorialUIPart2Cells } from "./tutorial-ui-part2";
import { tutorialUICells } from "./tutorial-ui";
import { tutorialChartsCells } from "./tutorial-charts";
import { tutorialReactiveCells } from "./tutorial-reactive";
import { tutorialAPICells } from "./tutorial-api";
import type { CellData } from "../store";
import type { CodeVisibilitySettings } from "../codeVisibility";

// Tutorial type mapping
export type TutorialType = "tutorial" | "tutorial_ui_part1" | "tutorial_ui_part2" | "tutorial_ui" | "tutorial_charts" | "tutorial_reactive" | "tutorial_api";

// Document-level code visibility settings for tutorials
// These hide result output by default so users run the cells themselves
type TutorialCodeView = Partial<Omit<CodeVisibilitySettings, "saveToExport">>;

interface TutorialConfig {
    cells: CellData[];
    filename: string;
    codeview?: TutorialCodeView;
}

export const TUTORIAL_CONFIG: Record<TutorialType, TutorialConfig> = {
    "tutorial": {
        cells: tutorialQuickstartCells,
        filename: "Tutorial - Quick Start.ipynb",
        // Hide result output so users learn by running cells
        codeview: {
            showResult: false
        }
    },
    "tutorial_ui_part1": {
        cells: tutorialUIPart1Cells,
        filename: "Tutorial - Interactive UI Part 1.ipynb",
        codeview: {
            showResult: false
        }
    },
    "tutorial_ui_part2": {
        cells: tutorialUIPart2Cells,
        filename: "Tutorial - Interactive UI Part 2.ipynb",
        codeview: {
            showResult: false
        }
    },
    "tutorial_ui": {
        cells: tutorialUICells,
        filename: "Tutorial - Interactive UI.ipynb",
        codeview: {
            showResult: false
        }
    },
    "tutorial_charts": {
        cells: tutorialChartsCells,
        filename: "Tutorial - Charts & Plotting.ipynb",
        codeview: {
            showResult: false
        }
    },
    "tutorial_reactive": {
        cells: tutorialReactiveCells,
        filename: "Tutorial - Reactive Execution.ipynb",
        codeview: {
            showResult: false
        }
    },
    "tutorial_api": {
        cells: tutorialAPICells,
        filename: "Tutorial - API Reference.ipynb"
        // API reference doesn't need hidden results - it's documentation
    }
};

// Helper to check if a string is a valid tutorial type
export function isTutorialType(value: string | null): value is TutorialType {
    return value !== null && value in TUTORIAL_CONFIG;
}

// Get tutorial cells and filename for a given type
export function getTutorialContent(type: TutorialType): TutorialConfig {
    return TUTORIAL_CONFIG[type];
}
