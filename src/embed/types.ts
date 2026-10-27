// The public types of the pynote package (cells embedded in other sites).
// Kept free of app imports: adapters and the server stub use them too.

export type ExecutionMode = "queue_all" | "hybrid" | "direct" | "reactive";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** View settings: which parts of a code cell show. */
export interface CodeVisibility {
  showCode: boolean;
  showStdout: boolean;
  showStderr: boolean;
  showResult: boolean;
  showError: boolean;
  showStatusDot: boolean;
  showExecutionCount: boolean;
  showLineNumbers: boolean;
  lineWrap: boolean;
}

/**
 * The notebook every cell on the page belongs to. Set it once (configure(),
 * <PyNoteConfig>, or a pynote.config.json from PyNote's Export dialog); later
 * calls change only what they name.
 */
export interface PyNoteConfig {
  /**
   * How cells run (PyNote's execution modes). Default: "hybrid". Any string
   * type-checks, since TypeScript types the values of an imported
   * pynote.config.json as plain strings; one that is not a mode is ignored,
   * with a warning.
   */
  executionMode?: ExecutionMode | (string & {});
  /** Readers cannot change the execution mode from the cell menu. */
  lockExecutionMode?: boolean;
  /** Default for cells: readers can edit the code (false: read-only code, cells still run). */
  editable?: boolean;
  /** Default for cells: show the cell menu (run, Python, view settings). */
  menu?: boolean;
  /** Default for cells: run when the page loads. */
  autorun?: boolean;
  /** PyNote's theme, as differences from the default theme (the Export dialog writes this). */
  theme?: DeepPartial<Record<string, unknown>> & Record<string, unknown>;
  /** View settings for every cell. */
  codeVisibility?: Partial<CodeVisibility>;
  /** The folder Pyodide is loaded from: a URL, or a path resolved against the page (such as "/pyodide/"). Default: jsDelivr. */
  pyodideUrl?: string;
}

/** One code cell. Cells on a page share one Python runtime, in page order. */
export interface CellOptions {
  /** The cell's code. */
  code: string;
  /** A stable id (letters, digits, "-" or "_"); one is generated otherwise. */
  id?: string;
  editable?: boolean;
  menu?: boolean;
  autorun?: boolean;
  showCode?: boolean;
  showStdout?: boolean;
  showStderr?: boolean;
  showResult?: boolean;
  showError?: boolean;
  showStatusDot?: boolean;
  /**
   * An eye button next to the run button, as in PyNote's cell toolbar: while
   * the cell hides something, readers can show all of it, and hide it again.
   * Default: false.
   */
  visibilityToggle?: boolean;
}

export interface CellHandle {
  /**
   * Change the options it names; one set to undefined goes back to its default
   * (the config's). A new `code` replaces what is in the editor (undefined
   * keeps it), and the id stays the one the cell was mounted with.
   */
  update(options: Partial<CellOptions>): void;
  /** Remove the cell (its variables go too in reactive mode). */
  destroy(): void;
}

export interface PyNoteRuntime {
  readonly version: string;
  configure(config: PyNoteConfig): void;
  mountCell(host: HTMLElement, options: CellOptions): CellHandle;
}
