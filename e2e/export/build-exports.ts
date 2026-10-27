import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assembleWebApp, type WebAppInput } from "../../src/lib/export/web-app";
import { filesFor, importedModules, packagesFor, type PyodideLock } from "../../src/lib/export/pyodide-bundle";
import { exportFontNeeds } from "../../src/lib/export/fonts";
import { WEB_APP_PAYLOAD_VERSION, type WebAppPayload } from "../../src/lib/export/web-app-payload";
import { PYODIDE_VERSION } from "../../src/lib/pyodide-config";
import { EXPORT_NOTEBOOK, READONLY_OUTPUTS } from "./notebook";
import { startStaticServer } from "./static-server";

// Global setup for the export suite: builds web app exports exactly as the
// Export dialog does (assembleWebApp), from the production runtime build and
// the local Pyodide mirror, into reports/exports/<variant>/, and starts a
// static server for the variants that load over HTTP. Nothing touches the
// network: the "CDN" variant loads Pyodide from the mirror through that
// server, which is the same code path as loading it from jsDelivr.
//
// Needs `vite build` (dist/export-runtime) and
// `node scripts/fetch-pyodide-mirror.mjs` (.cache/pyodide) to have run; the
// `test:export` script does both.

const root = path.resolve(import.meta.dirname, "../..");
export const EXPORTS_DIR = path.join(root, "reports/exports");
const RUNTIME = path.join(root, "dist/export-runtime");
export const MIRROR = path.join(root, ".cache/pyodide", PYODIDE_VERSION);
// Tests read the server's address from here (workers inherit the environment
// global setup leaves).
export const SERVER_ENV = "PYNOTE_EXPORT_SERVER";

export const VARIANTS = {
  "single-offline": { layout: "single", mode: "interactive", pyodide: "embedded" },
  "folder-offline": { layout: "folder", mode: "interactive", pyodide: "embedded" },
  "single-cdn": { layout: "single", mode: "interactive", pyodide: "cdn" },
  "single-readonly": { layout: "single", mode: "readonly" },
} as const;
export type Variant = keyof typeof VARIANTS;

// The default theme's page colors and code font (src/lib/theme.ts, which
// cannot load in Node). The theme itself is left empty: the runtime
// completes it from the defaults, exactly as for a notebook exported with the
// default theme.
const PAGE_COLORS = { background: "#1e1e2e", text: "#cdd6f4" };
const CODE_FONT = '"JetBrains Mono Variable", monospace';

const need = (file: string, hint: string) => {
  if (!existsSync(file)) throw new Error(`${path.relative(root, file)} is missing: ${hint}`);
  return file;
};

export default async function buildExports(): Promise<() => Promise<void>> {
  need(path.join(RUNTIME, "manifest.json"), "run `npx vite build` first");
  need(path.join(MIRROR, "pyodide-lock.json"), "run `node scripts/fetch-pyodide-mirror.mjs` first");
  const server = await startStaticServer({ "/exports/": EXPORTS_DIR, "/pyodide/": MIRROR });
  process.env[SERVER_ENV] = server.origin;

  const runtime = {
    appJs: readFileSync(path.join(RUNTIME, "app.js"), "utf8"),
    appCss: readFileSync(path.join(RUNTIME, "app.css"), "utf8"),
    workerJs: readFileSync(path.join(RUNTIME, "worker.js"), "utf8"),
  };
  const lock = JSON.parse(readFileSync(path.join(MIRROR, "pyodide-lock.json"), "utf8")) as PyodideLock;
  const sources = EXPORT_NOTEBOOK.cells.filter((c) => c.type === "code").map((c) => c.source);
  const pyodideFiles = new Map<string, Uint8Array>();
  for (const file of filesFor(lock, packagesFor(lock, importedModules(sources)))) {
    const bytes = readFileSync(need(path.join(MIRROR, file.name), "re-run the mirror script with that package"));
    pyodideFiles.set(file.name, new Uint8Array(bytes));
  }

  rmSync(EXPORTS_DIR, { recursive: true, force: true });
  for (const [name, variant] of Object.entries(VARIANTS)) {
    const pyodide: WebAppPayload["pyodide"] = !("pyodide" in variant)
      ? undefined
      : variant.pyodide === "embedded"
        ? { kind: "embedded", layout: variant.layout }
        : { kind: "cdn", indexURL: `${server.origin}/pyodide/` };
    const payload: WebAppPayload = {
      pynoteExport: WEB_APP_PAYLOAD_VERSION,
      exportId: `test-${name}`,
      filename: "Export test.ipynb",
      mode: variant.mode,
      startInPresentation: false,
      document: EXPORT_NOTEBOOK,
      theme: {},
      codeVisibility: {},
      ...(variant.mode === "readonly" ? { outputs: READONLY_OUTPUTS } : {}),
      ...(pyodide ? { pyodide } : {}),
    };
    const input: WebAppInput = {
      runtime,
      payload,
      fonts: exportFontNeeds({
        fonts: [CODE_FONT],
        content: [EXPORT_NOTEBOOK, payload.outputs ?? null],
        interactive: variant.mode === "interactive",
      }),
      pyodideFiles: pyodide?.kind === "embedded" ? pyodideFiles : undefined,
      layout: variant.layout,
      title: "Export test",
      colors: PAGE_COLORS,
    };
    for (const [rel, content] of await assembleWebApp(input)) {
      const target = path.join(EXPORTS_DIR, name, rel);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
  return () => server.close();
}
