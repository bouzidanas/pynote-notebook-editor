import { setHostProfile, standaloneProfile } from "../lib/host";
import { kernel } from "../lib/pyodide";
import { EMBEDDED_PYODIDE_URL, PYODIDE_CDN_URL } from "../lib/pyodide-config";
import type { PyodideLock } from "../lib/export/pyodide-bundle";
import {
  ASSET_ATTRIBUTE,
  ASSET_FOLDER,
  ASSET_REGISTRY,
  PAYLOAD_ELEMENT_ID,
  WEB_APP_PAYLOAD_VERSION,
  WORKER_ELEMENT_ID,
  type AssetEncoding,
  type WebAppPayload,
  decodeAsset,
} from "../lib/export/web-app-payload";

// Runs first in the standalone runtime (see main.tsx): reads what the export
// embedded and sets up the host and the kernel before any store loads, so the
// stores start from the exported notebook, theme and view settings.

const readPayload = (): WebAppPayload => {
  const element = document.getElementById(PAYLOAD_ELEMENT_ID);
  if (!element?.textContent) throw new Error("This page has no embedded PyNote notebook.");
  const payload = JSON.parse(element.textContent) as WebAppPayload;
  if (payload.pynoteExport !== WEB_APP_PAYLOAD_VERSION) {
    throw new Error(`Unsupported PyNote export version ${String(payload.pynoteExport)}.`);
  }
  return payload;
};

// --- Embedded data -----------------------------------------------------------

type EncodedData = { data: string; encoding: AssetEncoding };

const inlineData = (element: Element | null): EncodedData | null =>
  element?.textContent
    ? { data: element.textContent, encoding: (element.getAttribute("data-encoding") ?? "gzip+base64") as AssetEncoding }
    : null;

// Folder exports: each asset is a classic script next to the page that hands
// its data to this registry when loaded (scripts load from file://, fetch
// does not).
const folderAssets = new Map<string, EncodedData>();
(window as any)[ASSET_REGISTRY] = (name: string, data: string, encoding: AssetEncoding) => {
  folderAssets.set(name, { data, encoding });
};

const loadFolderAsset = (name: string): Promise<EncodedData | null> =>
  new Promise((resolve) => {
    const known = folderAssets.get(name);
    if (known) return resolve(known);
    const script = document.createElement("script");
    script.src = `${ASSET_FOLDER}/${encodeURIComponent(name)}.js`;
    script.onload = () => {
      script.remove();
      const loaded = folderAssets.get(name) ?? null;
      folderAssets.delete(name); // the worker keeps its own decoded copy
      resolve(loaded);
    };
    script.onerror = () => {
      script.remove();
      resolve(null);
    };
    document.head.appendChild(script);
  });

const findAsset = async (payload: WebAppPayload, name: string): Promise<Uint8Array | null> => {
  if (payload.pyodide?.kind !== "embedded") return null;
  const encoded = payload.pyodide.layout === "folder"
    ? await loadFolderAsset(name)
    : inlineData(document.querySelector(`script[${ASSET_ATTRIBUTE}="${CSS.escape(name)}"]`));
  return encoded ? decodeAsset(encoded.data, encoded.encoding) : null;
};

const textOf = async (payload: WebAppPayload, name: string): Promise<string> => {
  const bytes = await findAsset(payload, name);
  if (!bytes) throw new Error(`This export is missing ${name}.`);
  return new TextDecoder().decode(bytes);
};

// --- Packages an offline export does not include ----------------------------
// It carries the packages the notebook imports. Any other Pyodide package (a
// reader adds `import scipy`, or micropip installs one) downloads from the CDN
// the export's Pyodide comes from, when the reader is online. The browser
// checks each download against the SHA-256 in the export's own lock file.

let packageHashes: Promise<Map<string, string>> | null = null;
const hashOf = async (payload: WebAppPayload, name: string): Promise<string | undefined> => {
  packageHashes ??= textOf(payload, "pyodide-lock.json").then((text) => {
    const lock = JSON.parse(text) as PyodideLock;
    return new Map(Object.values(lock.packages).map((pkg) => [pkg.file_name, pkg.sha256]));
  });
  return (await packageHashes).get(name);
};

// Subresource integrity takes the digest in base64; the lock file has hex.
const integrity = (sha256: string) => `sha256-${btoa(String.fromCharCode(...(sha256.match(/../g) ?? []).map((byte) => parseInt(byte, 16))))}`;

const downloadPackage = async (payload: WebAppPayload, name: string): Promise<Uint8Array | null> => {
  const sha256 = await hashOf(payload, name);
  if (!sha256) return null; // not a package of this Pyodide
  try {
    // Resolved as Pyodide resolves a lock file's file name against its base.
    const response = await fetch(new URL(name, PYODIDE_CDN_URL), { integrity: integrity(sha256) });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null; // offline, or the bytes did not match the lock file
  }
};

// --- Host and kernel ---------------------------------------------------------

const payload = readPayload();

setHostProfile(standaloneProfile({
  exportId: payload.exportId,
  filename: payload.filename,
  document: payload.document,
  theme: payload.theme,
  codeVisibility: payload.codeVisibility,
  mode: payload.mode,
  startInPresentation: payload.startInPresentation,
  outputs: payload.outputs,
}));

if (payload.mode === "interactive") {
  const embedded = payload.pyodide?.kind === "embedded";

  // A classic worker from a Blob: the only kind a page opened from file://
  // can start in every browser. Offline exports put Pyodide's own classic
  // loader in front of PyNote's worker code in the same script. The script
  // is made once per page: a kernel restart starts a new worker from the same
  // URL instead of decoding everything again into another Blob.
  let workerUrl: Promise<string> | null = null;
  const makeWorkerUrl = async () => {
    const workerData = inlineData(document.getElementById(WORKER_ELEMENT_ID));
    if (!workerData) throw new Error("This export is missing the kernel worker.");
    const workerSource = new TextDecoder().decode(await decodeAsset(workerData.data, workerData.encoding));
    const parts: string[] = embedded
      ? [await textOf(payload, "pyodide.asm.js"), "\n;\n", await textOf(payload, "pyodide.js"), "\n;\n", workerSource]
      : [workerSource];
    return URL.createObjectURL(new Blob(parts, { type: "text/javascript" }));
  };

  kernel.configure({
    createWorker: async () => {
      workerUrl ??= makeWorkerUrl().catch((err: unknown) => {
        workerUrl = null; // let the next start try again
        throw err;
      });
      return new Worker(await workerUrl);
    },
    pyodide: embedded
      ? { kind: "embedded", indexURL: EMBEDDED_PYODIDE_URL }
      : { kind: "url", indexURL: payload.pyodide?.kind === "cdn" ? payload.pyodide.indexURL : "" },
    provideAsset: async (name) => {
      const bytes = (await findAsset(payload, name)) ?? (embedded ? await downloadPackage(payload, name) : null);
      return bytes ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer) : null;
    },
  });
}
