import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exportFontNeeds } from "../../src/lib/export/fonts";
import { assembleWebApp } from "../../src/lib/export/web-app";
import { WEB_APP_PAYLOAD_VERSION } from "../../src/lib/export/web-app-payload";
import type { NotebookDocument } from "../../src/lib/formats/document";
import { installFilePickerStubs, writtenFiles } from "../support/file-pickers";
import { TESTID } from "../support/selectors";
import { EXPORTS_DIR, SERVER_ENV } from "./build-exports";

// An interactive web app keeps the reader's edits in a session named after
// the export. The session leaves out what the export itself carries (cell
// attachments, other tools' metadata): after a reload they come back from the
// export, so the reader's own Save still writes them.

const IMAGE = "iVBORw0KGgo".padEnd(200_000, "E");
const WIDGETS = { "application/vnd.jupyter.widget-state+json": { state: {}, version_major: 2 } };
const DOCUMENT: NotebookDocument = {
  metadata: {
    kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
    widgets: WIDGETS,
    PyNote: { executionMode: "hybrid", autorun: false, history: [] },
  },
  cells: [
    { id: "pic", type: "markdown", source: "Screenshot: ![s](attachment:s.png)", metadata: {}, attachments: { "s.png": { "image/png": IMAGE } } },
    { id: "code", type: "code", source: "x = 1", metadata: { tags: ["t"] } },
  ],
};

const root = path.resolve(import.meta.dirname, "../..");
const EXPORT_DIR = path.join(EXPORTS_DIR, "interactive-attachments");

test.beforeAll(async () => {
  const runtimeFile = (name: string) => readFileSync(path.join(root, "dist/export-runtime", name), "utf8");
  const files = await assembleWebApp({
    runtime: { appJs: runtimeFile("app.js"), appCss: runtimeFile("app.css"), workerJs: runtimeFile("worker.js") },
    payload: {
      pynoteExport: WEB_APP_PAYLOAD_VERSION,
      exportId: "test-interactive-attachments",
      filename: "Attachments.ipynb",
      mode: "interactive",
      startInPresentation: false,
      document: DOCUMENT,
      theme: {},
      codeVisibility: {},
      pyodide: { kind: "cdn", indexURL: `${process.env[SERVER_ENV]}/pyodide/` },
    },
    fonts: exportFontNeeds({ fonts: ["JetBrains Mono Variable"], content: DOCUMENT, interactive: true }),
    layout: "single",
    title: "Attachments",
    colors: { background: "#1e1e2e", text: "#cdd6f4" },
  });
  for (const [rel, content] of files) {
    mkdirSync(path.dirname(path.join(EXPORT_DIR, rel)), { recursive: true });
    writeFileSync(path.join(EXPORT_DIR, rel), content);
  }
});

test("interactive export: edits survive a reload, and Save keeps the export's attachments", async ({ page }) => {
  await installFilePickerStubs(page);
  await page.context().route(/^https?:/, (route) =>
    route.request().url().startsWith(process.env[SERVER_ENV]!) ? route.continue() : route.abort("internetdisconnected"),
  );
  await page.goto(pathToFileURL(path.join(EXPORT_DIR, "index.html")).href);
  const code = page.locator(`[data-testid="${TESTID.cell}"][data-cell-id="code"] .cm-content`);
  await expect(code).toContainText("x = 1");
  await code.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" + 1");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(code).toContainText("x = 1 + 1");
  // The session holds the reader's edits, not the export's image.
  const sessionSize = await page.evaluate(() => localStorage.getItem("pynote-session-export-test-interactive-attachments")?.length ?? -1);
  expect(sessionSize).toBeGreaterThan(0);
  expect(sessionSize).toBeLessThan(50_000);

  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await writtenFiles(page)).length).toBe(1);
  const saved = JSON.parse((await writtenFiles(page))[0].content);
  expect(saved.cells.map((c: { id: string }) => c.id)).toEqual(["pic", "code"]);
  expect(saved.cells[0].attachments["s.png"]["image/png"]).toBe(IMAGE);
  expect(saved.cells[1].source.join("")).toBe("x = 1 + 1");
  expect(saved.cells[1].metadata).toEqual({ tags: ["t"] });
  expect(saved.metadata.widgets).toEqual(WIDGETS);
});
