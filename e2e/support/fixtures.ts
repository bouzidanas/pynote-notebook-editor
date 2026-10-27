import { test as base } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { NotebookPage } from "../pages/NotebookPage";
import { PYODIDE_CDN_URL, PYODIDE_VERSION } from "../../src/lib/pyodide-config";

/**
 * Custom fixtures layered on top of Playwright's base test. Importing `test`
 * and `expect` from here (instead of `@playwright/test`) gives every spec a
 * ready-made `notebook` page object, keeping specs free of setup boilerplate.
 *
 * Add new page objects / shared state as additional fixtures here so the wiring
 * stays in one place.
 */
type Fixtures = {
  notebook: NotebookPage;
  pyodideMirror: void;
};

const MIRROR = path.resolve(import.meta.dirname, "../../.cache/pyodide", PYODIDE_VERSION);
const CDN_PATH = new URL(PYODIDE_CDN_URL).pathname;

const contentType = (name: string) =>
  name.endsWith(".wasm") ? "application/wasm"
    : name.endsWith(".js") || name.endsWith(".mjs") ? "text/javascript"
    : name.endsWith(".json") ? "application/json"
    : "application/octet-stream";

export const test = base.extend<Fixtures>({
  // Every Pyodide request (the kernel's worker included) is answered from the
  // local mirror (scripts/fetch-pyodide-mirror.mjs), so the suite never
  // depends on the network or the CDN's speed. A file the mirror lacks fails
  // the test with the name to add, instead of silently going online.
  pyodideMirror: [
    async ({ context }, use) => {
      if (!existsSync(path.join(MIRROR, "pyodide-lock.json"))) {
        throw new Error("The Pyodide mirror is missing: run `node scripts/fetch-pyodide-mirror.mjs`.");
      }
      const missing: string[] = [];
      await context.route(`${PYODIDE_CDN_URL}**`, async (route) => {
        const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(CDN_PATH.length));
        const file = path.join(MIRROR, name);
        if (name.includes("..") || !existsSync(file)) {
          missing.push(name);
          await route.abort();
          return;
        }
        await route.fulfill({ path: file, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": contentType(name) } });
      });
      await use();
      if (missing.length > 0) {
        throw new Error(`Not in the Pyodide mirror: ${missing.join(", ")}. Add the package to scripts/fetch-pyodide-mirror.mjs.`);
      }
    },
    { auto: true },
  ],

  notebook: async ({ page }, use) => {
    await use(new NotebookPage(page));
  },
});

export { expect } from "@playwright/test";
