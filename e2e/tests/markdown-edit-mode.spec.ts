import { test, expect } from "../support/fixtures";
import type { Locator, Page } from "@playwright/test";

/**
 * Entering edit mode on a markdown cell swaps its rendered content for the
 * editor, which lives in a lazily loaded chunk. The swap must not empty the
 * cell, not even for a frame: the first edit after page load used to collapse
 * the cell to its minimum height (a visible flash), and for as long as the
 * chunk was still loading (slow networks, phones).
 */

// Records the cell's height on every animation frame while `act` runs.
async function heightsDuring(page: Page, cell: Locator, act: () => Promise<void>, ms: number): Promise<number[]> {
  await cell.evaluate((el, duration) => {
    const heights: number[] = [];
    (window as unknown as { __heights: number[] }).__heights = heights;
    const start = performance.now();
    const tick = () => {
      heights.push(el.getBoundingClientRect().height);
      if (performance.now() - start < duration) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 200);
  return page.evaluate(() => (window as unknown as { __heights: number[] }).__heights);
}

const editor = (cell: Locator) => cell.locator(".milkdown-editor-wrapper .editor");

test.describe("Markdown cell edit mode", () => {
  test("the first edit after load shows the editor without emptying the cell", async ({ page, notebook }) => {
    await notebook.goto();
    const cell = notebook.cells.first();
    await expect(cell).toContainText("Welcome to PyNote");
    // Give the editor's chunk time to arrive, as it does on a desktop.
    await page.waitForLoadState("networkidle");
    const rendered = (await cell.boundingBox())!.height;

    const heights = await heightsDuring(page, cell, () => cell.dblclick(), 800);
    await expect(editor(cell)).toBeVisible();
    expect(Math.min(...heights), `heights: ${heights.map(Math.round).join(" ")}`).toBeGreaterThan(rendered * 0.75);
  });

  test("while the editor's code is still loading, the cell keeps showing its content", async ({ page, notebook }) => {
    // The chunk arrives late, as on a slow network or a phone.
    await page.route(/MarkdownEditor/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await notebook.goto();
    const cell = notebook.cells.first();
    await expect(cell).toContainText("Welcome to PyNote");
    const rendered = (await cell.boundingBox())!.height;

    const heights = await heightsDuring(page, cell, () => cell.dblclick(), 2200);
    await expect(editor(cell)).toBeVisible();
    expect(Math.min(...heights), `heights: ${heights.map(Math.round).join(" ")}`).toBeGreaterThan(rendered * 0.75);
  });
});
