import { test, expect } from "../support/fixtures";

// Autosaved notebook state must survive a full page reload.
test.describe("session persistence", () => {
  test("an added cell persists through page reload", async ({ notebook, page }) => {
    await notebook.open();

    const sessionId = await notebook.sessionId();
    expect(sessionId).toBeTruthy();

    // Make a structural change that the app autosaves to localStorage.
    await notebook.addCodeCell();
    const expectedCount = await notebook.cellCount();

    // Wait for the debounced autosave to flush the new cell to storage before
    // reloading, otherwise we would race the 300ms write.
    await expect
      .poll(() => notebook.persistedCellCount(sessionId!), { timeout: 15_000 })
      .toBe(expectedCount);

    await page.reload();
    await notebook.waitForKernelReady();

    // The restored notebook has the same cells, under the same session.
    expect(await notebook.sessionId()).toBe(sessionId);
    await expect(notebook.cells).toHaveCount(expectedCount);
  });

  // Edits still inside the autosave debounce (or a markdown editor's own
  // debounce) are saved when the page goes away, so reloading or closing the
  // tab right after typing loses nothing.
  test("a code edit made just before a reload survives it", async ({ notebook, page }) => {
    await notebook.goto();
    await notebook.addCodeCell();
    const index = (await notebook.cellCount()) - 1;
    await page.keyboard.type("kept = 'typed right before reload'");
    await page.reload();
    await expect(notebook.cellEditor(index)).toContainText("kept = 'typed right before reload'");
  });

  test("a markdown edit made just before a reload survives it", async ({ notebook, page }) => {
    await notebook.goto();
    await notebook.addMarkdownCell();
    const index = (await notebook.cellCount()) - 1;
    await expect(page.locator(".milkdown-editor-wrapper .editor")).toBeVisible();
    await page.keyboard.type("Markdown typed right before reload");
    await page.reload();
    await expect(notebook.cells.nth(index)).toContainText("Markdown typed right before reload");
  });
});

