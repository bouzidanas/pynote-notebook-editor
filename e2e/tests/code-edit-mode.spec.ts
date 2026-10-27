import { test, expect } from "../support/fixtures";
import { holdZeroDelayTimers } from "../support/timers";

// A click in a code cell starts edit mode, and a click elsewhere ends it,
// however late a busy page runs what the click into the cell set off: the
// keys typed next do not go into the cell's code.
test.describe("code cell edit mode", () => {
  test("a click elsewhere ends it, even when the click into the cell is handled late", async ({ page, notebook }) => {
    await notebook.goto();
    await notebook.addCodeCell();
    const index = (await notebook.cellCount()) - 1;
    await notebook.typeInCell(index, "x = 1");
    await notebook.exitEditMode();

    const timers = await holdZeroDelayTimers(page);
    await notebook.cellEditor(index).click();
    // The page's empty left margin.
    await page.mouse.click(5, 400);
    await timers.release();
    await page.keyboard.type("zz");
    await expect(notebook.cellEditor(index)).toHaveText("x = 1");
    await expect(notebook.cellEditor(index).locator(".cm-content")).not.toBeFocused();
  });
});
