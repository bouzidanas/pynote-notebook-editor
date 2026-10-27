import {
  ASSET_ATTRIBUTE,
  ASSET_FOLDER,
  ASSET_REGISTRY,
  PAYLOAD_ELEMENT_ID,
  WORKER_ELEMENT_ID,
  type WebAppPayload,
  encodeAsset,
  scriptSafeJson,
} from "./web-app-payload";
import { type FontNeeds, selectFonts } from "./fonts";
import type { EarlierExport } from "./save";
import { type NotebookDocument, isJsonObject } from "../formats/document";

// Assembles a standalone web app export from the runtime files (built by
// vite/export-runtime.ts), the notebook payload and, for offline exports,
// Pyodide's files. Pure: no DOM, store or network, so it runs in Node for the
// export suite (e2e/export/build-exports.ts).
//
// Two layouts, one runtime:
// - single: one HTML file with everything inline; opens by double click.
// - folder: index.html plus pynote.js, pynote.css and Pyodide's data as
//   classic scripts under pyodide/ (a page opened from file:// can load
//   classic scripts but cannot fetch files), so it also opens from disk.

export interface RuntimeFiles {
  appJs: string;
  appCss: string;
  workerJs: string;
}

export interface WebAppInput {
  runtime: RuntimeFiles;
  payload: WebAppPayload;
  fonts: FontNeeds;
  // Offline exports: Pyodide file name -> bytes.
  pyodideFiles?: Map<string, Uint8Array>;
  layout: "single" | "folder";
  title: string;
  colors: { background: string; text: string };
}

export type ExportFiles = Map<string, string>;

// Every page names PyNote as its generator, which is how exporting into the
// same folder again recognizes an earlier export.
const GENERATOR_META = `<meta name="generator" content="PyNote">`;
// How every asset script of a folder export starts.
const ASSET_SCRIPT_START = `window[${JSON.stringify(ASSET_REGISTRY)}](`;

/**
 * An earlier web app folder export, and the files PyNote wrote in it: the
 * page, its script, styles and README, and the asset scripts under pyodide/.
 * Exporting into the same folder again replaces those and nothing else.
 */
export const EARLIER_WEB_APP_FOLDER: EarlierExport = {
  marker: { path: "index.html", matches: (start) => start.includes(GENERATOR_META) },
  folders: [ASSET_FOLDER],
  owns: (path, start) =>
    ["index.html", "pynote.js", "pynote.css", "README.txt"].includes(path) ||
    (path.startsWith(`${ASSET_FOLDER}/`) && path.endsWith(".js") && start.startsWith(ASSET_SCRIPT_START)),
};

/**
 * The notebook as readers get it: without the author's undo history, which
 * holds the text of deleted cells and every earlier version of edited ones.
 */
export function readerDocument(document: NotebookDocument): NotebookDocument {
  const pynote = document.metadata.PyNote;
  if (!isJsonObject(pynote)) return document;
  return { ...document, metadata: { ...document.metadata, PyNote: { ...pynote, history: [] } } };
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Inline script text must not contain the sequences that end the element
// early ("</script") or change how the HTML parser reads it ("<!--"). In the
// runtime they only occur in strings, template literals and regular
// expressions, where "\x3C" means "<" too: also with the u or v flag, and when
// code compiles a regular expression's source again (highlight.js does, with
// the u flag, for its HTML grammar's /<!--/). A "<" that a backslash escapes
// keeps a single escape.
export const inlineScriptText = (js: string) =>
  js.replace(/(\\*)<(?=!--|\/script)/gi, (_, slashes: string) => `${slashes.slice(0, slashes.length - (slashes.length % 2))}\\x3C`);
// Inline style text must not end its element early either.
const inlineStyleText = (css: string) => css.replace(/<\/(style)/gi, "<\\/$1");

// Colors go into a <style> attribute-free rule; accept only plain color
// tokens so a theme value cannot break out of it.
const safeColor = (value: string, fallback: string) => (/^[#a-zA-Z0-9(),.%\s-]+$/.test(value) ? value : fallback);

export async function assembleWebApp(input: WebAppInput): Promise<ExportFiles> {
  const files: ExportFiles = new Map();
  const css = selectFonts(input.runtime.appCss, input.fonts);
  const background = safeColor(input.colors.background, "#1e1e2e");
  const text = safeColor(input.colors.text, "#cdd6f4");
  const interactive = input.payload.mode === "interactive";
  const single = input.layout === "single";

  const blocks: string[] = [];
  blocks.push(`<script type="application/json" id="${PAYLOAD_ELEMENT_ID}">${scriptSafeJson(input.payload)}</script>`);
  if (interactive) {
    const worker = await encodeAsset(new TextEncoder().encode(input.runtime.workerJs));
    blocks.push(`<script type="application/octet-stream" id="${WORKER_ELEMENT_ID}" data-encoding="gzip+base64">${worker}</script>`);
    for (const [name, bytes] of input.pyodideFiles ?? []) {
      const data = await encodeAsset(bytes);
      if (single) {
        blocks.push(`<script type="application/octet-stream" ${ASSET_ATTRIBUTE}="${escapeHtml(name)}" data-encoding="gzip+base64">${data}</script>`);
      } else {
        files.set(`${ASSET_FOLDER}/${name}.js`, `${ASSET_SCRIPT_START}${JSON.stringify(name)}, "${data}", "gzip+base64");\n`);
      }
    }
  }

  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content">`,
    GENERATOR_META,
    `<title>${escapeHtml(input.title)}</title>`,
    `<meta name="theme-color" content="${escapeHtml(background)}">`,
    `<style>html,body{background-color:${background};color:${text}}</style>`,
    single ? `<style>${inlineStyleText(css)}</style>` : `<link rel="stylesheet" href="pynote.css">`,
  ];
  const app = single ? `<script>${inlineScriptText(input.runtime.appJs)}</script>` : `<script src="pynote.js"></script>`;
  const noscript = `<noscript><p style="font-family:system-ui,sans-serif;padding:2rem">This notebook needs JavaScript to run.</p></noscript>`;

  const html = `<!doctype html>
<html lang="en">
<head>
${head.join("\n")}
</head>
<body>
<div id="root"></div>
${noscript}
${blocks.join("\n")}
${app}
</body>
</html>
`;
  files.set("index.html", html);
  if (!single) {
    files.set("pynote.js", input.runtime.appJs);
    files.set("pynote.css", css);
    files.set("README.txt", folderReadme(input.title, input.payload));
  }
  return files;
}

// What the folder is, and what it needs to show the notebook.
const folderReadme = (title: string, payload: WebAppPayload) => {
  const python =
    payload.mode === "readonly"
      ? "It shows the notebook and its outputs as they were when exported. Nothing runs,\nso it needs neither Python nor the internet."
      : payload.pyodide?.kind === "embedded"
        ? "Python is included in the pyodide/ folder, so the notebook runs offline. Python\npackages it does not include are downloaded from the jsDelivr CDN when online."
        : "Python is downloaded from the jsDelivr CDN when the page opens, so readers need\nthe internet.";
  return `${title}
${"=".repeat(Math.min(title.length, 72))}

A notebook exported from PyNote as a web app.

Open index.html in a browser to use it. It also works when published on any
static web host (copy the whole folder).

${python}
`;
};
