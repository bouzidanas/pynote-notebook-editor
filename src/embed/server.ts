/// <reference path="./virtual.d.ts" />
import { configure } from "./bridge";
import type { CellHandle, CellOptions } from "./types";

// What `import "pynote"` resolves to outside the browser (server rendering,
// Node): configure() can be called but does nothing for the page (settings
// set on the server never reach the browser), and cells do not mount.

export const version: string = typeof __PYNOTE_VERSION__ === "string" ? __PYNOTE_VERSION__ : "dev";
export const runtime = undefined;

export function mountCell(_host: unknown, _options: CellOptions): CellHandle {
  throw new Error("pynote: cells run in the browser. Mount them from client code (an effect, onMount or a client-only component).");
}

export { configure };
export type { CellHandle, CellOptions, CodeVisibility, ExecutionMode, PyNoteConfig } from "./types";
