import type { NotebookDocument } from "../formats/document";
import type { Theme } from "../theme";
import type { CodeVisibilitySettings } from "../codeVisibility";
import type { CellOutputs } from "../host";

// The contract between the HTML exporter (running in PyNote) and the
// standalone runtime (running in the exported page). The exporter writes it,
// the runtime (src/export-runtime/setup.ts) reads it; both sides import this
// module so the element ids and encodings cannot drift apart.

export const WEB_APP_PAYLOAD_VERSION = 1;

// <script type="application/json" id="pynote-export">: the WebAppPayload.
export const PAYLOAD_ELEMENT_ID = "pynote-export";
// <script type="application/octet-stream" id="pynote-worker" data-encoding=...>:
// the kernel worker's classic script.
export const WORKER_ELEMENT_ID = "pynote-worker";
// Embedded Pyodide files, one element each, in a single-file export:
// <script type="application/octet-stream" data-pynote-asset="<file name>" data-encoding=...>
export const ASSET_ATTRIBUTE = "data-pynote-asset";
// Folder exports keep the same data in classic scripts next to the page
// (`pyodide/<file name>.js`), each calling window[ASSET_REGISTRY](name, data),
// because a page opened from file:// can load scripts but cannot fetch files.
export const ASSET_REGISTRY = "__pynoteAsset";
export const ASSET_FOLDER = "pyodide";

export type AssetEncoding = "gzip+base64";

// Static exports render the read-only page once, in a hidden frame
// (src/lib/export/static-html.ts), and save what it shows. CodeMirror draws
// only what is in view: of a very long line it draws the part in view and a
// placeholder for the rest. A read-only page offers the renderer each
// editor's code through window[STATIC_RENDER_HOOK] (src/export-runtime/
// static-render.ts), so the saved page keeps every character.
export const STATIC_RENDER_HOOK = "__pynoteStaticRender";

export interface StaticCode {
  /** The editor's code, or null when CodeMirror has not drawn all its lines (an editor that is not displayed). */
  text: string | null;
  /** Each line CodeMirror did not draw whole: its index among the editor's lines, and its content as CodeMirror draws it (highlighted). */
  lines: Array<{ index: number; html: string }>;
}

export interface StaticRenderHook {
  /** The code of an editor on the page (its .cm-editor element), or null for an element that is not one. */
  code(editor: Element): StaticCode | null;
}

export interface WebAppPayload {
  pynoteExport: typeof WEB_APP_PAYLOAD_VERSION;
  exportId: string;
  filename: string;
  mode: "interactive" | "readonly";
  startInPresentation: boolean;
  document: NotebookDocument;
  theme: Partial<Theme>;
  codeVisibility: Partial<CodeVisibilitySettings>;
  // Read-only exports: outputs per code cell id.
  outputs?: Record<string, CellOutputs>;
  // Interactive exports: where Python comes from.
  pyodide?: { kind: "cdn"; indexURL: string } | { kind: "embedded"; layout: "single" | "folder" };
}

/** JSON safe to place inside a <script> element (no "</script", no "<!--"). */
export const scriptSafeJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// --- gzip + base64 (CompressionStream and DecompressionStream are available
// in every browser PyNote supports and in Node 18+) -----------------------

const toBase64 = (bytes: Uint8Array): string => {
  const maybe = (bytes as any).toBase64;
  if (typeof maybe === "function") return maybe.call(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array => {
  const native = (Uint8Array as any).fromBase64;
  if (typeof native === "function") return native(text);
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const pipe = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());

export const encodeAsset = async (bytes: Uint8Array): Promise<string> => toBase64(await pipe(bytes, new CompressionStream("gzip")));

export const decodeAsset = async (data: string, encoding: AssetEncoding): Promise<Uint8Array> => {
  if (encoding !== "gzip+base64") throw new Error(`Unknown asset encoding ${encoding}`);
  return pipe(fromBase64(data.trim()), new DecompressionStream("gzip"));
};
