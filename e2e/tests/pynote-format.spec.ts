import { test, expect } from "../support/fixtures";
import { installFilePickerStubs, lastOpenPickerOptions, lastSavePickerOptions, queueFileToOpen, queueSaveName, writtenFiles } from "../support/file-pickers";
import { nbformatErrors } from "../support/nbformat";
import type { Page } from "@playwright/test";

/**
 * .pynote in the real app: Open accepts it next to .ipynb, Save keeps .ipynb
 * as the default for new notebooks, Save As can switch to .pynote, and Save
 * writes back in the format the file has. Format details are unit-tested in
 * src/lib/formats/pynote.test.ts; this covers the user-facing flows.
 */

const PYNOTE_FILE = `---
pynote: 1
executionMode: reactive
---

<!-- cell intro -->
# From a .pynote file

\`\`\`python {#calc autorun=false}
x = 21 * 2
\`\`\`
`;

async function lastWrite(page: Page) {
  const files = await writtenFiles(page);
  return files[files.length - 1];
}

async function pressAndWaitForWrite(page: Page, keys: string) {
  const before = (await writtenFiles(page)).length;
  await page.keyboard.press(keys);
  await expect.poll(async () => (await writtenFiles(page)).length).toBe(before + 1);
  return lastWrite(page);
}

test.describe(".pynote open and save", () => {
  test.beforeEach(async ({ page }) => {
    await installFilePickerStubs(page);
  });

  test("a new notebook saves as .ipynb by default, with .pynote offered", async ({ page, notebook }) => {
    await notebook.goto();
    const file = await pressAndWaitForWrite(page, "Control+s");
    expect(file.name).toMatch(/\.ipynb$/);
    expect(nbformatErrors(JSON.parse(file.content))).toEqual([]);
    const options = await lastSavePickerOptions(page);
    expect(options.types.map((t: any) => Object.values(t.accept).flat())).toEqual([[".ipynb"], [".pynote"]]);
  });

  test("Save As can switch to .pynote, and later saves keep that format", async ({ page, notebook }) => {
    await notebook.goto();
    await queueSaveName(page, "notes.pynote");
    const first = await pressAndWaitForWrite(page, "Control+Shift+s");
    expect(first.name).toBe("notes.pynote");
    expect(first.content.startsWith("---\npynote: 1\n")).toBe(true);

    // The notebook now has that name, and Ctrl+S writes .pynote to the same file.
    await notebook.addCodeCell();
    await notebook.typeInCell((await notebook.cellCount()) - 1, "y = 1");
    await notebook.exitEditMode();
    const second = await pressAndWaitForWrite(page, "Control+s");
    expect(second.name).toBe("notes.pynote");
    expect(second.content).toContain("y = 1");

    // Save As now suggests the current name, with .pynote first.
    await queueSaveName(page, "copy.pynote");
    await pressAndWaitForWrite(page, "Control+Shift+s");
    const options = await lastSavePickerOptions(page);
    expect(options.suggestedName).toBe("notes.pynote");
    expect(Object.values(options.types[0].accept).flat()).toEqual([".pynote"]);
  });

  test("opens a .pynote file and writes it back unchanged", async ({ page, notebook }) => {
    await notebook.goto();
    await queueFileToOpen(page, { name: "analysis.pynote", content: PYNOTE_FILE });
    await page.keyboard.press("Control+o");
    // Open offers notebooks only, one at a time.
    await expect.poll(() => lastOpenPickerOptions(page)).toEqual({
      types: [{ description: "Notebooks (.ipynb, .pynote)", accept: { "application/x-ipynb+json": [".ipynb"], "text/x-pynote": [".pynote"] } }],
      multiple: false,
    });
    await expect(notebook.cells).toHaveCount(2);
    await expect(notebook.cells.first()).toHaveAttribute("data-cell-id", "intro");
    await expect(notebook.cells.first().getByRole("heading", { level: 1 })).toHaveText("From a .pynote file");
    await expect(notebook.cells.nth(1)).toContainText("x = 21 * 2");

    const saved = await pressAndWaitForWrite(page, "Control+s");
    expect(saved.name).toBe("analysis.pynote");
    expect(saved.content).toBe(PYNOTE_FILE);
  });

  test("a .pynote notebook saved as .ipynb is the same notebook", async ({ page, notebook }) => {
    await notebook.goto();
    await queueFileToOpen(page, { name: "analysis.pynote", content: PYNOTE_FILE });
    await page.keyboard.press("Control+o");
    // Wait for the opened file itself (the default notebook also has two cells).
    await expect(notebook.cells.first()).toHaveAttribute("data-cell-id", "intro");
    await queueSaveName(page, "analysis.ipynb");
    const saved = await pressAndWaitForWrite(page, "Control+Shift+s");
    const nb = JSON.parse(saved.content);
    expect(nbformatErrors(nb)).toEqual([]);
    expect(nb.cells.map((c: any) => [c.id, c.cell_type, c.source.join("")])).toEqual([
      ["intro", "markdown", "# From a .pynote file"],
      ["calc", "code", "x = 21 * 2"],
    ]);
    expect(nb.cells[1].metadata).toEqual({ pynote: { autorun: false } });
    expect(nb.metadata.PyNote.executionMode).toBe("reactive");
  });

  test("an invalid .pynote file is reported, and the open notebook is untouched", async ({ page, notebook }) => {
    await notebook.goto();
    const before = await notebook.cellCount();
    const dialog = page.waitForEvent("dialog");
    await queueFileToOpen(page, { name: "broken.pynote", content: "---\npynote: 1\n---\n\n```python {#a}\nnever closed\n" });
    await page.keyboard.press("Control+o");
    const d = await dialog;
    expect(d.message()).toContain("never closed");
    await d.dismiss();
    await expect(notebook.cells).toHaveCount(before);
  });
});

test.describe(".pynote without the File System Access API", () => {
  test.beforeEach(async ({ page }) => {
    await installFilePickerStubs(page, { openPicker: false });
  });

  test("the file input accepts .pynote", async ({ page, notebook }) => {
    await notebook.goto();
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Control+o");
    const fc = await chooser;
    expect(await fc.element().getAttribute("accept")).toBe(".ipynb,.pynote");
    expect(fc.isMultiple()).toBe(false);
    await fc.setFiles({ name: "analysis.pynote", mimeType: "text/markdown", buffer: Buffer.from(PYNOTE_FILE) });
    await expect(notebook.cells).toHaveCount(2);
    await expect(notebook.cells.nth(1)).toHaveAttribute("data-cell-id", "calc");
  });
});
