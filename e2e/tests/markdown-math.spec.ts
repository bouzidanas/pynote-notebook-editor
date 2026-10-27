import { test, expect } from "../support/fixtures";
import { installFilePickerStubs, queueFileToOpen } from "../support/file-pickers";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO } from "../../src/lib/formats/document";
import { serializeIpynb } from "../../src/lib/formats/ipynb";

// Math in markdown cells renders wherever a span of $...$ starts after
// whitespace, including at the start of a soft-wrapped line, while a plain
// dollar amount stays text.

const NOTEBOOK = serializeIpynb({
  metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { autorun: false, history: [] } },
  cells: [
    { id: "inline", type: "markdown", source: "Inline $x+1$ math.", metadata: {} },
    { id: "wrapped", type: "markdown", source: "The area of a square is\n$a^2$ for a side of length a.", metadata: {} },
    { id: "tab", type: "markdown", source: "After a tab:\t$b^2$ also.", metadata: {} },
    { id: "money", type: "markdown", source: "It costs $5 and\n$10 more.", metadata: {} },
  ],
});

test("inline math renders after any whitespace, line breaks included", async ({ page, notebook }) => {
  await installFilePickerStubs(page);
  await notebook.goto();
  await queueFileToOpen(page, { name: "math.ipynb", content: NOTEBOOK });
  await page.keyboard.press("Control+o");
  await expect(notebook.cells).toHaveCount(4);
  for (const id of ["inline", "wrapped", "tab"]) {
    await expect(page.locator(`[data-cell-id="${id}"] .katex`), id).toHaveCount(1);
  }
  await expect(page.locator('[data-cell-id="wrapped"]')).not.toContainText("$a^2$");
  await expect(page.locator('[data-cell-id="money"] .katex')).toHaveCount(0);
  await expect(page.locator('[data-cell-id="money"]')).toContainText("It costs $5 and $10 more.");
});
