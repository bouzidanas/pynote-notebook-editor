import type { NotebookDocument } from "./formats/document";
import type { Theme } from "./theme";
import type { CodeVisibilitySettings } from "./codeVisibility";

// Where the notebook UI is running. The PyNote app is one host; a notebook
// exported as a standalone web app is another: the same UI, showing only the
// notebook it was exported with. Entry points set the profile before any
// store module loads (stores read it to choose their initial state), and the
// UI reads it to decide which file actions exist.

export interface EmbeddedNotebook {
  // Identifies this export; its local edits are kept under this id.
  exportId: string;
  filename: string;
  document: NotebookDocument;
  // The theme and view settings the notebook was exported with, so it looks
  // exactly as it did in PyNote.
  theme: Partial<Theme>;
  codeVisibility: Partial<CodeVisibilitySettings>;
  // "readonly": rendered content and saved outputs, no kernel, no editing.
  mode: "interactive" | "readonly";
  startInPresentation: boolean;
  // Read-only exports: each code cell's outputs as they were when exported.
  outputs?: Record<string, CellOutputs>;
}

export type CellOutputs = NonNullable<import("./store").CellData["outputs"]>;

export interface HostProfile {
  // app: PyNote itself. standalone: a notebook exported as a web app.
  // component: cells embedded in another site by the pynote package.
  kind: "app" | "standalone" | "component";
  // File actions offered in the Options menu and by shortcuts.
  newNotebook: boolean;
  openFiles: boolean;
  exportDialog: boolean;
  // Whether app-wide preferences (theme "App" scope, default code visibility)
  // can be read and saved. A standalone export uses its embedded settings.
  appWideSettings: boolean;
  // A read-only export: the notebook stays exactly as exported. Nothing
  // edits, adds, deletes, moves or runs its cells, clears their outputs or
  // walks the undo history, and there is no kernel to start or stop.
  readOnly: boolean;
  embedded?: EmbeddedNotebook;
}

const APP_PROFILE: HostProfile = {
  kind: "app",
  newNotebook: true,
  openFiles: true,
  exportDialog: true,
  appWideSettings: true,
  readOnly: false,
};

let profile: HostProfile = APP_PROFILE;

export const host = (): HostProfile => profile;

/** Set by an entry point before the UI modules load. */
export const setHostProfile = (next: HostProfile): void => {
  profile = next;
};

export const standaloneProfile = (embedded: EmbeddedNotebook): HostProfile => ({
  kind: "standalone",
  newNotebook: false,
  openFiles: false,
  exportDialog: false,
  appWideSettings: false,
  readOnly: embedded.mode === "readonly",
  embedded,
});

// Cells embedded in another site (the pynote package): no notebook files and
// no app-wide settings; the page configures the look through the package.
export const componentProfile = (): HostProfile => ({
  kind: "component",
  newNotebook: false,
  openFiles: false,
  exportDialog: false,
  appWideSettings: false,
  readOnly: false,
});
