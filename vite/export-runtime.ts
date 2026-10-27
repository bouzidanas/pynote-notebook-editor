import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build, type Plugin } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// Builds the standalone runtime that HTML exports ship, next to the app:
//
//   export-runtime/app.js      the PyNote UI as one classic script (a page
//                              opened from file:// runs classic scripts, not
//                              external modules, and cannot fetch chunks)
//   export-runtime/app.css     its styles (library builds inline the fonts as
//                              data URIs; exports keep only the faces they need)
//   export-runtime/worker.js   the kernel worker as a classic script
//   export-runtime/manifest.json  files, sizes, hashes and font metadata
//
// The exporter (src/lib/export/web-app.ts) fetches these from the running
// PyNote and assembles the export. `vite build` writes them into the app's
// output; the dev server builds them on first request and rebuilds after
// source changes.

const ROOT = path.resolve(import.meta.dirname, "..");
export const RUNTIME_DIR = "export-runtime";

// The standalone app ships only the tutorial among the built-in notebooks.
const standaloneNotebooks = (): Plugin => ({
  name: "pynote-standalone-notebooks",
  enforce: "pre",
  resolveId(source, importer) {
    if (
      importer?.replace(/\\/g, "/").endsWith("/src/lib/notebooks/index.ts") &&
      /^\.\/(no-magic|testing|coding-interview-prep)$/.test(source)
    ) {
      return path.join(ROOT, "src/export-runtime/no-notebooks.ts");
    }
    return null;
  },
});

export interface RuntimeFont {
  family: string;
  style: string;
  weight: string;
  unicodeRange?: string;
  // Size of the face's sources in app.css, per format.
  bytes: Record<string, number>;
}

export interface RuntimeManifest {
  version: 1;
  files: Record<string, { bytes: number; sha256: string }>;
  fonts: RuntimeFont[];
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

// Every @font-face in the runtime CSS (a summary for size estimates; the
// exporter filters the CSS itself, see src/lib/export/fonts.ts).
const readFonts = (css: string): RuntimeFont[] => {
  const fonts: RuntimeFont[] = [];
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = block[1];
    const prop = (name: string) => new RegExp(`${name}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim();
    const family = prop("font-family")?.replace(/^["']|["']$/g, "");
    if (!family) continue;
    const range = prop("unicode-range");
    const bytes: Record<string, number> = {};
    for (const src of body.matchAll(/url\(([^)]+)\)\s*format\(["']?([^"')]+)["']?\)/g)) bytes[src[2]] = src[1].length;
    fonts.push({ family, style: prop("font-style") ?? "normal", weight: prop("font-weight") ?? "400", ...(range ? { unicodeRange: range } : {}), bytes });
  }
  return fonts;
};

const listFiles = (dir: string, prefix = ""): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(full).isDirectory() ? listFiles(full, rel) : [rel];
  });

/** Build the runtime into `outDir`. */
export async function buildExportRuntime(outDir: string, options: { minify: boolean }): Promise<RuntimeManifest> {
  const common = { configFile: false as const, root: ROOT, logLevel: "warn" as const, envFile: false as const, publicDir: false as const };
  await build({
    ...common,
    plugins: [standaloneNotebooks(), solid(), tailwindcss()],
    // Library builds leave process.env.NODE_ENV for consumers; this one is the app.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir,
      emptyOutDir: true,
      target: "es2022",
      minify: options.minify,
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      reportCompressedSize: false,
      lib: { entry: path.join(ROOT, "src/export-runtime/main.tsx"), formats: ["iife"], name: "PyNoteRuntime", fileName: () => "app.js", cssFileName: "app" },
      rollupOptions: { output: { inlineDynamicImports: true, assetFileNames: "[name][extname]" } },
    },
  });
  await build({
    ...common,
    build: {
      outDir,
      emptyOutDir: false,
      target: "es2022",
      minify: options.minify,
      reportCompressedSize: false,
      lib: { entry: path.join(ROOT, "src/lib/pyodide.worker.ts"), formats: ["iife"], name: "PyNoteKernelWorker", fileName: () => "worker.js" },
    },
  });

  const files: RuntimeManifest["files"] = {};
  for (const rel of listFiles(outDir)) {
    if (rel === "manifest.json") continue;
    const full = path.join(outDir, rel);
    files[rel] = { bytes: statSync(full).size, sha256: sha256(full) };
  }
  const manifest: RuntimeManifest = { version: 1, files, fonts: readFonts(readFileSync(path.join(outDir, "app.css"), "utf8")) };
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  return manifest;
}

const MIME: Record<string, string> = {
  ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

/** Vite plugin: builds the runtime with the app, and serves it in dev. */
export function exportRuntime(): Plugin {
  let outDir = "";
  let isBuild = false;
  return {
    name: "pynote-export-runtime",
    configResolved(config) {
      isBuild = config.command === "build";
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (!isBuild) return;
      await buildExportRuntime(path.join(outDir, RUNTIME_DIR), { minify: true });
    },
    configureServer(server) {
      const devDir = path.join(server.config.cacheDir, RUNTIME_DIR);
      let pending: Promise<unknown> | null = null;
      let stale = true;
      server.watcher.on("all", (_event, file) => {
        if (file.startsWith(path.join(ROOT, "src"))) stale = true;
      });
      const ensureBuilt = () => {
        if (stale || !pending) {
          stale = false;
          pending = buildExportRuntime(devDir, { minify: false }).catch((err) => {
            stale = true;
            throw err;
          });
        }
        return pending;
      };
      server.middlewares.use(`/${RUNTIME_DIR}`, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
        ensureBuilt().then(
          () => {
            const file = path.join(devDir, rel);
            if (!file.startsWith(devDir) || !existsSync(file) || statSync(file).isDirectory()) return next();
            res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
            res.setHeader("Cache-Control", "no-store");
            res.end(readFileSync(file));
          },
          (err) => {
            res.statusCode = 500;
            res.end(`Export runtime build failed: ${err instanceof Error ? err.message : String(err)}`);
          },
        );
      });
    },
  };
}
