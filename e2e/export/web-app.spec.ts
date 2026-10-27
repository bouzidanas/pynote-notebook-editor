import { type Page, expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TESTID } from "../support/selectors";
import { PYODIDE_CDN_URL } from "../../src/lib/pyodide-config";
import type { PyodideLock } from "../../src/lib/export/pyodide-bundle";
import { EXPORTS_DIR, MIRROR, SERVER_ENV, type Variant } from "./build-exports";

// Exported web apps, opened the ways readers open them. Offline exports must
// run Python with every network request blocked; every export must load
// without console errors.

const fileUrl = (variant: Variant) => pathToFileURL(path.join(EXPORTS_DIR, variant, "index.html")).href;
const serverUrl = (variant: Variant) => `${process.env[SERVER_ENV]}/exports/${variant}/`;

interface Watch {
  errors: string[];
  requests: string[];
}

// Notices browsers log at error level about valid markup. PyNote's viewport
// sets interactive-widget=resizes-content (Chrome and Firefox on Android then
// resize the page for the on-screen keyboard instead of covering the action
// drawer); WebKit does not implement the key, ignores it, and says so.
const BROWSER_NOTICES = [/^Viewport argument key "interactive-widget" not recognized and ignored\.$/];

// Console errors, uncaught exceptions and HTTP(S) requests made by the page
// and its workers.
const watch = (page: Page): Watch => {
  const seen: Watch = { errors: [], requests: [] };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (BROWSER_NOTICES.some((notice) => notice.test(message.text()))) return;
    seen.errors.push(message.text());
  });
  page.on("pageerror", (error) => seen.errors.push(`${error.name}: ${error.message}`));
  page.context().on("request", (request) => {
    if (/^https?:/.test(request.url())) seen.requests.push(request.url());
  });
  return seen;
};

const blockNetwork = async (page: Page, allowOrigin?: string) => {
  await page.context().route(/^https?:/, (route) =>
    allowOrigin && route.request().url().startsWith(allowOrigin) ? route.continue() : route.abort("internetdisconnected"),
  );
};

// The CDN Pyodide comes from, answered from the local mirror (with the CORS
// header jsDelivr sends). Register after blockNetwork: later routes win.
const serveCdnFromMirror = async (page: Page) => {
  const base = new URL(PYODIDE_CDN_URL).pathname;
  await page.context().route(`${PYODIDE_CDN_URL}**`, (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(base.length));
    const file = path.join(MIRROR, name);
    if (name.includes("..") || !existsSync(file)) return route.abort();
    return route.fulfill({ path: file, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/octet-stream" } });
  });
};

const cells = (page: Page) => page.getByTestId(TESTID.cell);
const cellById = (page: Page, id: string) => page.locator(`[data-testid="${TESTID.cell}"][data-cell-id="${id}"]`);
const outputOf = (page: Page, id: string) => cellById(page, id).getByTestId(TESTID.cellOutput);

const expectNotebookShown = async (page: Page) => {
  await expect(page).toHaveTitle("Export test");
  await expect(page.getByTestId(TESTID.appRoot)).toBeVisible();
  await expect(cells(page)).toHaveCount(4);
  const heading = page.getByRole("heading", { name: "Exported notebook" });
  await expect(heading).toBeVisible();
  // PyNote's look: the default theme's background and heading color, and its
  // code font, loaded from the export itself (no network).
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(30, 30, 46)");
  expect(await heading.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(243, 139, 168)");
  expect(await cellById(page, "hello").locator(".cm-content").evaluate((el) => getComputedStyle(el).fontFamily)).toContain("JetBrains Mono Variable");
  expect(await loadedFaces(page, ['"JetBrains Mono Variable"'])).toEqual([true]);
  // Math renders with KaTeX's own fonts (text, italic letters and the big
  // display-mode operator), also carried by the export.
  await expect(page.locator(".katex-display")).toBeVisible();
  expect(await loadedFaces(page, ["KaTeX_Main", "KaTeX_Math", "KaTeX_Size2"])).toEqual([true, true, true]);
  // Code blocks are highlighted as in PyNote: the HTML one's comment and tag.
  const html = cellById(page, "title").locator("pre code.language-html");
  await expect(html.locator(".hljs-comment")).toHaveText("<!-- a comment -->");
  await expect(html.locator(".hljs-tag").first()).toBeVisible();
};

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

const slider = (page: Page) => outputOf(page, "widget").locator('input[type="range"]');

// Replace a cell's code and run it.
const runInCell = async (page: Page, id: string, code: string) => {
  await cellById(page, id).locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
  await page.keyboard.press("Control+Enter");
};

// The notebook autoruns when an interactive export opens; then a reader can
// use its components (round trip through Python) and edit and run cells.
const expectInteractive = async (page: Page) => {
  await expect(page.getByTestId(TESTID.kernelStatus)).toHaveAttribute("data-status", "ready", { timeout: 90_000 });
  await expect(outputOf(page, "hello")).toContainText("answer=42", { timeout: 60_000 });
  await expect(outputOf(page, "numpy")).toContainText("sum=45", { timeout: 60_000 });
  await expect(outputOf(page, "numpy")).toContainText("tz=UTC");
  await expect(slider(page)).toHaveValue("30");
  await expect(outputOf(page, "widget").getByText("level=30", { exact: true })).toBeVisible();

  await slider(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(outputOf(page, "widget").getByText("level=31", { exact: true })).toBeVisible();

  await runInCell(page, "hello", "answer = 6 * 7 + 1\nprint(f'answer={answer}')");
  await expect(outputOf(page, "hello")).toContainText("answer=43", { timeout: 30_000 });
};

for (const variant of ["single-offline", "folder-offline"] as const) {
  test(`${variant}: runs Python from file:// with the network blocked`, async ({ page }) => {
    const seen = watch(page);
    await blockNetwork(page);
    await page.goto(fileUrl(variant));
    await expectNotebookShown(page);
    await expectInteractive(page);
    expect(seen.requests).toEqual([]);
    expect(seen.errors).toEqual([]);
  });
}

test("single-offline: keeps the reader's edits across reloads", async ({ page }) => {
  await blockNetwork(page);
  await page.goto(fileUrl("single-offline"));
  await expectNotebookShown(page);
  await expectInteractive(page);
  await page.reload();
  await expect(cellById(page, "hello").locator(".cm-content")).toContainText("6 * 7 + 1");

  // Reset Notebook discards them and shows the notebook as exported.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Options" }).click();
  await page.getByText("Reset Notebook").click();
  await expect(cellById(page, "hello").locator(".cm-content")).toContainText("answer = 21 * 2");
  await page.reload();
  await expect(cellById(page, "hello").locator(".cm-content")).toContainText("answer = 21 * 2");
});

test("single-offline: a package it does not include downloads from the CDN when online", async ({ page }) => {
  const lock = JSON.parse(readFileSync(path.join(MIRROR, "pyodide-lock.json"), "utf8")) as PyodideLock;
  const seen = watch(page);
  await blockNetwork(page);
  await serveCdnFromMirror(page);
  await page.goto(fileUrl("single-offline"));
  await expectNotebookShown(page);
  await expectInteractive(page);
  // six is a Pyodide package the notebook never imported.
  await runInCell(page, "hello", "import six\nprint('six=' + six.__name__)");
  await expect(outputOf(page, "hello")).toContainText("six=six", { timeout: 30_000 });
  expect(seen.requests).toEqual([`${PYODIDE_CDN_URL}${lock.packages.six.file_name}`]);
  expect(seen.errors).toEqual([]);
});

test("single-offline: kernel restarts start every worker from one script", async ({ page }) => {
  const seen = watch(page);
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await blockNetwork(page);
  await page.goto(fileUrl("single-offline"));
  const status = page.getByTestId(TESTID.kernelStatus);
  await expect(status).toHaveAttribute("data-status", "ready", { timeout: 90_000 });
  await expect(outputOf(page, "hello")).toContainText("answer=42", { timeout: 60_000 });
  for (const started of [2, 3]) {
    await page.keyboard.press("Alt+k");
    await expect.poll(() => workers.length).toBe(started);
    await expect(status).toHaveAttribute("data-status", "ready", { timeout: 90_000 });
  }
  // One Blob URL for the page, not a new copy of Pyodide's loader per start.
  expect(new Set(workers).size).toBe(1);
  await runInCell(page, "hello", "print('restarted')");
  await expect(outputOf(page, "hello")).toContainText("restarted", { timeout: 30_000 });
  expect(seen.errors).toEqual([]);
});

test("single-cdn: loads Python from its Pyodide URL", async ({ page }) => {
  const seen = watch(page);
  await blockNetwork(page, process.env[SERVER_ENV]);
  await page.goto(fileUrl("single-cdn"));
  await expectNotebookShown(page);
  await expectInteractive(page);
  expect(seen.errors).toEqual([]);
});

test("folder-offline: runs from a static web host", async ({ page }) => {
  const seen = watch(page);
  await blockNetwork(page, process.env[SERVER_ENV]);
  await page.goto(serverUrl("folder-offline"));
  await expectNotebookShown(page);
  await expectInteractive(page);
  expect(seen.requests.every((url) => url.startsWith(`${process.env[SERVER_ENV]}/exports/folder-offline/`))).toBe(true);
  expect(seen.errors).toEqual([]);
});

test("single-readonly: shows saved outputs without a kernel", async ({ page }) => {
  const seen = watch(page);
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await blockNetwork(page);
  await page.goto(fileUrl("single-readonly"));
  await expectNotebookShown(page);
  await expect(outputOf(page, "hello")).toContainText("answer=42");
  await expect(outputOf(page, "numpy")).toContainText("sum=45");
  await expect(outputOf(page, "numpy")).toContainText("tz=UTC");
  // Components show their state when exported, not their initial one.
  await expect(slider(page)).toHaveValue("64");
  await expect(outputOf(page, "widget").getByText("level=64", { exact: true })).toBeVisible();
  // Input components ignore the reader (nothing could run their callbacks):
  // neither a click near the end of the track nor the keyboard moves the
  // slider, and it cannot take focus.
  await slider(page).scrollIntoViewIfNeeded();
  const track = (await slider(page).boundingBox())!;
  await page.mouse.click(track.x + track.width * 0.9, track.y + track.height / 2);
  await slider(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider(page)).toHaveValue("64");
  await expect(slider(page)).not.toBeFocused();
  expect(workers).toEqual([]);
  expect(seen.requests).toEqual([]);
  expect(seen.errors).toEqual([]);
});
