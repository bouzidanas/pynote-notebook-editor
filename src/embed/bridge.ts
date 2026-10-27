import type { CellHandle, CellOptions, PyNoteConfig, PyNoteRuntime } from "./types";

// The one PyNote runtime of a page, shared through a global slot by every
// copy of the package the page loads (React and Solid islands, custom
// elements, separately built bundles): all cells are one notebook. Nothing
// here touches the DOM, so adapters can import it during server rendering.

const RUNTIME = Symbol.for("pynote.runtime");
const PENDING = Symbol.for("pynote.config");

type Slot = typeof globalThis & { [RUNTIME]?: PyNoteRuntime; [PENDING]?: PyNoteConfig };
const slot = globalThis as Slot;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `next` over `base`; nested objects (the theme) merge key by key. */
export function mergeConfig(base: PyNoteConfig | undefined, next: PyNoteConfig): PyNoteConfig {
  const deep = (a: unknown, b: unknown): unknown => {
    if (!isPlainObject(a) || !isPlainObject(b)) return b === undefined ? a : b;
    const out: Record<string, unknown> = { ...a };
    for (const [key, value] of Object.entries(b)) out[key] = deep(a[key], value);
    return out;
  };
  return deep(base ?? {}, next) as PyNoteConfig;
}

export const pageRuntime = (): PyNoteRuntime | undefined => slot[RUNTIME];

// Every cell option, so that adapters can name them all: an option a page no
// longer sets (a removed prop or attribute) then reads as undefined, which
// takes it back to its default, instead of keeping its last value.
const CELL_OPTIONS: Record<keyof CellOptions, true> = {
  code: true,
  id: true,
  editable: true,
  menu: true,
  autorun: true,
  showCode: true,
  showStdout: true,
  showStderr: true,
  showResult: true,
  showError: true,
  showStatusDot: true,
  visibilityToggle: true,
};

/** The cell options in `props`, each one named (undefined when not set). */
export const allCellOptions = (props: Partial<CellOptions>): CellOptions =>
  Object.fromEntries(Object.keys(CELL_OPTIONS).map((key) => [key, props[key as keyof CellOptions]])) as unknown as CellOptions;

/** Make `runtime` the page's runtime unless one is already there; returns the page's runtime. */
export function claimRuntime(runtime: () => PyNoteRuntime): PyNoteRuntime {
  if (!slot[RUNTIME]) {
    const created = runtime();
    slot[RUNTIME] = created;
    const pending = slot[PENDING];
    delete slot[PENDING];
    if (pending) created.configure(pending);
  }
  return slot[RUNTIME]!;
}

/**
 * Configure the notebook all cells on the page share. In the browser it can
 * run before any cell exists: the settings wait for the runtime. On the
 * server it is harmless but does nothing for the page.
 */
export function configure(config: PyNoteConfig): void {
  const runtime = slot[RUNTIME];
  if (runtime) runtime.configure(config);
  else slot[PENDING] = mergeConfig(slot[PENDING], config);
}

/** Mount a cell once the browser runtime has loaded (adapters call this). */
export async function mountWhenReady(host: HTMLElement, options: CellOptions): Promise<CellHandle> {
  const { runtime } = await import("./index");
  return runtime.mountCell(host, options);
}
