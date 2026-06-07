import { test, expect } from "../support/fixtures";

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
});
