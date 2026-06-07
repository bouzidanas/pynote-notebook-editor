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
    // reloading — otherwise we would race the 300ms write.
    await expect
      .poll(() => notebook.persistedCellCount(sessionId!), { timeout: 15_000 })
      .toBe(expectedCount);

    await page.reload();
    await notebook.waitForKernelReady();

    // The restored notebook has the same cells, under the same session.
    expect(await notebook.sessionId()).toBe(sessionId);
    await expect(notebook.cells).toHaveCount(expectedCount);
  });
});

