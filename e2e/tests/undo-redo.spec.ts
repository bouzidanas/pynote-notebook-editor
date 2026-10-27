import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { installFilePickerStubs, queueFileToOpen, writtenFiles } from "../support/file-pickers";

// Undo/redo must round-trip a structural change (adding a cell).
test.describe("undo / redo", () => {
  test("undo removes an added cell and redo restores it", async ({ notebook }) => {
    await notebook.open();

    const initial = await notebook.cellCount();

    await notebook.addCodeCell();
    const afterAdd = initial + 1;
    await expect(notebook.cells).toHaveCount(afterAdd);

    // The new cell's editor is focused; leave edit mode so the global
    // notebook undo (not the editor's text undo) handles the keystroke.
    await notebook.exitEditMode();

    await notebook.undo();
    await expect(notebook.cells).toHaveCount(initial);

    await notebook.redo();
    await expect(notebook.cells).toHaveCount(afterAdd);
  });

  test("deleting a cell and undoing the delete keeps its attachments and metadata, also after a reload", async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, { name: "pictures.ipynb", content: PICTURES });
    await page.keyboard.press("Control+o");
    await expectCells(page, ["pic", "code"]);

    for (const index of [0, 1]) {
      // Select the cell (command mode), delete it, undo.
      await notebook.cells.nth(index).click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Control+Delete");
      await expect(notebook.cells).toHaveCount(1);
      await notebook.undo();
      await expect(notebook.cells).toHaveCount(2);
    }
    await expectCells(page, ["pic", "code"]);
    expectPictures(await savedNotebook(page));

    // The restored cells are what the session keeps too.
    await page.reload();
    await expectCells(page, ["pic", "code"]);
    expectPictures(await savedNotebook(page));
  });
});

// A markdown cell with a pasted image and tags, and a code cell with tags and
// a PyNote setting.
const IMAGE = "iVBORw0KGgo".padEnd(2_000, "A");
const PICTURES = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" } },
  cells: [
    { id: "pic", cell_type: "markdown", metadata: { tags: ["figure"] }, source: "Screenshot: ![s](attachment:s.png)", attachments: { "s.png": { "image/png": IMAGE } } },
    { id: "code", cell_type: "code", metadata: { tags: ["parameters"], pynote: { autorun: false } }, source: "x = 1", outputs: [], execution_count: null },
  ],
});

function expectPictures(saved: { cells: Array<{ metadata: unknown; attachments?: Record<string, Record<string, string>> }> }): void {
  expect(saved.cells[0].attachments?.["s.png"]?.["image/png"] === IMAGE, "attachment kept").toBe(true);
  expect(saved.cells[0].metadata).toEqual({ tags: ["figure"] });
  expect(saved.cells[1].metadata).toEqual({ tags: ["parameters"], pynote: { autorun: false } });
}

async function expectCells(page: Page, ids: string[]): Promise<void> {
  const shown = () => page.locator("[data-cell-id]").evaluateAll((els) => els.map((el) => el.getAttribute("data-cell-id")));
  await expect.poll(() => shown().catch(() => null)).toEqual(ids);
}

async function savedNotebook(page: Page) {
  const before = (await writtenFiles(page)).length;
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await writtenFiles(page)).length).toBe(before + 1);
  const files = await writtenFiles(page);
  return JSON.parse(files[files.length - 1].content);
}
