import { test, expect } from "../support/fixtures";
import { TESTID } from "../support/selectors";

// A pynote_ui component left as a cell's last expression is the cell's
// result: it renders as the component, with no Out: text beside it.
test.describe("component results", () => {
  test("a component as the last expression renders without Out: text", async ({ notebook }) => {
    await notebook.open();
    const index = await notebook.addAndRunCodeCell("from pynote_ui import Slider\nSlider(value=30, label='Level')");
    const cell = notebook.cells.nth(index);
    await expect(cell.locator('input[type="range"]')).toHaveValue("30", { timeout: 60_000 });
    await expect(notebook.cellResult(index)).toHaveCount(0);
    await expect(cell).not.toContainText("PYNOTE_UI");
  });

  test("a list of components renders as a group without Out: text", async ({ notebook }) => {
    await notebook.open();
    const index = await notebook.addAndRunCodeCell(
      "from pynote_ui import Slider, Text\n[Slider(value=10), Text(content='group text')]",
    );
    const cell = notebook.cells.nth(index);
    await expect(cell.locator('input[type="range"]')).toHaveValue("10", { timeout: 60_000 });
    await expect(cell.getByTestId(TESTID.cellOutput).getByText("group text", { exact: true })).toBeVisible();
    await expect(notebook.cellResult(index)).toHaveCount(0);
    await expect(cell).not.toContainText("PYNOTE_UI");
  });

  test("other values still show as Out:", async ({ notebook }) => {
    await notebook.open();
    const index = await notebook.addAndRunCodeCell("21 * 2");
    await expect(notebook.cellResult(index)).toContainText("42", { timeout: 60_000 });
  });
});
