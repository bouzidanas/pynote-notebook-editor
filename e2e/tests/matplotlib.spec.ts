import { test, expect } from "../support/fixtures";
import { TESTID } from "../support/selectors";

// Static matplotlib rendering. Figures are rendered worker-side (AGG backend)
// and printed into the cell's stdout as image markers, so they show up in the
// cell output like any print. One test covers all three display paths so the
// kernel and the matplotlib package only load once.
test.describe("matplotlib figures", () => {
  test("plt.show(), implicit end-of-cell display, and svg mode", async ({ notebook }) => {
    await notebook.open();

    // Explicit plt.show(). First matplotlib cell also downloads the package,
    // so give it a generous timeout.
    const showIndex = await notebook.addAndRunCodeCell(
      "import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [2, 4, 9])\nplt.show()",
    );
    const showOutput = notebook.cells.nth(showIndex).getByTestId(TESTID.cellOutput);
    await expect(showOutput.locator('img[src^="data:image/png;base64,"]')).toBeVisible({
      timeout: 120_000,
    });

    // Implicit display: a figure left open at the end of the cell renders
    // without plt.show(), matching Jupyter inline behavior.
    const implicitIndex = await notebook.addAndRunCodeCell(
      "plt.plot([1, 2, 3], [1, 4, 9])",
    );
    const implicitOutput = notebook.cells.nth(implicitIndex).getByTestId(TESTID.cellOutput);
    await expect(implicitOutput.locator('img[src^="data:image/png;base64,"]')).toBeVisible({
      timeout: 60_000,
    });

    // SVG mode via configure_matplotlib.
    const svgIndex = await notebook.addAndRunCodeCell(
      'configure_matplotlib(format="svg")\nplt.plot([1, 2, 3], [3, 1, 2])\nplt.show()',
    );
    const svgOutput = notebook.cells.nth(svgIndex).getByTestId(TESTID.cellOutput);
    await expect(svgOutput.locator("svg").first()).toBeVisible({ timeout: 60_000 });
  });
});
