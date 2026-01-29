// DEPRECATED: This file is kept for backward compatibility only.
// Tutorial content has been split into separate files under ./tutorials/
//
// New tutorial files:
// - tutorials/tutorial-quickstart.ts  (Quick Start - basics)
// - tutorials/tutorial-ui.ts          (Interactive UI)
// - tutorials/tutorial-charts.ts      (Charts & Plotting)
// - tutorials/tutorial-api.ts         (API Reference)
//
// For new code, use imports from "./tutorials" instead:
// import { getTutorialContent, isTutorialType, type TutorialType } from "./tutorials";

// Re-export from new location for backward compatibility
export { tutorialQuickstartCells as tutorialCells } from "./tutorials";
