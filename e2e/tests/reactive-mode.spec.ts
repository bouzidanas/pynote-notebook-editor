import { test, expect } from "../support/fixtures";
import { installFilePickerStubs, queueFileToOpen } from "../support/file-pickers";
import { TESTID } from "../support/selectors";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO } from "../../src/lib/formats/document";
import { serializeIpynb } from "../../src/lib/formats/ipynb";

// Reactive mode keeps the kernel in step with the cells: a variable exists
// only while the cell defining it does.

const REACTIVE = serializeIpynb({
  metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { executionMode: "reactive", autorun: false, history: [] } },
  cells: [
    { id: "define", type: "code", source: "x = 1", metadata: {} },
    { id: "use", type: "code", source: "print(f'x={x}')", metadata: {} },
  ],
});

test.describe("reactive mode", () => {
  test.beforeEach(async ({ page }) => {
    await installFilePickerStubs(page);
  });

  for (const how of ["Delete Cell", "Delete All Cells"] as const) {
    test(`${how} removes the deleted cells' variables from the kernel`, async ({ page, notebook }) => {
      await notebook.goto();
      await queueFileToOpen(page, { name: "reactive.ipynb", content: REACTIVE });
      await page.keyboard.press("Control+o");
      await expect(notebook.cells).toHaveCount(2);
      await notebook.waitForKernelReady();

      const use = page.locator('[data-cell-id="use"]');
      await page.locator('[data-cell-id="define"]').getByRole("button", { name: "Run Cell" }).click();
      await expect(use.getByTestId(TESTID.cellOutput)).toContainText("x=1", { timeout: 60_000 });

      if (how === "Delete Cell") {
        await page.locator('[data-cell-id="define"]').click({ position: { x: 5, y: 5 } });
        await page.keyboard.press("Control+Delete");
        await expect(notebook.cells).toHaveCount(1);
        await use.getByRole("button", { name: "Run Cell" }).click();
        await expect(use).toContainText("NameError: name 'x' is not defined", { timeout: 30_000 });
      } else {
        await page.keyboard.press("Alt+Delete");
        await expect(notebook.cells).toHaveCount(0);
        const index = await notebook.addAndRunCodeCell("print('x' in globals())");
        await expect(notebook.cellResult(index).or(notebook.cells.nth(index).getByTestId(TESTID.cellOutput))).toContainText("False", { timeout: 30_000 });
      }
    });
  }
});
