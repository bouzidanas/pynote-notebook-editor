import { type JsonObject, type JsonValue, cloneJson, isJsonObject, setOwn } from "./document";

// PyNote's own settings inside a notebook's metadata: `metadata.PyNote` for
// the notebook and `metadata.pynote` for a cell. Both are optional (files from
// other tools have neither), and reading validates every value so the rest of
// the app can trust their types. Keys this version does not know (written by
// a newer PyNote) are carried through untouched.

export type ExecutionModeName = "queue_all" | "hybrid" | "direct" | "reactive";
export const EXECUTION_MODES: readonly ExecutionModeName[] = ["queue_all", "hybrid", "direct", "reactive"];

export const NOTEBOOK_CODEVIEW_KEYS = [
  "showCode", "showStdout", "showStderr", "showResult", "showError", "showStatusDot", "showExecutionCount",
] as const;
export const CELL_CODEVIEW_KEYS = [
  "showCode", "showStdout", "showStderr", "showResult", "showError", "showStatusDot",
] as const;

export type NotebookCodeviewKey = (typeof NOTEBOOK_CODEVIEW_KEYS)[number];
export type CellCodeviewKey = (typeof CELL_CODEVIEW_KEYS)[number];

export interface PyNoteNotebookSettings {
  history: string[];
  executionMode?: ExecutionModeName;
  showTrailingAddButtons?: boolean;
  autorun?: boolean;
  autorunOnRefresh?: boolean;
  codeHiddenPlaceholder?: string;
  // Only the valid boolean keys, or undefined when none are present.
  codeview?: Partial<Record<NotebookCodeviewKey, boolean>>;
  // The theme object exactly as stored (applied through updateTheme, which
  // ignores unknown fields).
  theme?: JsonObject;
}

const pickBooleans = <K extends string>(source: unknown, keys: readonly K[]): Partial<Record<K, boolean>> | undefined => {
  if (!isJsonObject(source)) return undefined;
  const out: Partial<Record<K, boolean>> = {};
  for (const key of keys) if (typeof source[key] === "boolean") out[key] = source[key] as boolean;
  return Object.keys(out).length > 0 ? out : undefined;
};

export function readNotebookSettings(metadata: JsonObject): PyNoteNotebookSettings {
  const p = isJsonObject(metadata.PyNote) ? metadata.PyNote : {};
  const settings: PyNoteNotebookSettings = {
    history: Array.isArray(p.history) ? p.history.filter((e): e is string => typeof e === "string") : [],
  };
  if (EXECUTION_MODES.includes(p.executionMode as ExecutionModeName)) settings.executionMode = p.executionMode as ExecutionModeName;
  if (typeof p.showTrailingAddButtons === "boolean") settings.showTrailingAddButtons = p.showTrailingAddButtons;
  if (typeof p.autorun === "boolean") settings.autorun = p.autorun;
  if (typeof p.autorunOnRefresh === "boolean") settings.autorunOnRefresh = p.autorunOnRefresh;
  if (typeof p.codeHiddenPlaceholder === "string") settings.codeHiddenPlaceholder = p.codeHiddenPlaceholder;
  const codeview = pickBooleans(p.codeview, NOTEBOOK_CODEVIEW_KEYS);
  if (codeview) settings.codeview = codeview;
  if (isJsonObject(p.theme)) settings.theme = cloneJson(p.theme);
  return settings;
}

export interface PyNoteCellSettings {
  codeview?: Partial<Record<CellCodeviewKey, boolean>>;
  autorun?: boolean;
  autorunOnRefresh?: boolean;
  placeholder?: string;
}

/**
 * A cell's metadata with its `pynote` entry validated: known PyNote keys with
 * the wrong type are dropped (and reported), unknown keys and every other
 * tool's metadata are kept as they are.
 */
export function sanitizeCellMetadata(metadata: JsonObject): { metadata: JsonObject; dropped: string[] } {
  const out = cloneJson(metadata);
  const dropped: string[] = [];
  if (out.pynote === undefined) return { metadata: out, dropped };
  if (!isJsonObject(out.pynote)) {
    delete out.pynote;
    dropped.push("pynote");
    return { metadata: out, dropped };
  }
  const py: JsonObject = out.pynote;
  if ("codeview" in py) {
    const codeview = pickBooleans(py.codeview, CELL_CODEVIEW_KEYS);
    if (codeview) py.codeview = codeview as JsonObject;
    else { delete py.codeview; dropped.push("pynote.codeview"); }
  }
  for (const key of ["autorun", "autorunOnRefresh"] as const) {
    if (key in py && typeof py[key] !== "boolean") { delete py[key]; dropped.push(`pynote.${key}`); }
  }
  if ("placeholder" in py && typeof py.placeholder !== "string") { delete py.placeholder; dropped.push("pynote.placeholder"); }
  if (Object.keys(py).length === 0) delete out.pynote;
  return { metadata: out, dropped };
}

// --- Writing metadata.PyNote ------------------------------------------------

// Keys PyNote rewrites from app state on every save. Everything else found in
// the loaded `metadata.PyNote` (keys from newer PyNote versions) is carried
// through unchanged.
const MANAGED_NOTEBOOK_KEYS = ["history", "executionMode", "autorun", "autorunOnRefresh", "codeHiddenPlaceholder", "codeview", "theme"];

// Strip "no-op" empty-string overrides before writing a theme to notebook
// metadata. A "" is only dropped when the theme default for that field is
// also "" (reload fills missing keys from defaults, so the value round-trips).
// Nested objects that prune down to empty are dropped too.
export const pruneEmptyThemeOverrides = (value: any, def: any): any => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const dv = def ? def[k] : undefined;
      if (v === "" && dv === "") continue;
      const pv = pruneEmptyThemeOverrides(v, dv);
      if (pv && typeof pv === "object" && !Array.isArray(pv) && Object.keys(pv).length === 0) continue;
      setOwn(out, k, pv);
    }
    return out;
  }
  return value;
};

export interface NotebookSettingsInputs {
  history: string[];
  executionMode: ExecutionModeName;
  notebookAutorun?: boolean;
  notebookAutorunOnRefresh?: boolean;
  codeHiddenPlaceholder?: string;
  // Live code visibility settings (the Code dialog).
  codeVisibility: Record<NotebookCodeviewKey, boolean> & { saveToExport: boolean };
  // Live theme (the Theme dialog); `outputLayout` is set from the Code dialog.
  theme: { saveToExport: boolean; outputLayout: string; [key: string]: unknown };
  defaultTheme: object;
  // The `metadata.PyNote` object the notebook was loaded with, or null.
  loaded: JsonObject | null;
}

/**
 * Build `metadata.PyNote` for a save. Theme and code visibility follow the
 * "save settings to .ipynb" checkboxes: when a checkbox is on, the current
 * settings are written; when it is off, whatever the file was loaded with is
 * written back unchanged, so browsing with different view settings never
 * overwrites a notebook's embedded look.
 */
export function buildNotebookSettings(inputs: NotebookSettingsInputs): JsonObject {
  const { codeVisibility, theme, loaded } = inputs;
  const loadedTheme = loaded && isJsonObject(loaded.theme) ? loaded.theme : null;
  const loadedCodeview = loaded && isJsonObject(loaded.codeview) ? loaded.codeview : null;

  // Carried-through keys are defined as own properties: a key named
  // "__proto__" in a file must stay data, not become this object's prototype.
  const out: JsonObject = Object.fromEntries(
    loaded ? Object.entries(loaded).filter(([key]) => !MANAGED_NOTEBOOK_KEYS.includes(key)).map(([key, value]) => [key, cloneJson(value)]) : [],
  );
  out.history = [...inputs.history];
  out.executionMode = inputs.executionMode;
  if (inputs.notebookAutorun !== undefined) out.autorun = inputs.notebookAutorun;
  if (inputs.notebookAutorunOnRefresh !== undefined) out.autorunOnRefresh = inputs.notebookAutorunOnRefresh;
  if (inputs.codeHiddenPlaceholder !== undefined) out.codeHiddenPlaceholder = inputs.codeHiddenPlaceholder;

  if (codeVisibility.saveToExport) {
    const codeview: JsonObject = {};
    for (const key of NOTEBOOK_CODEVIEW_KEYS) codeview[key] = codeVisibility[key];
    out.codeview = codeview;
  } else if (loadedCodeview) {
    out.codeview = cloneJson(loadedCodeview);
  }

  if (theme.saveToExport) {
    const { saveToExport: _omit, ...themeToExport } = theme;
    out.theme = pruneEmptyThemeOverrides(themeToExport, inputs.defaultTheme) as JsonValue;
  } else if (loadedTheme) {
    // The above/below output toggle lives in the Code dialog but is stored on
    // the theme, so when that dialog's save-to-export is on, the current
    // toggle wins over the written-back value.
    out.theme = codeVisibility.saveToExport
      ? { ...cloneJson(loadedTheme), outputLayout: theme.outputLayout }
      : cloneJson(loadedTheme);
  } else if (codeVisibility.saveToExport) {
    // No theme in the document: persist just the output toggle.
    out.theme = { outputLayout: theme.outputLayout };
  }
  return out;
}
