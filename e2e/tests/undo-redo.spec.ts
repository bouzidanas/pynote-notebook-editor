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

  test("undoing a cell's deletion brings back its settings, such as hidden code", async ({ page, notebook }) => {
    // A notebook whose code cell hides its code (cell metadata), opened from disk.
    const ipynb = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        { cell_type: "markdown", id: "intro", metadata: {}, source: ["# Undo fixture"] },
        { cell_type: "code", id: "secret", metadata: { pynote: { codeview: { showCode: false } } }, source: ["answer = 42"], outputs: [], execution_count: null },
      ],
    });
    await page.addInitScript((content) => {
      (window as unknown as { showOpenFilePicker: () => Promise<unknown[]> }).showOpenFilePicker = async () => [
        { kind: "file", name: "undo.ipynb", getFile: async () => new File([content], "undo.ipynb", { type: "application/json" }) },
      ];
    }, ipynb);
    await notebook.open();
    await page.keyboard.press("Control+o");
    await expect(page.getByRole("heading", { name: "Undo fixture" })).toBeVisible();
    await expect(notebook.cells).toHaveCount(2);
    const secret = notebook.cells.nth(1);
    await expect(secret).toContainText("Code is hidden");
    await expect(secret.locator(".cm-editor")).toBeHidden();

    await secret.click({ position: { x: 5, y: 5 } });
    await secret.getByTitle("Delete Cell").click();
    await expect(notebook.cells).toHaveCount(1);

    await notebook.undo();
    await expect(notebook.cells).toHaveCount(2);
    await expect(notebook.cells.nth(1)).toContainText("Code is hidden");
    await expect(notebook.cells.nth(1).locator(".cm-editor")).toBeHidden();
  });
});
