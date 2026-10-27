import { test, expect } from "../support/fixtures";
import { type Browser, type BrowserContext, type Download, type Page, type PlaywrightWorkerArgs, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installFilePickerStubs, queueFileToOpen, setFolderEntries, writtenFiles } from "../support/file-pickers";
import { ExportDialog } from "../pages/ExportDialog";
import { NotebookPage } from "../pages/NotebookPage";
import { TESTID } from "../support/selectors";
import { type JsonObject, type NotebookDocument, PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO } from "../../src/lib/formats/document";
import { serializeIpynb } from "../../src/lib/formats/ipynb";
import { UI_MIME } from "../../src/lib/output-markers";
import { PYODIDE_CDN_URL, PYODIDE_VERSION } from "../../src/lib/pyodide-config";

/**
 * The Export dialog in the real app: every format through the UI, with the
 * File System Access pickers stubbed (and removed, for the download path
 * other browsers take). Format details are unit-tested next to each format;
 * this covers what a user does and gets.
 */

const notebookFile = (name: string, cells: NotebookDocument["cells"], pynote: JsonObject = {}) => ({
  name,
  content: serializeIpynb({
    metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { executionMode: "hybrid", autorun: false, history: [], ...pynote } },
    cells,
  }),
});

const intro = { id: "intro", type: "markdown" as const, source: "# Export fixture\n\nProse with **bold** text.", metadata: {} };
const define = { id: "define", type: "code" as const, source: "total = 40 + 2", metadata: {} };
const use = { id: "use", type: "code" as const, source: 'print(f"total={total}")', metadata: {} };
const widget = { id: "widget", type: "code" as const, source: "from pynote_ui import Slider\nSlider(value=7, min=0, max=10, label='Level')", metadata: {} };

const ORDERED = notebookFile("fixture.ipynb", [intro, define, use, widget]);
const OUT_OF_ORDER = notebookFile("fixture.ipynb", [intro, use, define]);

async function openNotebook(page: Page, notebook: NotebookPage, file: { name: string; content: string }, cellCount: number) {
  await notebook.goto();
  await queueFileToOpen(page, file);
  await page.keyboard.press("Control+o");
  await expect(notebook.cells).toHaveCount(cellCount);
  await expect(notebook.cells.first()).toHaveAttribute("data-cell-id", "intro");
}

/** The payload a web app export embeds: what any reader can see in the page source. */
const payloadOf = (html: string) => JSON.parse(/<script type="application\/json" id="pynote-export">([\s\S]*?)<\/script>/.exec(html)![1]);

// Whether each family has faces the page could load. load() resolves to the
// faces it loaded (check() would also be true for a family with no faces).
const loadedFaces = (page: Page, families: string[]) =>
  page.evaluate(
    (names) =>
      Promise.all(
        names.map(async (name) => {
          const faces = await document.fonts.load(`16px ${name}`, "x");
          return faces.length > 0 && faces.every((face) => face.status === "loaded");
        }),
      ),
    families,
  );

// Opens an exported page the way a reader does: from disk, offline, and
// optionally with JavaScript off.
async function openExport(browser: Browser, file: string, options: { javaScriptEnabled?: boolean } = {}) {
  const context = await browser.newContext({ offline: true, ...options });
  const reader = await context.newPage();
  await reader.goto(pathToFileURL(file).href);
  return { reader, close: () => context.close() };
}

// Exports a read-only web app through the dialog: a single HTML file, or the
// static page without JavaScript.
async function exportReadOnly(dialog: ExportDialog, staticHtml: boolean) {
  await dialog.open();
  await dialog.choose("webapp");
  await dialog.pick("Mode", "Read-only");
  await dialog.setOption("Static (no JavaScript)", staticHtml);
  if (!staticHtml) await dialog.pick("Files", "Single file");
  const [file] = await dialog.exportAndCollect(1, 120_000);
  return file;
}

// What a reader gets from downloads: each file, and each file of a
// downloaded .zip (read by Python's zipfile, which checks every entry).
async function deliveredFiles(downloads: readonly Download[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const download of downloads) {
    const file = await download.path();
    if (!download.suggestedFilename().endsWith(".zip")) {
      files[download.suggestedFilename()] = readFileSync(file, "utf8");
      continue;
    }
    const script = [
      "import json, sys, zipfile",
      "z = zipfile.ZipFile(sys.argv[1])",
      "assert z.testzip() is None",
      "print(json.dumps({n: z.read(n).decode('utf-8') for n in z.namelist()}))",
    ].join("\n");
    Object.assign(files, JSON.parse(execFileSync("python3", ["-I", "-c", script, file], { encoding: "utf8", maxBuffer: 1 << 28 })));
  }
  return files;
}

// What differs between engines runs in WebKit too: downloads (Safari keeps
// only the last of several downloads started together) and keyboard focus
// (Safari, by default, tabs to text fields only). The suite's project is
// Chromium: WebKit gets a browser of its own, with Pyodide answered from the
// local mirror as the suite's pyodideMirror fixture does for its page (WebKit
// routes the kernel worker's requests too; Firefox does not route its module
// imports, so it would load Pyodide from the network).
const ENGINES = ["chromium", "webkit"] as const;
type Engine = (typeof ENGINES)[number];

const PYODIDE_MIRROR = path.resolve(import.meta.dirname, "../../.cache/pyodide", PYODIDE_VERSION);

async function answerFromPyodideMirror(context: BrowserContext): Promise<string[]> {
  const missing: string[] = [];
  const base = new URL(PYODIDE_CDN_URL).pathname;
  await context.route(`${PYODIDE_CDN_URL}**`, async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(base.length));
    const file = path.join(PYODIDE_MIRROR, name);
    if (name.includes("..") || !existsSync(file)) {
      missing.push(name);
      await route.abort();
      return;
    }
    const type = name.endsWith(".wasm") ? "application/wasm" : /\.m?js$/.test(name) ? "text/javascript" : name.endsWith(".json") ? "application/json" : "application/octet-stream";
    await route.fulfill({ path: file, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": type } });
  });
  return missing;
}

/** Runs `body` on a page of the engine: the suite's own page in Chromium, a page of a WebKit browser otherwise. */
async function inEngine(
  engine: Engine,
  { page, playwright, baseURL }: { page: Page; playwright: PlaywrightWorkerArgs["playwright"]; baseURL: string | undefined },
  body: (page: Page) => Promise<void>,
): Promise<void> {
  if (engine === "chromium") return body(page);
  const browser = await playwright.webkit.launch();
  try {
    const context = await browser.newContext({ ...devices["Desktop Safari"], baseURL });
    const missing = await answerFromPyodideMirror(context);
    await body(await context.newPage());
    expect(missing, "files the Pyodide mirror lacks (scripts/fetch-pyodide-mirror.mjs)").toEqual([]);
  } finally {
    await browser.close();
  }
}

test.describe("Export dialog", () => {
  test.beforeEach(async ({ page }) => {
    await installFilePickerStubs(page);
  });

  test("opens from the menu or Ctrl+E, closes with Escape, and keeps typing to itself", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    // A selected cell must not react to keys typed in the dialog.
    await notebook.cells.nth(1).click({ position: { x: 5, y: 5 } });
    await dialog.open();
    // A first export preselects .ipynb, the default file format.
    await expect(dialog.selectedFormat).toHaveAttribute("data-format", "ipynb");
    await expect(dialog.extension).toHaveText(".ipynb");
    await dialog.filename.click();
    await page.keyboard.type("bamyr");
    await expect(dialog.filename).toHaveValue("fixturebamyr");
    await expect(notebook.cells).toHaveCount(4);
    await expect(notebook.cells.nth(1)).toHaveAttribute("data-cell-type", "code");
    await page.keyboard.press("Escape");
    await expect(dialog.root).toBeHidden();

    await page.getByRole("button", { name: "Options" }).click();
    await page.getByRole("menuitem", { name: "Export" }).click();
    await expect(dialog.root).toBeVisible();
    await expect(dialog.filename).toHaveValue("fixture");
  });

  test("lists .ipynb first and starts on it; after that, opens on the last format used", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    const formats = dialog.root.getByRole("radiogroup", { name: "Format" }).getByRole("radio");
    await expect(formats).toHaveText([/^Jupyter/, /^PyNote/, /^Python(?! \+)/, /^Markdown/, /^Python \+ Markdown/, /^Web app/, /^Component/]);
    await expect(dialog.selectedFormat).toHaveAttribute("data-format", "ipynb");

    await dialog.choose("markdown");
    await dialog.exportAndCollect();
    await dialog.open();
    await expect(dialog.selectedFormat).toHaveAttribute("data-format", "markdown");
    await expect(dialog.extension).toHaveText(".md");
  });

  test("exports .pynote and .ipynb under the chosen name", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);

    await dialog.open();
    await dialog.choose("pynote");
    await expect(dialog.extension).toHaveText(".pynote");
    await dialog.setFilename("Report");
    const [pynote] = await dialog.exportAndCollect();
    expect(pynote.name).toBe("Report.pynote");
    expect(pynote.content.startsWith("---\npynote: 1\n")).toBe(true);
    expect(pynote.content).toContain("total = 40 + 2");

    await dialog.open();
    await dialog.choose("ipynb");
    await expect(dialog.extension).toHaveText(".ipynb");
    const [ipynb] = await dialog.exportAndCollect();
    expect(ipynb.name).toBe("fixture.ipynb");
    const json = JSON.parse(ipynb.content);
    expect(json.cells.map((c: { id: string }) => c.id)).toEqual(["intro", "define", "use", "widget"]);
    expect(json.metadata.PyNote).toBeTruthy();
  });

  test("a clean Jupyter copy leaves out PyNote's settings", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    await dialog.choose("ipynb");
    await dialog.setOption("Clean copy", true);
    await dialog.showPreview();
    await expect(dialog.preview).toContainText('"nbformat": 4');
    await expect(dialog.preview).not.toContainText('"PyNote"');
    const [file] = await dialog.exportAndCollect();
    expect(JSON.parse(file.content).metadata.PyNote).toBeUndefined();
  });

  test("Markdown can leave out code, with a warning", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    await dialog.choose("markdown");
    await dialog.showPreview();
    await expect(dialog.preview).toContainText("total = 40 + 2");
    await dialog.setOption("Include code", false);
    await expect(dialog.root.getByRole("alert")).toContainText("cannot be recovered");
    await dialog.showPreview();
    await expect(dialog.preview).not.toContainText("total = 40 + 2");
    const [file] = await dialog.exportAndCollect();
    expect(file.name).toBe("fixture.md");
    expect(file.content).toContain("# Export fixture");
    expect(file.content).not.toContain("total = 40 + 2");
  });

  test("the Python export orders cells so the script runs, checked without touching the notebook", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, OUT_OF_ORDER, 3);
    await notebook.waitForKernelReady();
    await dialog.open();
    await dialog.choose("python");
    await expect(dialog.scriptCheck).toHaveAttribute("data-status", "passed", { timeout: 60_000 });
    await expect(dialog.root).toContainText("The script runs cells 2 and 3 in a different order than the notebook");
    const [file] = await dialog.exportAndCollect();
    expect(file.name).toBe("fixture.py");
    expect(file.content.indexOf("total = 40 + 2")).toBeGreaterThan(-1);
    expect(file.content.indexOf("total = 40 + 2")).toBeLessThan(file.content.indexOf('print(f"total={total}")'));
    expect(file.content).toContain("# # Export fixture");

    // The notebook itself ran nothing and kept its order.
    await expect(page.getByTestId(TESTID.cellOutput)).toHaveCount(0);
    await expect(page.getByTestId(TESTID.cellResult)).toHaveCount(0);
    await expect(notebook.cells.nth(1)).toHaveAttribute("data-cell-id", "use");
    // Its kernel kept running, and never saw the script: `total`, which the
    // check defined, is still undefined there.
    await expect(notebook.kernelStatus).toHaveAttribute("data-status", "ready");
    await notebook.runCell(1);
    await expect(notebook.cells.nth(1)).toContainText("NameError: name 'total' is not defined", { timeout: 30_000 });
    // And it kept its execution mode (the order came from reactive mode's
    // analysis, in the throwaway kernel).
    const before = (await writtenFiles(page)).length;
    await page.keyboard.press("Control+s");
    await expect.poll(async () => (await writtenFiles(page)).length).toBe(before + 1);
    const saved = (await writtenFiles(page)).at(-1)!;
    expect(saved.name).toBe("fixture.ipynb");
    expect(JSON.parse(saved.content).metadata.PyNote.executionMode).toBe("hybrid");
  });

  test("the script check runs again only when the script changes", async ({ page, notebook }) => {
    // Count the scripts checked: run_script messages to the check's worker.
    await page.addInitScript(() => {
      const post = Worker.prototype.postMessage;
      (window as unknown as { scriptRuns: number }).scriptRuns = 0;
      Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: unknown[]) {
        if ((message as { type?: string } | null)?.type === "run_script") (window as unknown as { scriptRuns: number }).scriptRuns++;
        return (post as (...args: unknown[]) => void).call(this, message, ...rest);
      } as typeof post;
    });
    const runs = () => page.evaluate(() => (window as unknown as { scriptRuns: number }).scriptRuns);
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    await dialog.choose("python");
    await expect(dialog.scriptCheck).toHaveAttribute("data-status", "passed", { timeout: 60_000 });
    expect(await runs()).toBe(1);

    // A .py script does not contain its file name: typing one checks nothing again.
    await dialog.filename.click();
    await page.keyboard.type("-final");
    await expect(dialog.filename).toHaveValue("fixture-final");
    await expect(dialog.scriptCheck).toHaveAttribute("data-status", "passed");
    expect(await runs()).toBe(1);

    // An option that changes the script checks the new one, once.
    await dialog.setOption("Include markdown as comments", false);
    await expect(dialog.scriptCheck).toHaveAttribute("data-status", "passed", { timeout: 60_000 });
    expect(await runs()).toBe(2);

    // The pair's .py names its .md, so a new name is a new script.
    await dialog.choose("pair");
    await expect(dialog.scriptCheck).toHaveAttribute("data-status", "passed", { timeout: 60_000 });
    expect(await runs()).toBe(3);
    await dialog.setFilename("report");
    await expect(dialog.scriptCheck).toHaveAttribute("data-status", "passed", { timeout: 60_000 });
    expect(await runs()).toBe(4);
  });

  test("a script that fails says which cell, also after code with a line like a cell marker", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    // Code pasted from a VS Code or Spyder script keeps its "# %%" lines,
    // which the exported script holds as they are.
    const pasted = { id: "pasted", type: "code" as const, source: "total = 40 + 2\n# %%\nhalf = total / 2", metadata: {} };
    const boom = { id: "boom", type: "code" as const, source: "print(total)\n1 / 0", metadata: {} };
    const after = { id: "after", type: "code" as const, source: "print(half)", metadata: {} };
    await openNotebook(page, notebook, notebookFile("broken.ipynb", [intro, pasted, boom, after]), 4);
    await dialog.open();
    await dialog.choose("python");
    await expect(dialog.scriptCheck).toHaveAttribute("data-status", "failed", { timeout: 60_000 });
    await expect(dialog.scriptCheck).toContainText("Stops with an error in cell 3");
    await expect(dialog.scriptCheck).toContainText("ZeroDivisionError");
  });

  test("the pair export writes both files to a folder", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    await dialog.choose("pair");
    await expect(dialog.extension).toHaveText(".py + .md");
    await expect(dialog.scriptCheck).toHaveAttribute("data-status", "passed", { timeout: 60_000 });
    const files = await dialog.exportAndCollect(2);
    expect(files.map((f) => f.name).sort()).toEqual(["fixture.md", "fixture.py"]);
    const py = files.find((f) => f.name === "fixture.py")!;
    const md = files.find((f) => f.name === "fixture.md")!;
    expect(py.content).toContain('# %% id="define"\ntotal = 40 + 2');
    expect(py.content).not.toContain("Prose with");
    expect(md.content).toContain("<!-- cell intro -->\n# Export fixture\n\nProse with **bold** text.");
    expect(md.content).toContain("<!-- code define -->");
    expect(md.content).not.toContain("total = 40 + 2");
  });

  test("the pair export asks before replacing files in the folder", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await setFolderEntries(page, ["fixture.py"]);
    await dialog.open();
    await dialog.choose("pair");
    let message = "";
    page.once("dialog", (d) => {
      message = d.message();
      void d.dismiss();
    });
    await dialog.exportButton.click();
    await expect.poll(() => message).toContain("Replace fixture.py");
    await expect(dialog.root).toBeVisible();
    expect(await writtenFiles(page)).toEqual([]);
  });

  test("a web app folder never replaces a folder of that name that is not a PyNote export", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    // The picked folder already holds the user's own project folder named like the notebook.
    const project = ["fixture/data.csv", "fixture/fixture.ipynb"];
    await setFolderEntries(page, project);
    await dialog.open();
    await dialog.choose("webapp");
    await dialog.pick("Mode", "Interactive");
    await dialog.pick("Python", "From CDN");
    await dialog.pick("Files", "Folder");
    let asked = false;
    page.on("dialog", (d) => {
      asked = true;
      void d.accept();
    });
    await dialog.exportButton.click();
    await expect(dialog.status).toContainText("not a PyNote export, so nothing was changed");
    await expect(dialog.root).toBeVisible();
    expect(asked).toBe(false);
    expect(await writtenFiles(page)).toEqual([]);
    // Its files are all still there, and nothing was added (the stub also
    // lists folders it was asked about, as "name/").
    const files = (await page.evaluate(() => window.__pynoteFilePickers!.folderEntries)).filter((entry) => !entry.endsWith("/"));
    expect(files).toEqual(project);
  });

  test("the component export saves the notebook's settings for the pynote package", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    await dialog.choose("component");
    await dialog.pick("Framework", "React");
    await dialog.showPreview();
    await expect(dialog.setupCommand).toHaveText("npx pynote add");
    await expect(dialog.preview).toContainText('from "pynote/react"');
    await expect(dialog.preview).toContainText("total = 40 + 2");
    await dialog.setOption("Lock execution mode", true);
    await expect(dialog.filename).toHaveValue("pynote.config");
    const [file] = await dialog.exportAndCollect();
    expect(file.name).toBe("pynote.config.json");
    expect(JSON.parse(file.content)).toEqual({
      executionMode: "hybrid",
      lockExecutionMode: true,
      editable: true,
      menu: true,
      autorun: false,
      theme: {},
      codeVisibility: {},
    });
  });

  test("the component export carries the notebook's theme, as what differs from PyNote's", async ({ page, notebook }) => {
    // A first visit: nothing saved in the browser yet.
    const theme = { colors: { background: "#f6f0e5", primary: "#ec225c" }, radii: { sm: "0.25rem" }, componentBorder: "2px solid var(--secondary)" };
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, notebookFile("fixture.ipynb", [intro, define, use], { theme }), 3);
    await expect.poll(() => notebook.cssVariable("--background")).toBe("#f6f0e5");
    await dialog.open();
    await dialog.choose("component");
    const [file] = await dialog.exportAndCollect();
    expect(JSON.parse(file.content).theme).toEqual(theme);
  });

  test("the component export's theme is the look alone, not the app's save-to-notebook setting", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    // PyNote's default theme, saved into the notebook from the Theme dialog.
    await page.getByRole("button", { name: "Options" }).click();
    await page.getByRole("menuitem", { name: "Theme" }).click();
    await page.getByText("Save settings to .ipynb").click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.open();
    await dialog.choose("component");
    await expect(dialog.root.getByRole("radiogroup", { name: "Theme" })).toHaveAccessibleDescription("This notebook uses PyNote's default theme.");
    const [file] = await dialog.exportAndCollect();
    expect(JSON.parse(file.content).theme).toEqual({});
  });

  test("the component settings say how to set it up in a website", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    await dialog.choose("component");
    const steps = page.getByTestId(TESTID.exportSetupSteps).getByRole("listitem");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText("npx pynote add");
    await expect(steps.nth(1)).toContainText("pynote.config.json");
    await expect(steps.nth(2)).toContainText("shows the code for Astro");

    // The steps follow the file name and the framework.
    await dialog.setFilename("site");
    await expect(steps.nth(1)).toContainText("site.json");
    await dialog.pick("Framework", "React");
    await expect(steps.nth(2)).toContainText("shows the code for React");

    // Preview, in the last step, opens the usage code: it names its file, and imports the
    // config by its name from the project's root folder (step 2).
    await steps.nth(2).getByRole("button", { name: "Preview" }).click();
    await expect(dialog.preview).toContainText("// src/Notebook.tsx, with site.json in the project's folder.");
    await expect(dialog.preview).toContainText('from "pynote/react"');
    await expect(dialog.preview).toContainText('import config from "../site.json"');
  });

  test("every setting of the component config can be chosen in the dialog", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    await dialog.choose("component");
    // The execution mode starts as the notebook's.
    await expect(dialog.root.getByRole("radiogroup", { name: "Execution mode" }).getByRole("radio", { checked: true })).toHaveText("Hybrid");
    await dialog.pick("Execution mode", "Reactive");
    await dialog.setOption("Run on page load", true);
    await dialog.setOption("Editable code", false);
    await dialog.setOption("Cell menu", false);
    await dialog.pick("Theme", "PyNote's default");
    await dialog.pick("View", "PyNote's default");
    await dialog.pick("Load Pyodide from", "Your site");
    // Named by its label; its hint describes it, and names what the folder
    // needs: Pyodide's full release (the npm package lacks micropip and the
    // packages, so Python would not start).
    const folder = dialog.root.getByRole("textbox", { name: "Folder URL", exact: true });
    await expect(folder).toHaveAccessibleDescription(`Put the files of Pyodide's full release (pyodide-${PYODIDE_VERSION}.tar.bz2, from Pyodide's releases) in this folder of your site.`);
    await folder.fill("/static/pyodide");

    await dialog.showPreview();
    await dialog.root.getByRole("tablist", { name: "Show" }).getByRole("tab", { name: "pynote.config.json" }).click();
    await expect(dialog.preview).toContainText('"pyodideUrl": "/static/pyodide/"');

    const [file] = await dialog.exportAndCollect();
    expect(JSON.parse(file.content)).toEqual({
      executionMode: "reactive",
      lockExecutionMode: false,
      editable: false,
      menu: false,
      autorun: true,
      theme: {},
      codeVisibility: {},
      pyodideUrl: "/static/pyodide/",
    });

    // The choices come back next time, except the execution mode: that one is the notebook's.
    await dialog.open();
    await expect(dialog.option("Run on page load")).toHaveAttribute("aria-checked", "true");
    await expect(dialog.root.getByRole("textbox", { name: "Folder URL", exact: true })).toHaveValue("/static/pyodide");
    await expect(dialog.root.getByRole("radiogroup", { name: "Execution mode" }).getByRole("radio", { checked: true })).toHaveText("Hybrid");
  });

  test("opens on the format's settings; the preview shows what will be written", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    await dialog.choose("python");
    await expect(dialog.settings).toBeVisible();
    await expect(dialog.option("Include markdown as comments")).toBeVisible();
    await expect(dialog.preview).toBeHidden();
    await dialog.showPreview();
    await expect(dialog.preview).toContainText("total = 40 + 2");
    await expect(dialog.settings).toBeHidden();
    // The preview tab stays while formats change; the web app, with nothing to preview, shows its settings.
    await dialog.choose("markdown");
    await expect(dialog.preview).toContainText("# Export fixture");
    await dialog.choose("webapp");
    await expect(dialog.root.getByRole("tab", { name: "Preview" })).toHaveCount(0);
    await expect(dialog.root.getByRole("radiogroup", { name: "Mode" })).toBeVisible();
    await dialog.choose("pair");
    await expect(dialog.preview).toContainText('# %% id="define"');
  });

  test("fits a phone screen: every format, its settings and Export are reachable", async ({ page, notebook }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await dialog.open();
    for (const format of ["pynote", "ipynb", "python", "markdown", "pair", "webapp", "component"] as const) {
      await expect(dialog.root.locator(`[data-format="${format}"]`)).toBeInViewport();
    }
    await dialog.choose("webapp");
    const files = dialog.root.getByRole("radiogroup", { name: "Files" });
    await files.scrollIntoViewIfNeeded();
    await expect(files).toBeInViewport();
    await expect(dialog.exportButton).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await dialog.root.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });

  test("web app: interactive with Python included runs offline from disk", async ({ page, notebook, browser }, testInfo) => {
    test.setTimeout(300_000);
    const dialog = new ExportDialog(page);
    // An import after a semicolon must be bundled too: Pyodide finds it when the cell runs.
    const zone = { id: "zone", type: "code" as const, source: "x = 1; import pytz\nprint('tz=' + pytz.utc.zone)", metadata: {} };
    await openNotebook(page, notebook, notebookFile("fixture.ipynb", [intro, define, use, widget, zone]), 5);
    await dialog.open();
    await dialog.choose("webapp");
    await dialog.pick("Mode", "Interactive");
    await dialog.pick("Python", "Included (offline)");
    await dialog.pick("Files", "Single file");
    await expect(dialog.extension).toHaveText(".html");
    const [file] = await dialog.exportAndCollect(1, 240_000);
    expect(file.name).toBe("fixture.html");
    const target = testInfo.outputPath("fixture.html");
    writeFileSync(target, file.content);

    const offline = await browser.newContext({ offline: true });
    try {
      const reader = await offline.newPage();
      const errors: string[] = [];
      reader.on("pageerror", (e) => errors.push(e.message));
      await reader.goto(pathToFileURL(target).href);
      await expect(reader).toHaveTitle("fixture");
      await expect(reader.getByTestId(TESTID.kernelStatus)).toHaveAttribute("data-status", "ready", { timeout: 90_000 });
      await reader.keyboard.press("Alt+r");
      await expect(reader.locator('[data-cell-id="use"]').getByTestId(TESTID.cellOutput)).toContainText("total=42", { timeout: 60_000 });
      await expect(reader.locator('[data-cell-id="widget"] input[type="range"]')).toHaveValue("7");
      await expect(reader.locator('[data-cell-id="zone"]').getByTestId(TESTID.cellOutput)).toContainText("tz=UTC", { timeout: 60_000 });
      expect(errors).toEqual([]);
    } finally {
      await offline.close();
    }
  });

  test("web app: a long export can be cancelled, and the dialog closed while it runs", async ({ page, notebook }) => {
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await notebook.waitForKernelReady();
    // Python's download stalls, as on a broken connection.
    await page.route(`${PYODIDE_CDN_URL}pyodide-lock.json`, () => {});
    await dialog.open();
    await dialog.choose("webapp");
    await dialog.pick("Mode", "Interactive");
    await dialog.pick("Python", "Included (offline)");
    await dialog.pick("Files", "Single file");

    await dialog.exportButton.click();
    await expect(dialog.cancelButton).toBeVisible();
    await expect(dialog.exportButton).toBeDisabled();
    await dialog.cancelButton.click();
    await expect(dialog.status).toHaveText("Export cancelled.");
    await expect(dialog.cancelButton).toBeHidden();
    await expect(dialog.exportButton).toBeEnabled();

    // Escape closes the dialog during an export, which stops it.
    await dialog.exportButton.click();
    await expect(dialog.cancelButton).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog.root).toBeHidden();

    // So does the close button.
    await dialog.open();
    await dialog.exportButton.click();
    await expect(dialog.cancelButton).toBeVisible();
    await dialog.root.getByRole("button", { name: "Close" }).click();
    await expect(dialog.root).toBeHidden();
    expect(await writtenFiles(page)).toEqual([]);
  });

  test("web app: a static export shows the outputs with JavaScript disabled", async ({ page, notebook, browser }, testInfo) => {
    test.setTimeout(180_000);
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await notebook.waitForKernelReady();
    await page.keyboard.press("Alt+r");
    await expect(page.locator('[data-cell-id="use"]').getByTestId(TESTID.cellOutput)).toContainText("total=42", { timeout: 60_000 });
    // Move the slider so the export shows the state, not the initial value.
    const slider = page.locator('[data-cell-id="widget"] input[type="range"]');
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue("8");

    await dialog.open();
    await dialog.choose("webapp");
    await dialog.pick("Mode", "Read-only");
    await dialog.setOption("Static (no JavaScript)", true);
    const [file] = await dialog.exportAndCollect(1, 120_000);
    expect(file.name).toBe("fixture.html");
    expect(file.content).not.toMatch(/<script/i);
    const target = testInfo.outputPath("static.html");
    writeFileSync(target, file.content);

    const noJs = await browser.newContext({ javaScriptEnabled: false, offline: true });
    try {
      const reader = await noJs.newPage();
      await reader.goto(pathToFileURL(target).href);
      await expect(reader.getByRole("heading", { name: "Export fixture" })).toBeVisible();
      await expect(reader.locator('[data-cell-id="use"]')).toContainText("total=42");
      await expect(reader.locator('[data-cell-id="widget"] input[type="range"]')).toHaveValue("8");
      // PyNote's styles still apply: values only its CSS sets (the page's
      // own background rule comes from the payload colors, so it proves
      // nothing), with its code font carried by the file.
      const heading = reader.getByRole("heading", { name: "Export fixture" });
      expect(await heading.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(243, 139, 168)");
      expect(await reader.locator('[data-cell-id="define"] .cm-content').evaluate((el) => getComputedStyle(el).fontFamily)).toContain("JetBrains Mono Variable");
      expect(await loadedFaces(reader, ['"JetBrains Mono Variable"'])).toEqual([true]);
    } finally {
      await noJs.close();
    }
  });

  test("web app: a static export keeps every line of long code cells", async ({ page, notebook, browser }, testInfo) => {
    test.setTimeout(240_000);
    const dialog = new ExportDialog(page);
    const lines = Array.from({ length: 120 }, (_, i) => `line_${i + 1} = ${i + 1}`);
    const long = (id: string) => ({ id, type: "code" as const, source: lines.join("\n"), metadata: {} });
    // One long cell on the first screen and one far below it.
    const cells = [intro, long("top"), define, use, widget, long("bottom")];
    // PyNote's default theme shows code at full height; a theme can cap the
    // height, and the rest of a long cell then scrolls inside it.
    for (const maxCodeHeight of ["none", "420px"]) {
      await openNotebook(page, notebook, notebookFile("fixture.ipynb", cells, { theme: { editor: { maxCodeHeight } } }), 6);
      await dialog.open();
      await dialog.choose("webapp");
      await dialog.pick("Mode", "Read-only");
      await dialog.setOption("Static (no JavaScript)", true);
      const [file] = await dialog.exportAndCollect(1, 120_000);
      const target = testInfo.outputPath(`static-${maxCodeHeight}.html`);
      writeFileSync(target, file.content);

      const { reader, close } = await openExport(browser, target, { javaScriptEnabled: false });
      try {
        for (const id of ["top", "bottom"]) {
          const editor = reader.locator(`[data-cell-id="${id}"] .cm-editor`);
          await expect(editor.locator(".cm-line")).toHaveCount(120);
          await expect(editor.locator(".cm-line").first()).toHaveText("line_1 = 1");
          await expect(editor.locator(".cm-line").last()).toHaveText("line_120 = 120");
          await expect(editor.locator(".cm-gap")).toHaveCount(0);
          // The same box as in PyNote; scrolling inside it needs no JavaScript.
          const box = await editor.locator(".cm-scroller").evaluate((el) => ({ height: el.clientHeight, content: el.scrollHeight }));
          if (maxCodeHeight === "none") {
            expect(box.content).toBeLessThanOrEqual(box.height);
          } else {
            expect(box.height).toBeLessThanOrEqual(420);
            expect(box.content).toBeGreaterThan(box.height);
          }
        }
      } finally {
        await close();
      }
    }
  });

  test("web app: math renders in KaTeX's fonts, carried by read-only and static exports", async ({ page, notebook, browser }, testInfo) => {
    test.setTimeout(180_000);
    const dialog = new ExportDialog(page);
    const math = { id: "math", type: "markdown" as const, source: "Energy $E = mc^2$, and a sum:\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$", metadata: {} };
    await openNotebook(page, notebook, notebookFile("fixture.ipynb", [intro, math, define]), 3);
    for (const staticHtml of [false, true]) {
      await dialog.open();
      await dialog.choose("webapp");
      await dialog.pick("Mode", "Read-only");
      await dialog.setOption("Static (no JavaScript)", staticHtml);
      const [file] = await dialog.exportAndCollect(1, 120_000);
      const target = testInfo.outputPath(staticHtml ? "static.html" : "readonly.html");
      writeFileSync(target, file.content);
      const { reader, close } = await openExport(browser, target, { javaScriptEnabled: !staticHtml });
      try {
        await expect(reader.locator('[data-cell-id="math"] .katex-display')).toBeVisible();
        // Text, italic letters and the display-mode sum each have their own face.
        expect(await loadedFaces(reader, ["KaTeX_Main", "KaTeX_Math", "KaTeX_Size2"])).toEqual([true, true, true]);
      } finally {
        await close();
      }
    }
  });

  test("web app: readers get the notebook, not the author's undo history", async ({ page, notebook, browser }, testInfo) => {
    test.setTimeout(180_000);
    const dialog = new ExportDialog(page);
    const secret = { id: "secret", type: "code" as const, source: 'API_KEY = "sk-live-0042"', metadata: {} };
    await openNotebook(page, notebook, notebookFile("fixture.ipynb", [intro, secret, define]), 3);
    // Deleting the cell keeps its text in the notebook's undo history.
    await notebook.cells.nth(1).click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+Delete");
    await expect(notebook.cells).toHaveCount(2);

    await dialog.open();
    await dialog.choose("webapp");
    await dialog.pick("Mode", "Interactive");
    await dialog.pick("Python", "From CDN");
    await dialog.pick("Files", "Single file");
    const [interactive] = await dialog.exportAndCollect(1, 120_000);
    expect(interactive.content).not.toContain("sk-live-0042");
    expect(payloadOf(interactive.content).document.metadata.PyNote.history).toEqual([]);

    await dialog.open();
    await dialog.pick("Mode", "Read-only");
    await dialog.setOption("Static (no JavaScript)", false);
    const [readOnly] = await dialog.exportAndCollect(1, 120_000);
    expect(readOnly.content).not.toContain("sk-live-0042");
    expect(payloadOf(readOnly.content).document.metadata.PyNote.history).toEqual([]);

    // Undo in the export has nothing of the author's to bring back.
    const target = testInfo.outputPath("readonly.html");
    writeFileSync(target, readOnly.content);
    const { reader, close } = await openExport(browser, target);
    try {
      await expect(reader.getByTestId(TESTID.cell)).toHaveCount(2);
      await reader.keyboard.press("Control+z");
      await expect(reader.getByTestId(TESTID.cell)).toHaveCount(2);
      await expect(reader.getByTestId(TESTID.appRoot)).not.toContainText("sk-live-0042");
    } finally {
      await close();
    }

    // The notebook being edited keeps its history: undo brings the cell back.
    await page.keyboard.press("Control+z");
    await expect(notebook.cells).toHaveCount(3);
    await expect(notebook.cells.nth(1)).toHaveAttribute("data-cell-id", "secret");
  });

  test("web app: what a password field holds reaches no export", async ({ page, notebook, browser }, testInfo) => {
    test.setTimeout(300_000);
    const typed = "sk-live-SECRET-0042";
    // Values Python gives password fields; the code builds them, so the
    // notebook's own code (which every export carries) does not hold them.
    const created = "sk-python-SECRET-7";
    const set = "sk-python-SECRET-8";
    const secrets = [typed, created, set];
    const dialog = new ExportDialog(page);
    const key = { id: "key", type: "code" as const, source: "from pynote_ui import Input\napi_key = Input(input_type='password', placeholder='API key')\napi_key", metadata: {} };
    // Python keeps what was typed in the component's props, so printing the
    // field again carries it.
    const echo = { id: "echo", type: "code" as const, source: "print(api_key)", metadata: {} };
    const token = { id: "token", type: "code" as const, source: "token = Input(input_type='PASSWORD', value='sk-python-' + 'SECRET-7')\ntoken", metadata: {} };
    const update = { id: "update", type: "code" as const, source: "token.value = 'sk-python-' + 'SECRET-8'", metadata: {} };
    await openNotebook(page, notebook, notebookFile("fixture.ipynb", [intro, key, echo, token, update]), 5);
    await notebook.waitForKernelReady();
    // Each cell once the one before has shown its output.
    const field = page.locator('[data-cell-id="key"] input[type="password"]');
    const tokenField = page.locator('[data-cell-id="token"] input[type="password"]');
    await notebook.runCell(1);
    await expect(field).toBeVisible({ timeout: 60_000 });
    await notebook.runCell(3);
    await expect(tokenField).toHaveValue(created, { timeout: 30_000 });
    await notebook.runCell(4);
    await expect(tokenField).toHaveValue(set, { timeout: 30_000 });
    await field.click();
    await page.keyboard.type(typed);
    await notebook.runCell(2);
    await expect(page.locator('[data-cell-id="echo"] input[type="password"]')).toHaveValue(typed, { timeout: 30_000 });

    await dialog.open();
    await dialog.choose("webapp");
    await dialog.pick("Mode", "Interactive");
    await dialog.pick("Python", "From CDN");
    await dialog.pick("Files", "Single file");
    const [interactive] = await dialog.exportAndCollect(1, 120_000);
    for (const secret of secrets) expect(interactive.content).not.toContain(secret);

    for (const staticHtml of [false, true]) {
      const file = await exportReadOnly(dialog, staticHtml);
      for (const secret of secrets) expect(file.content, staticHtml ? "static" : "read-only").not.toContain(secret);
      const target = testInfo.outputPath(staticHtml ? "static.html" : "readonly.html");
      writeFileSync(target, file.content);
      const { reader, close } = await openExport(browser, target, { javaScriptEnabled: !staticHtml });
      try {
        // Every password field shows, and is empty.
        const fields = reader.locator('input[type="password"]');
        await expect(fields).toHaveCount(3);
        for (const value of await fields.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))) expect(value).toBe("");
      } finally {
        await close();
      }
    }
  });

  test("web app: a read-only export shows widgets as they are on screen, after a kernel restart too", async ({ page, notebook }) => {
    test.setTimeout(180_000);
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, ORDERED, 4);
    await notebook.waitForKernelReady();
    await page.keyboard.press("Alt+r");
    const slider = page.locator('[data-cell-id="widget"] input[type="range"]');
    await expect(slider).toHaveValue("7", { timeout: 60_000 });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue("8");

    // Restarting Python leaves the outputs, and the slider at 8, on screen.
    await page.getByRole("button", { name: "Kernel" }).click();
    await page.getByRole("menuitem", { name: "Restart" }).click();
    await notebook.waitForKernelReady();
    await expect(slider).toHaveValue("8");

    const file = await exportReadOnly(dialog, false);
    expect(payloadOf(file.content).outputs.widget.mimebundle[UI_MIME].props.value).toBe(8);
  });

  test("web app: a static export keeps every character of a long line, with line wrap off", async ({ page, notebook, browser }, testInfo) => {
    test.setTimeout(180_000);
    // Line wrap is an app setting (Code Visibility). Without it, CodeMirror
    // draws only the part of a very long line that is in view.
    await page.addInitScript(() => localStorage.setItem("pynote-code-visibility", JSON.stringify({ lineWrap: false })));
    const numbers = Array.from({ length: 2500 }, (_, i) => i + 1).join(", ");
    const longLine = `data = [${numbers}]  # END_OF_LONG_LINE`;
    const long = { id: "long", type: "code" as const, source: `${longLine}\nprint(len(data))`, metadata: {} };
    // An empty cell shows a placeholder, which is not code.
    const empty = { id: "empty", type: "code" as const, source: "", metadata: {} };
    const dialog = new ExportDialog(page);
    await openNotebook(page, notebook, notebookFile("fixture.ipynb", [intro, long, empty, define]), 4);
    const file = await exportReadOnly(dialog, true);
    expect(file.content).toContain("# END_OF_LONG_LINE");
    const target = testInfo.outputPath("static.html");
    writeFileSync(target, file.content);

    const { reader, close } = await openExport(browser, target, { javaScriptEnabled: false });
    try {
      const editor = reader.locator('[data-cell-id="long"] .cm-editor');
      await expect(editor.locator(".cm-line")).toHaveText([longLine, "print(len(data))"]);
      // As in the app: highlighted to its end, on one line that scrolls sideways.
      const line = editor.locator(".cm-line").first();
      await expect(line.locator("span").last()).toHaveText("# END_OF_LONG_LINE");
      await expect(line.locator('[contenteditable="false"]')).toHaveCount(0);
      const lineHeights = await editor.locator(".cm-line").evaluateAll((lines) => lines.map((el) => el.getBoundingClientRect().height));
      expect(lineHeights[0]).toBe(lineHeights[1]);
      const box = await editor.locator(".cm-scroller").evaluate((el) => ({ width: el.clientWidth, content: el.scrollWidth }));
      expect(box.content).toBeGreaterThan(box.width * 10);
    } finally {
      await close();
    }
  });

  test("web app: code blocks in markdown keep their highlighting in single-file exports", async ({ page, notebook, browser }, testInfo) => {
    test.setTimeout(180_000);
    const dialog = new ExportDialog(page);
    const snippet = { id: "snippet", type: "markdown" as const, source: 'Markup:\n\n```html\n<!-- a comment -->\n<div class="box">Hi</div>\n```', metadata: {} };
    await openNotebook(page, notebook, notebookFile("fixture.ipynb", [intro, snippet, define]), 3);
    const tokens = (p: Page) => p.locator('[data-cell-id="snippet"] pre code.language-html [class^="hljs-"]');
    await expect(tokens(page).first()).toBeVisible();
    const inApp = await tokens(page).count();
    for (const staticHtml of [false, true]) {
      const file = await exportReadOnly(dialog, staticHtml);
      const target = testInfo.outputPath(staticHtml ? "static.html" : "readonly.html");
      writeFileSync(target, file.content);
      const { reader, close } = await openExport(browser, target, { javaScriptEnabled: !staticHtml });
      try {
        await expect(tokens(reader), staticHtml ? "static" : "read-only").toHaveCount(inApp);
      } finally {
        await close();
      }
    }
  });
});

for (const engine of ENGINES) {
  test.describe(`Export dialog, in ${engine}`, () => {
    test("is modal: focus stays in it, the notebook behind takes nothing, and focus goes back on close", async ({ page, playwright, baseURL }) => {
      test.setTimeout(120_000);
      await inEngine(engine, { page, playwright, baseURL }, async (page) => {
        await installFilePickerStubs(page);
        const notebook = new NotebookPage(page);
        const dialog = new ExportDialog(page);
        await openNotebook(page, notebook, ORDERED, 4);
        // A selected cell, which plain keys act on ("b" inserts a cell below it).
        await notebook.cells.nth(1).click({ position: { x: 5, y: 5 } });
        const options = page.getByRole("button", { name: "Options" });
        await options.focus();
        await page.keyboard.press("Control+e");
        await expect(dialog.root).toBeVisible();
        await expect(dialog.selectedFormat).toBeFocused();

        // Arrow keys move through the formats.
        await page.keyboard.press("ArrowDown");
        await expect(dialog.selectedFormat).toHaveAttribute("data-format", "pynote");
        await expect(dialog.selectedFormat).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await expect(dialog.selectedFormat).toHaveAttribute("data-format", "ipynb");

        // Tab and Shift+Tab go round the dialog's controls, in the browser's
        // own order, from the last one (Export) to the first (Close) and back.
        const focusInside = () => dialog.root.evaluate((box) => box.contains(document.activeElement));
        for (const key of [...Array<string>(10).fill("Tab"), ...Array<string>(10).fill("Shift+Tab")]) {
          await page.keyboard.press(key);
          await expect.poll(focusInside, { message: `focus after ${key}` }).toBe(true);
        }
        const close = dialog.root.getByRole("button", { name: "Close" });
        await close.focus();
        await page.keyboard.press("Shift+Tab");
        await expect(dialog.exportButton).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(close).toBeFocused();

        // The page behind is inert: its controls cannot take focus, and a key
        // pressed while nothing in the dialog has focus (after a click on its
        // text) reaches none of the notebook's shortcuts.
        const takesFocus = await options.evaluate((el: HTMLElement) => {
          el.focus();
          return document.activeElement === el;
        });
        expect(takesFocus).toBe(false);
        await dialog.root.getByTestId(TESTID.exportFormatTitle).click();
        await page.keyboard.press("b");
        await expect(dialog.root).toBeVisible();
        await expect(notebook.cells).toHaveCount(4);

        // Escape closes it, and focus goes back where it was.
        await page.keyboard.press("Escape");
        await expect(dialog.root).toBeHidden();
        await expect(options).toBeFocused();
        await expect(notebook.cells).toHaveCount(4);
      });
    });
  });

  test.describe(`Export dialog without the File System Access API, in ${engine}`, () => {
    // Without the API (Firefox, Safari) exports download: one file as itself,
    // several files as one .zip.
    test("downloads one file as itself, and every file of a pair in one .zip", async ({ page, playwright, baseURL }) => {
      test.setTimeout(180_000);
      await inEngine(engine, { page, playwright, baseURL }, async (page) => {
        await installFilePickerStubs(page, { savePickers: false });
        const notebook = new NotebookPage(page);
        const dialog = new ExportDialog(page);
        await openNotebook(page, notebook, ORDERED, 4);
        const downloads: Download[] = [];
        page.on("download", (download) => downloads.push(download));

        await dialog.open();
        await dialog.choose("pynote");
        await dialog.exportButton.click();
        await expect.poll(() => downloads.length).toBe(1);
        expect(downloads[0].suggestedFilename()).toBe("fixture.pynote");
        expect((await deliveredFiles(downloads))["fixture.pynote"]).toContain("total = 40 + 2");

        downloads.length = 0;
        await dialog.open();
        await dialog.choose("pair");
        await expect(dialog.scriptCheck).toHaveAttribute("data-status", "passed", { timeout: 60_000 });
        await dialog.exportButton.click();
        await expect(dialog.root).toBeHidden();
        // Both files reach the reader.
        await expect.poll(async () => Object.keys(await deliveredFiles(downloads)).sort(), { timeout: 15_000 }).toEqual(["fixture.md", "fixture.py"]);
        const files = await deliveredFiles(downloads);
        expect(files["fixture.py"]).toContain('# %% id="define"\ntotal = 40 + 2');
        expect(files["fixture.md"]).toContain("<!-- code define -->");
        // In one download: a page that starts several at once can lose some.
        expect(downloads.map((download) => download.suggestedFilename())).toEqual(["fixture.zip"]);
      });
    });

    test("downloads a web app folder as one .zip", async ({ page, playwright, baseURL }) => {
      test.setTimeout(180_000);
      await inEngine(engine, { page, playwright, baseURL }, async (page) => {
        await installFilePickerStubs(page, { savePickers: false });
        const notebook = new NotebookPage(page);
        const dialog = new ExportDialog(page);
        await openNotebook(page, notebook, ORDERED, 4);
        await dialog.open();
        await dialog.choose("webapp");
        await dialog.pick("Mode", "Interactive");
        await dialog.pick("Python", "From CDN");
        await dialog.pick("Files", "Folder");
        await expect(dialog.extension).toHaveText("/");
        const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), dialog.exportButton.click()]);
        expect(download.suggestedFilename()).toBe("fixture.zip");
        const files = await deliveredFiles([download]);
        expect(Object.keys(files).sort()).toEqual(["fixture/README.txt", "fixture/index.html", "fixture/pynote.css", "fixture/pynote.js"]);
        expect(files["fixture/index.html"]).toContain('<script src="pynote.js"></script>');
      });
    });
  });
}
