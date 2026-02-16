// Tutorial notebook index
import { tutorialQuickstartCells } from "./tutorial-quickstart";
import { tutorialUIPart1Cells } from "./tutorial-ui-part1";
import { tutorialUIPart2Cells } from "./tutorial-ui-part2";
import { tutorialUIPart3Cells } from "./tutorial-ui-part3";
import { tutorialUICells } from "./tutorial-ui";
import { tutorialChartsCells } from "./tutorial-charts";
import { tutorialReactiveCells } from "./tutorial-reactive";
import { tutorialAPICells } from "./tutorial-api";
import type { NotebookConfig } from "../types";

// Tutorial type identifiers (matching ?open= param values)
export type TutorialType = "tutorial" | "tutorial_ui_part1" | "tutorial_ui_part2" | "tutorial_ui_part3" | "tutorial_ui" | "tutorial_charts" | "tutorial_reactive" | "tutorial_api";

export const TUTORIAL_CONFIG: Record<TutorialType, NotebookConfig> = {
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
    "tutorial_ui_part3": {
        cells: tutorialUIPart3Cells,
        filename: "Tutorial - Interactive UI Part 3.ipynb",
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
