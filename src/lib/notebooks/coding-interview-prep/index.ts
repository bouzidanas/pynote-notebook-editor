import { codingPrepLandingCells } from "./landing";
import { codingPrepSection1Cells } from "./section1";
import { codingPrepSection2Cells } from "./section2";
import { codingPrepSection3Cells } from "./section3";
import { codingPrepSection4Cells } from "./section4";
import { codingPrepSection5Cells } from "./section5";
import type { NotebookConfig } from "../types";

// Coding Interview Prep notebook type identifiers
export type CodingPrepType =
    | "coding-prep"
    | "coding-prep-1"
    | "coding-prep-2"
    | "coding-prep-3"
    | "coding-prep-4"
    | "coding-prep-5";

export const CODING_PREP_CONFIG: Record<CodingPrepType, NotebookConfig> = {
    "coding-prep": {
        cells: codingPrepLandingCells,
        filename: "Python Interview Prep - Table of Contents.ipynb",
        showTrailingAddButtons: false,
    },
    "coding-prep-1": {
        cells: codingPrepSection1Cells,
        filename: "Python Interview Prep - Section 1.ipynb",
        showTrailingAddButtons: false,
        autorun: false,
        executionMode: "queue_all",
        codeHiddenPlaceholder: "Code is hidden — toggle the visibility icon to view",
    },
    "coding-prep-2": {
        cells: codingPrepSection2Cells,
        filename: "Python Interview Prep - Section 2.ipynb",
        showTrailingAddButtons: false,
        autorun: false,
        executionMode: "queue_all",
        codeHiddenPlaceholder: "Code is hidden — toggle the visibility icon to view",
    },
    "coding-prep-3": {
        cells: codingPrepSection3Cells,
        filename: "Python Interview Prep - Section 3.ipynb",
        showTrailingAddButtons: false,
        autorun: false,
        executionMode: "queue_all",
        codeHiddenPlaceholder: "Code is hidden — toggle the visibility icon to view",
    },
    "coding-prep-4": {
        cells: codingPrepSection4Cells,
        filename: "Python Interview Prep - Section 4.ipynb",
        showTrailingAddButtons: false,
        autorun: false,
        executionMode: "queue_all",
        codeHiddenPlaceholder: "Code is hidden — toggle the visibility icon to view",
    },
    "coding-prep-5": {
        cells: codingPrepSection5Cells,
        filename: "Python Interview Prep - Section 5.ipynb",
        showTrailingAddButtons: false,
        autorun: false,
        executionMode: "queue_all",
        codeHiddenPlaceholder: "Code is hidden — toggle the visibility icon to view",
    },
};
