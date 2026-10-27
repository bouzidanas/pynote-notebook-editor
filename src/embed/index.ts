/// <reference path="./virtual.d.ts" />
// The pynote package in the browser: PyNote cells embedded in other sites.
// profile must be the first import: ES modules run in import order, and the
// stores the runtime imports read the host profile when they load.
import "./profile";
import { claimRuntime, configure } from "./bridge";
import { createRuntime } from "./runtime";
import type { CellHandle, CellOptions } from "./types";

export const version: string = typeof __PYNOTE_VERSION__ === "string" ? __PYNOTE_VERSION__ : "dev";

/** The page's runtime (the first copy of the package on the page creates it). */
export const runtime = claimRuntime(() => createRuntime(version));

/** Render a cell into `host` (its shadow root). Cells share one notebook, in page order. */
export const mountCell = (host: HTMLElement, options: CellOptions): CellHandle => runtime.mountCell(host, options);

export { configure };
export type { CellHandle, CellOptions, CodeVisibility, ExecutionMode, PyNoteConfig } from "./types";
