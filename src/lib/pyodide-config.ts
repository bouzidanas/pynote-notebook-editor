// Where the kernel gets Pyodide from. The app loads it from the jsDelivr CDN;
// exported notebooks can instead point at a self-hosted copy or carry the
// files inside the export (offline web app). The worker
// (src/lib/pyodide.worker.ts) receives one of these in its init message.

// The Pyodide release the kernel runs. The `pyodide` dev dependency used by
// the Vitest suites must match (checked by src/lib/pyodide-config.test.ts),
// and PYNOTE_PYTHON_VERSION in src/lib/formats/document.ts must be the
// CPython version this release bundles.
export const PYODIDE_VERSION = "0.29.4";

export const PYODIDE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export type PyodideSource =
  // Load pyodide.mjs and every asset from a URL prefix (CDN or self-hosted).
  | { kind: "url"; indexURL: string }
  // Offline exports: the worker script already contains Pyodide's loader,
  // and every asset under the virtual `indexURL` prefix is requested from the
  // page over postMessage (see Kernel's asset provider), because a page
  // opened from file:// cannot fetch its own files.
  | { kind: "embedded"; indexURL: string };

export const DEFAULT_PYODIDE_SOURCE: PyodideSource = { kind: "url", indexURL: PYODIDE_CDN_URL };

// Virtual prefix for embedded assets. It never resolves on the network; the
// worker intercepts fetches to it.
export const EMBEDDED_PYODIDE_URL = `https://pyodide.invalid/v${PYODIDE_VERSION}/full/`;
