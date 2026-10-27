import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build, type Plugin, type Rollup } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import ts from "typescript";
import { katexFontFaces } from "../src/embed/cdn.ts";

// Builds the pynote package (packages/pynote) from the app's sources:
//
//   dist/index.js     browser runtime: PyNote's code cell, store, kernel and
//                     styles, with a private copy of Solid (adapters for any
//                     framework talk to it through bridge.js)
//   dist/server.js    what "pynote" resolves to outside the browser
//   dist/bridge.js    the page-wide runtime slot and configure()
//   dist/element.js   <pynote-cell>
//   dist/react.js     <PyNoteCell> for React ("use client")
//   dist/solid.js     <PyNoteCell> for Solid, compiled (solid/index.jsx is the
//                     source the "solid" export condition gives Solid apps)
//   dist/cli.js       npx pynote
//   types/*.d.ts      public types
//
// CodeMirror, React and Solid stay imports (peer dependencies); the kernel
// worker is built in as a string and started from a Blob.
//
//   node vite/component-build.ts      (npm run build:package)

const ROOT = path.resolve(import.meta.dirname, "..");
const PKG = path.join(ROOT, "packages/pynote");
const DIST = path.join(PKG, "dist");
const version = (JSON.parse(readFileSync(path.join(PKG, "package.json"), "utf8")) as { version: string }).version;

const common = { configFile: false as const, root: ROOT, logLevel: "warn" as const, envFile: false as const, publicDir: false as const };
const PEERS = /^(@codemirror\/|@lezer\/|react($|\/)|react-dom($|\/))/;

const firstChunk = (output: Rollup.RollupOutput | Rollup.RollupOutput[] | Rollup.RollupWatcher): string => {
  const result = Array.isArray(output) ? output[0] : (output as Rollup.RollupOutput);
  const chunk = result.output.find((item): item is Rollup.OutputChunk => item.type === "chunk");
  if (!chunk) throw new Error("build produced no chunk");
  return chunk.code;
};

// 1. The kernel worker as one classic script.
async function workerSource(): Promise<string> {
  const output = await build({
    ...common,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      target: "es2022",
      minify: true,
      reportCompressedSize: false,
      lib: { entry: path.join(ROOT, "src/lib/pyodide.worker.ts"), formats: ["iife"], name: "PyNoteKernelWorker", fileName: () => "worker.js" },
    },
  });
  return firstChunk(output);
}

const workerModule = (source: string): Plugin => ({
  name: "pynote-worker-source",
  resolveId: (id) => (id === "virtual:pynote-worker" ? "\0virtual:pynote-worker" : null),
  load: (id) => (id === "\0virtual:pynote-worker" ? `export default ${JSON.stringify(source)};` : null),
});

// Font faces only work at page level: the runtime loads font stylesheets for
// the page, so the shadow-root sheet drops every @font-face (KaTeX's, with
// their inlined font files).
const stripFontFaces = (): Plugin => ({
  name: "pynote-strip-font-faces",
  enforce: "post",
  transform(code, id) {
    if (!id.includes("embed.css") || !id.includes("inline")) return null;
    return { code: code.replace(/@font-face\s*\{[^}]*\}/g, ""), map: null };
  },
});

// ...and adds KaTeX's faces to the page instead, with the font files on the
// CDN: only the faces, so KaTeX's class rules never reach the page's own math.
const katexFontFacesModule = (): Plugin => ({
  name: "pynote-katex-font-faces",
  resolveId: (id) => (id === "virtual:pynote-katex-font-faces" ? "\0virtual:pynote-katex-font-faces" : null),
  load: (id) =>
    id === "\0virtual:pynote-katex-font-faces"
      ? `export default ${JSON.stringify(katexFontFaces(readFileSync(path.join(ROOT, "node_modules/katex/dist/katex.min.css"), "utf8")))};`
      : null,
});

// The Solid adapter imports the shared bridge.js, which every entry uses.
const isBridge = (id: string) => id === "./bridge" || /[\\/]src[\\/]embed[\\/]bridge(\.ts)?$/.test(id);

async function main() {
  for (const dir of ["dist", "types", "solid"]) rmSync(path.join(PKG, dir), { recursive: true, force: true });
  const define = {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __PYNOTE_VERSION__: JSON.stringify(version),
  };

  // 2. Browser entries (one build, so they share chunks). Event handlers are
  // set on the elements in each cell's shadow root, not delegated to the
  // document: a page that stops an event from bubbling (a modal, a card)
  // must not disable the cells inside it (runtime.tsx does the same for
  // handlers set through prop spreads).
  const worker = await workerSource();
  await build({
    ...common,
    plugins: [workerModule(worker), katexFontFacesModule(), solid({ solid: { delegateEvents: false } }), tailwindcss(), stripFontFaces()],
    define,
    build: {
      outDir: DIST,
      emptyOutDir: false,
      target: "es2022",
      minify: true,
      cssCodeSplit: false,
      reportCompressedSize: false,
      lib: {
        entry: {
          index: path.join(ROOT, "src/embed/index.ts"),
          server: path.join(ROOT, "src/embed/server.ts"),
          bridge: path.join(ROOT, "src/embed/bridge.ts"),
          element: path.join(ROOT, "src/embed/element.ts"),
          react: path.join(ROOT, "src/embed/react.ts"),
        },
        formats: ["es"],
      },
      rollupOptions: {
        external: (id) => PEERS.test(id),
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name]-[hash].js",
          // Next.js needs the directive to keep the component on the client.
          banner: (chunk) => (chunk.name === "react" ? '"use client";' : ""),
        },
      },
    },
  });
  // CSS that components import (uPlot's) is already in the shadow-root sheet
  // (src/embed/embed.css); a library's extracted stylesheet would reach nothing.
  for (const name of readdirSync(DIST)) if (name.endsWith(".css")) rmSync(path.join(DIST, name));

  // 3. The Solid adapter, compiled against the app's Solid.
  await build({
    ...common,
    plugins: [solid()],
    define,
    build: {
      outDir: DIST,
      emptyOutDir: false,
      target: "es2022",
      minify: false,
      reportCompressedSize: false,
      lib: { entry: path.join(ROOT, "src/embed/solid.tsx"), formats: ["es"], fileName: () => "solid.js" },
      rollupOptions: {
        external: (id) => id.startsWith("solid-js") || isBridge(id),
        // A full specifier (strict ESM resolution: Node, webpack's fully specified imports).
        output: { paths: (id) => (isBridge(id) ? "./bridge.js" : id) },
      },
    },
  });

  // 4. Its source for the "solid" export condition: the app compiles it.
  const solidSource = readFileSync(path.join(ROOT, "src/embed/solid.tsx"), "utf8");
  const solidJs = ts.transpileModule(solidSource, {
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
  }).outputText.replace(/from "\.\/bridge"/g, 'from "../dist/bridge.js"');
  mkdirSync(path.join(PKG, "solid"), { recursive: true });
  writeFileSync(path.join(PKG, "solid/index.jsx"), solidJs);

  // 5. npx pynote (Node).
  await build({
    ...common,
    define,
    build: {
      ssr: path.join(ROOT, "src/embed/cli.ts"),
      outDir: DIST,
      emptyOutDir: false,
      target: "node18",
      minify: false,
      reportCompressedSize: false,
      rollupOptions: { output: { entryFileNames: "cli.js", banner: "#!/usr/bin/env node" } },
    },
    ssr: { noExternal: true },
  });

  // 6. Types: the shared declarations from src/embed/types.ts, and one file per entry.
  execFileSync(
    process.execPath,
    [path.join(ROOT, "node_modules/typescript/bin/tsc"), path.join(ROOT, "src/embed/types.ts"), "--declaration", "--emitDeclarationOnly", "--skipLibCheck", "--target", "es2022", "--module", "esnext", "--outDir", path.join(PKG, "types")],
    { stdio: "inherit" },
  );
  const types: Record<string, string> = {
    "index.d.ts": `import type { CellHandle, CellOptions, PyNoteConfig, PyNoteRuntime } from "./types.js";
export type { CellHandle, CellOptions, CodeVisibility, ExecutionMode, PyNoteConfig, PyNoteRuntime } from "./types.js";
export declare const version: string;
/** The page's runtime (undefined outside the browser). */
export declare const runtime: PyNoteRuntime | undefined;
/** Configure the notebook every cell on the page shares (from browser code; on the server it does nothing for the page). */
export declare function configure(config: PyNoteConfig): void;
/** Render a cell into \`host\` (its shadow root). Browser only. */
export declare function mountCell(host: HTMLElement, options: CellOptions): CellHandle;
`,
    "react.d.ts": `import type { ReactElement } from "react";
import type { CellOptions, PyNoteConfig } from "./types.js";
export type { CellHandle, CellOptions, CodeVisibility, ExecutionMode, PyNoteConfig } from "./types.js";
/** A PyNote code cell. Cells on a page share one Python runtime, in page order. */
export declare function PyNoteCell(props: CellOptions): ReactElement;
/** Configure the notebook every cell on the page shares. */
export declare function configure(config: PyNoteConfig): void;
`,
    "solid.d.ts": `import type { JSX } from "solid-js";
import type { CellOptions, PyNoteConfig } from "./types.js";
export type { CellHandle, CellOptions, CodeVisibility, ExecutionMode, PyNoteConfig } from "./types.js";
/** A PyNote code cell. Cells on a page share one Python runtime, in page order. */
export declare function PyNoteCell(props: CellOptions): JSX.Element;
/** Configure the notebook every cell on the page shares. */
export declare function configure(config: PyNoteConfig): void;
`,
    "element.d.ts": `import type { CellOptions, PyNoteConfig } from "./types.js";
export type { CellOptions, PyNoteConfig } from "./types.js";
/** Configure the notebook every cell on the page shares. */
export declare function configure(config: PyNoteConfig): void;
/** Each option the element takes as an attribute (besides \`code\` and \`cell-id\`), by attribute name. */
export declare const BOOLEAN_ATTRIBUTES: Readonly<Record<string, Exclude<keyof CellOptions, "code" | "id">>>;
export declare function cellOptions(element: Element): CellOptions;
export declare function readPageConfig(root?: ParentNode): void;
export declare function dedent(text: string): string;
declare global {
  interface HTMLElementTagNameMap {
    "pynote-cell": HTMLElement;
  }
}
`,
    "astro.d.ts": `import type { CellOptions, PyNoteConfig as Config } from "./types.js";
type AstroComponent<Props> = (props: Props) => unknown;
/** A PyNote code cell for Astro pages and MDX. */
export declare const PyNoteCell: AstroComponent<CellOptions>;
/** The notebook every cell on the page shares (theme, execution mode, view settings). */
export declare const PyNoteConfig: AstroComponent<{ config: Config }>;
`,
  };
  for (const [name, content] of Object.entries(types)) writeFileSync(path.join(PKG, "types", name), content);

  copyFileSync(path.join(ROOT, "LICENSE"), path.join(PKG, "LICENSE"));
  console.log(`pynote ${version} built in ${path.relative(ROOT, PKG)}`);
}

await main();
