import type { TextOptions } from "../../lib/export/text-exports";
import type { WebAppOptions } from "../../lib/export/web-app-export";
import { type ComponentOptions, type ExecutionMode, DEFAULT_PYODIDE_FOLDER, FRAMEWORKS } from "../../lib/export/component-export";
import { FORMATS, type FormatId } from "./formats";

// The Export dialog's last choices, kept in browser storage as a convenience
// for the next export. What comes back is checked value by value: storage may
// hold an older version's shape, or anything at all.

export interface Preferences {
  format: FormatId;
  text: TextOptions;
  webapp: WebAppOptions;
  /** Without the execution mode: that one always starts as the notebook's. */
  component: Omit<ComponentOptions, "executionMode">;
}

export const PREFERENCES_KEY = "pynote-export-preferences";

export const DEFAULT_PREFERENCES: Preferences = {
  // .ipynb, the default file format, until the user picks another.
  format: "ipynb",
  text: { ipynbClean: false, pythonMarkdown: true, markdownCode: true },
  webapp: { mode: "interactive", startInPresentation: false, staticHtml: false, python: "embedded", layout: "single" },
  component: {
    framework: "astro",
    editable: true,
    menu: true,
    autorun: false,
    lockExecutionMode: false,
    theme: "notebook",
    view: "notebook",
    python: "cdn",
    pyodideUrl: DEFAULT_PYODIDE_FOLDER,
  },
};

type Choices<T> = { [K in keyof T]?: readonly T[K][] };

// Each stored value that has the default's type (and is one of its choices,
// for a choice); the default for anything else.
function merge<T extends object>(defaults: T, stored: unknown, choices: Choices<T> = {}): T {
  const out = { ...defaults };
  if (!stored || typeof stored !== "object") return out;
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = (stored as Record<keyof T, unknown>)[key];
    if (typeof value !== typeof defaults[key]) continue;
    const allowed = choices[key];
    if (allowed && !allowed.includes(value as T[keyof T])) continue;
    out[key] = value as T[keyof T];
  }
  return out;
}

/** The preferences in `raw` (the stored text), or the defaults. */
export function parsePreferences(raw: string | null): Preferences {
  let stored: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (parsed && typeof parsed === "object") stored = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: the defaults apply.
  }
  if (!stored) return DEFAULT_PREFERENCES;
  const defaults = DEFAULT_PREFERENCES;
  return {
    format: FORMATS.some((f) => f.id === stored.format) ? (stored.format as FormatId) : defaults.format,
    text: merge(defaults.text, stored.text),
    webapp: merge(defaults.webapp, stored.webapp, {
      mode: ["interactive", "readonly"],
      python: ["embedded", "cdn"],
      layout: ["single", "folder"],
    }),
    component: merge(defaults.component, stored.component, {
      framework: FRAMEWORKS.map((f) => f.id),
      theme: ["notebook", "default"],
      view: ["notebook", "default"],
      python: ["cdn", "site"],
    }),
  };
}

export function loadPreferences(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(PREFERENCES_KEY));
  } catch {
    return DEFAULT_PREFERENCES; // storage blocked
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Private browsing or storage disabled: the defaults apply next time.
  }
}

/** The component options for a notebook: the stored ones, with its execution mode. */
export const componentOptionsFor = (preferences: Preferences, executionMode: ExecutionMode): ComponentOptions => ({
  ...preferences.component,
  executionMode,
});

/** The component options as stored: the execution mode is the notebook's, not a preference. */
export function storedComponent(options: ComponentOptions): Preferences["component"] {
  const stored: Partial<ComponentOptions> = { ...options };
  delete stored.executionMode;
  return stored as Preferences["component"];
}
