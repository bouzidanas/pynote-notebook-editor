// Testing notebook index
import { testingGroundCells } from "./testing-ground";
import type { NotebookConfig } from "../types";

// Testing type identifiers (matching ?open= param values)
export type TestingType = "testing";

export const TESTING_CONFIG: Record<TestingType, NotebookConfig> = {
    "testing": {
        cells: testingGroundCells,
        filename: "Testing Ground.ipynb",
        codeview: {
            showResult: false
        }
    }
};
