import { type Page, expect, test } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TESTID } from "../support/selectors";
import { EXPORTS_DIR } from "./build-exports";

// A read-only web app shows the notebook exactly as exported: nothing a
// reader does with the keyboard edits, deletes, clears or runs its cells, or
// starts and stops a kernel.

const READ_ONLY_URL = pathToFileURL(path.join(EXPORTS_DIR, "single-readonly", "index.html")).href;

// Notices browsers log at error level about valid markup (see web-app.spec.ts).
const BROWSER_NOTICES = [/^Viewport argument key "interactive-widget" not recognized and ignored\.$/];

// Everything a reader can see of the notebook: each cell's id, type and text
// (source and saved outputs), and the kernel status the page reports.
const notebookState = (page: Page) =>
  page.evaluate((ids) => ({
    cells: [...document.querySelectorAll(`[data-testid="${ids.cell}"]`)].map((cell) => ({
      id: cell.getAttribute("data-cell-id"),
      type: cell.getAttribute("data-cell-type"),
      text: (cell as HTMLElement).innerText,
    })),
    kernel: document.querySelector(`[data-testid="${ids.kernelStatus}"]`)?.getAttribute("data-status"),
  }), { cell: TESTID.cell, kernelStatus: TESTID.kernelStatus });

const openReadOnlyExport = async (page: Page) => {
  const errors: string[] = [];
  const workers: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !BROWSER_NOTICES.some((notice) => notice.test(message.text()))) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.context().route(/^https?:/, (route) => route.abort("internetdisconnected"));
  await page.goto(READ_ONLY_URL);
  await expect(page.getByTestId(TESTID.cell)).toHaveCount(4);
  const output = page.locator(`[data-testid="${TESTID.cell}"][data-cell-id="hello"]`).getByTestId(TESTID.cellOutput);
  await expect(output).toContainText("answer=42");
  return { errors, workers };
};

test("single-readonly: notebook shortcuts change nothing and start nothing", async ({ page }) => {
  const seen = await openReadOnlyExport(page);
  const exported = await notebookState(page);
  expect(exported.cells.map((cell) => cell.id)).toEqual(["title", "hello", "numpy", "widget"]);

  // Shut down then run all (a run on a stopped kernel used to fail and wipe
  // the saved outputs), clear outputs, delete every cell, walk the undo
  // history both ways, restart the kernel.
  for (const key of [
    "Alt+q", "Alt+r", "Alt+Backspace", "Control+Backspace", "Alt+Delete",
    "Control+z", "Control+Shift+z", "Control+y", "Alt+k",
  ]) {
    await page.keyboard.press(key);
    expect(await notebookState(page), `after ${key}`).toEqual(exported);
  }
  expect(seen.workers).toEqual([]);
  expect(seen.errors).toEqual([]);
});

// The toolbar slides out of view in presentation mode; its controls (add
// cells, undo, the Kernel menu) must not stay reachable with Tab.
test("single-readonly: the hidden toolbar cannot be reached with the keyboard", async ({ page }) => {
  await openReadOnlyExport(page);
  const focused: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    focused.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? `${el.tagName} ${el.getAttribute("title") ?? el.innerText.trim().slice(0, 20)}` : "none";
    }));
  }
  for (const control of ["Options", "Kernel", "Add Code Cell", "Add Markdown Cell", "Undo", "Redo"]) {
    expect(focused.some((name) => name.endsWith(` ${control}`)), `${control} took focus: ${focused.join(", ")}`).toBe(false);
  }
});
