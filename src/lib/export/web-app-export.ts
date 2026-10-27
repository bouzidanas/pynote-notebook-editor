import type { NotebookDocument } from "../formats/document";
import { notebookStore } from "../store";
import { currentTheme } from "../theme";
import { getVisibilitySettings } from "../codeVisibility";
import { kernel } from "../pyodide";
import { PYODIDE_CDN_URL } from "../pyodide-config";
import { exportFontNeeds } from "./fonts";
import { snapshotOutputs } from "./output-snapshot";
import { type DownloadProgress, type PyodideLock, downloadPyodideFiles, filesFor, importedModules, packagesFor } from "./pyodide-bundle";
import { renderStaticHtml } from "./static-html";
import { type RuntimeFiles, assembleWebApp, readerDocument } from "./web-app";
import { WEB_APP_PAYLOAD_VERSION, type WebAppPayload } from "./web-app-payload";

// The web app export as the Export dialog runs it: the runtime PyNote was
// built with (vite/export-runtime.ts serves it next to the app), the notebook
// the dialog captured (documentFromApp), its outputs as they are now, and
// Python when the export carries it.

export interface WebAppOptions {
  mode: "interactive" | "readonly";
  /** Interactive: open in presentation mode (readers can leave it). */
  startInPresentation: boolean;
  /** Read-only: flat HTML and CSS without JavaScript. */
  staticHtml: boolean;
  /** Interactive: carry Python (works offline) or load it from the CDN. */
  python: "embedded" | "cdn";
  layout: "single" | "folder";
}

export type WebAppProgress =
  | { stage: "runtime" }
  | { stage: "python"; download: DownloadProgress }
  | { stage: "assemble" }
  | { stage: "render" };

export interface BuildOptions {
  onProgress?: (progress: WebAppProgress) => void;
  /** Cancels the build: it rejects with the signal's reason (an AbortError). */
  signal?: AbortSignal;
}

/** A single HTML file, or a folder of files (index.html first). */
export interface WebAppOutput {
  files: Map<string, string>;
  folder: boolean;
}

interface RuntimeManifest {
  version: number;
  files: Record<string, { bytes: number; sha256: string }>;
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const runtimeUrl = (file: string) => `${import.meta.env.BASE_URL}export-runtime/${file}`;

async function fetchRuntime(signal: AbortSignal | undefined): Promise<RuntimeFiles> {
  const response = await fetch(runtimeUrl("manifest.json"), { cache: "no-cache", signal });
  if (!response.ok) throw new Error("The web app runtime is not available (it is built with the app).");
  const manifest = (await response.json()) as RuntimeManifest;
  const text = async (file: string) => {
    const r = await fetch(runtimeUrl(file), { cache: "no-cache", signal });
    if (!r.ok) throw new Error(`Could not load the web app runtime (${file}).`);
    const buffer = await r.arrayBuffer();
    // A stale cache or a half-deployed app would mix runtime versions.
    if (manifest.files[file] && hex(await crypto.subtle.digest("SHA-256", buffer)) !== manifest.files[file].sha256) {
      throw new Error(`The web app runtime (${file}) does not match this version of PyNote. Reload the page and try again.`);
    }
    return new TextDecoder().decode(buffer);
  };
  const [appJs, appCss, workerJs] = await Promise.all([text("app.js"), text("app.css"), text("worker.js")]);
  return { appJs, appCss, workerJs };
}

async function fetchPython(codeSources: string[], { onProgress, signal }: BuildOptions): Promise<Map<string, Uint8Array>> {
  const lockResponse = await fetch(`${PYODIDE_CDN_URL}pyodide-lock.json`, { signal });
  if (!lockResponse.ok) throw new Error(`Could not download Python (HTTP ${lockResponse.status}).`);
  const lock = (await lockResponse.json()) as PyodideLock;
  const files = filesFor(lock, packagesFor(lock, importedModules(codeSources)));
  return downloadPyodideFiles(files, PYODIDE_CDN_URL, { onProgress: (download) => onProgress?.({ stage: "python", download }), signal });
}

const stem = (filename: string) => filename.replace(/\.(ipynb|pynote)$/i, "") || "Untitled";

export async function buildWebApp(
  notebook: NotebookDocument,
  options: WebAppOptions,
  { onProgress = () => {}, signal }: BuildOptions = {},
): Promise<WebAppOutput> {
  const document = readerDocument(notebook);
  const theme = { ...currentTheme };
  const readOnly = options.mode === "readonly";
  const layout = readOnly && options.staticHtml ? "single" : options.layout;
  const outputs = readOnly ? snapshotOutputs(notebookStore.cells, (uid) => kernel.componentSnapshot(uid)) : undefined;
  const codeSources = document.cells.filter((cell) => cell.type === "code").map((cell) => cell.source);

  onProgress({ stage: "runtime" });
  const runtime = await fetchRuntime(signal);
  const embedded = !readOnly && options.python === "embedded";
  const pyodideFiles = embedded ? await fetchPython(codeSources, { onProgress, signal }) : undefined;
  signal?.throwIfAborted();

  onProgress({ stage: "assemble" });
  const payload: WebAppPayload = {
    pynoteExport: WEB_APP_PAYLOAD_VERSION,
    exportId: crypto.randomUUID(),
    filename: notebookStore.filename,
    mode: options.mode,
    startInPresentation: !readOnly && options.startInPresentation,
    document,
    theme,
    codeVisibility: getVisibilitySettings(),
    ...(outputs ? { outputs } : {}),
    ...(readOnly ? {} : { pyodide: embedded ? { kind: "embedded" as const, layout } : { kind: "cdn" as const, indexURL: PYODIDE_CDN_URL } }),
  };
  const files = await assembleWebApp({
    runtime,
    payload,
    fonts: exportFontNeeds({
      fonts: [theme.font, theme.codeTypography?.fontFamily, theme.uiTypography?.fontFamily],
      content: [document, outputs ?? null],
      interactive: !readOnly,
    }),
    pyodideFiles,
    layout,
    title: stem(notebookStore.filename),
    colors: { background: theme.colors.background, text: theme.colors.secondary },
  });

  signal?.throwIfAborted();
  if (readOnly && options.staticHtml) {
    onProgress({ stage: "render" });
    const html = await renderStaticHtml(files.get("index.html")!, document.cells.length, signal);
    return { files: new Map([["index.html", html]]), folder: false };
  }
  return { files, folder: layout === "folder" };
}
