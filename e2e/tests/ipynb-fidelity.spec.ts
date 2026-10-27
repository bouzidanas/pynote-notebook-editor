import { test, expect } from "../support/fixtures";
import { installFilePickerStubs, queueFileToOpen, writtenFiles } from "../support/file-pickers";
import { nbformatErrors } from "../support/nbformat";
import type { Page } from "@playwright/test";
import type { NotebookPage } from "../pages/NotebookPage";

/**
 * .ipynb fidelity: what PyNote writes must be a valid nbformat 4.5 notebook,
 * and a notebook that goes through open -> save must keep what PyNote does not
 * own (cell ids, other tools' metadata, raw cells) while undo/redo history
 * saved in the file keeps pointing at the right cells after reopening.
 *
 * These drive the real save/open code paths with in-memory file handles (see
 * support/file-pickers.ts), so they cover exactly what a user hits.
 */

const markdownEditor = (page: Page) => page.locator(".milkdown-editor-wrapper .editor");

async function saveAndRead(page: Page): Promise<any> {
  const before = (await writtenFiles(page)).length;
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await writtenFiles(page)).length).toBe(before + 1);
  const files = await writtenFiles(page);
  return JSON.parse(files[files.length - 1].content);
}

/** Add a markdown cell (it opens focused, in edit mode), type, and leave edit mode. */
async function typeNewMarkdownCell(page: Page, notebook: NotebookPage, text: string): Promise<void> {
  await notebook.addMarkdownCell();
  await expect(markdownEditor(page)).toBeVisible();
  await page.keyboard.type(text);
  await notebook.exitEditMode();
}

async function openFile(page: Page, name: string, notebook: unknown): Promise<void> {
  await queueFileToOpen(page, { name, content: JSON.stringify(notebook, null, 1) });
  await page.keyboard.press("Control+o");
}

test.describe(".ipynb fidelity", () => {
  test.beforeEach(async ({ page }) => {
    await installFilePickerStubs(page);
  });

  // Saving, opening and undo never need the kernel, so these tests don't wait
  // for Pyodide (notebook.goto, not notebook.open).
  test("a saved notebook is valid nbformat 4.5", async ({ page, notebook }) => {
    await notebook.goto();
    await typeNewMarkdownCell(page, notebook, "Some notes");
    await notebook.addCodeCell();
    await notebook.typeInCell((await notebook.cellCount()) - 1, "x = 21 * 2\nprint(x)");
    await notebook.exitEditMode();

    const saved = await saveAndRead(page);
    expect(nbformatErrors(saved)).toEqual([]);
  });

  test("undo and redo still work after reopening a saved notebook", async ({ page, notebook }) => {
    await notebook.goto();
    const initial = await notebook.cellCount();

    // History so far: add a markdown cell, then set its text.
    await typeNewMarkdownCell(page, notebook, "Hello");
    await expect(notebook.cells.nth(initial)).toContainText("Hello");
    const saved = await saveAndRead(page);

    // Reopen the file we just saved (handle path, no page reload).
    await openFile(page, "reopened.ipynb", saved);
    await expect(notebook.cells).toHaveCount(initial + 1);
    const added = notebook.cells.nth(initial);
    await expect(added).toContainText("Hello");

    // A new edit after reopening.
    await added.dblclick();
    await expect(markdownEditor(page)).toBeVisible();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Hello world");
    await notebook.exitEditMode();
    await page.keyboard.press("Escape"); // deselect: global undo runs in command mode
    await expect(added).toContainText("Hello world");

    // Walk the whole history back...
    await notebook.undo();
    await expect(notebook.cells.nth(initial)).toContainText("Hello");
    await expect(notebook.cells.nth(initial)).not.toContainText("world");
    await notebook.undo();
    await expect(notebook.cells.nth(initial)).toContainText("Double click to edit");
    await notebook.undo();
    await expect(notebook.cells).toHaveCount(initial);

    // ...and forward again: the document must come back exactly.
    await notebook.redo();
    await notebook.redo();
    await notebook.redo();
    await expect(notebook.cells).toHaveCount(initial + 1);
    await expect(notebook.cells.nth(initial)).toContainText("Hello world");
  });

  test("open then save keeps cell ids, other tools' metadata and raw cells", async ({ page, notebook }) => {
    await notebook.goto();
    const source = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: { display_name: "Python 3 (ipykernel)", language: "python", name: "python3" },
        language_info: { name: "python", version: "3.12.4" },
        colab: { provenance: [], toc_visible: true },
      },
      cells: [
        { id: "intro-cell", cell_type: "markdown", metadata: { tags: ["header"] }, source: ["# Title\n", "\n", "Text"] },
        { id: "setup-cell", cell_type: "code", metadata: { tags: ["parameters"], collapsed: false }, execution_count: null, outputs: [], source: ["x = 1"] },
        { id: "raw-cell", cell_type: "raw", metadata: { format: "text/restructuredtext" }, source: [".. note:: raw"] },
      ],
    };
    await openFile(page, "foreign.ipynb", source);
    await expect(notebook.cells).toHaveCount(3);

    const saved = await saveAndRead(page);
    expect(nbformatErrors(saved)).toEqual([]);
    expect(saved.cells.map((c: any) => c.id)).toEqual(["intro-cell", "setup-cell", "raw-cell"]);
    expect(saved.cells.map((c: any) => c.cell_type)).toEqual(["markdown", "code", "raw"]);
    expect(saved.cells[0].metadata).toEqual({ tags: ["header"] });
    expect(saved.cells[1].metadata).toEqual({ tags: ["parameters"], collapsed: false });
    expect(saved.cells[2].metadata).toEqual({ format: "text/restructuredtext" });
    expect(saved.cells[2].source.join("")).toBe(".. note:: raw");
    expect(saved.metadata.colab).toEqual({ provenance: [], toc_visible: true });
    expect(saved.metadata.kernelspec).toEqual(source.metadata.kernelspec);
  });

  test("raw cells show their text verbatim and stay raw when saved", async ({ page, notebook }) => {
    await notebook.goto();
    await openFile(page, "raw.ipynb", {
      nbformat: 4, nbformat_minor: 5, metadata: {},
      cells: [{ id: "front", cell_type: "raw", metadata: {}, source: "---\ntitle: Report\n---\n# not a heading" }],
    });
    const raw = notebook.cells.first();
    await expect(raw).toHaveAttribute("data-cell-type", "raw");
    await expect(raw.locator("pre")).toHaveText("---\ntitle: Report\n---\n# not a heading");
    await expect(raw.locator("h1")).toHaveCount(0);

    await raw.dblclick();
    await expect(raw.getByLabel("Raw cell text")).toBeFocused();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\nmore");
    await notebook.exitEditMode();
    await expect(raw.locator("pre")).toContainText("# not a heading\nmore");

    const saved = await saveAndRead(page);
    expect(saved.cells[0]).toMatchObject({ id: "front", cell_type: "raw" });
    expect(saved.cells[0].source.join("")).toBe("---\ntitle: Report\n---\n# not a heading\nmore");
  });

  test("other tools' metadata survives a page reload before saving", async ({ page, notebook }) => {
    await notebook.goto();
    await openFile(page, "colab.ipynb", {
      nbformat: 4, nbformat_minor: 5,
      metadata: { colab: { provenance: [] }, kernelspec: { display_name: "Python 3", language: "python", name: "python3" } },
      cells: [{ id: "only", cell_type: "code", metadata: { tags: ["t"] }, source: "1", outputs: [], execution_count: null }],
    });
    await expect(notebook.cells).toHaveCount(1);
    const sessionId = await notebook.sessionId();
    await expect.poll(() => notebook.persistedCellCount(sessionId!)).toBe(1);
    await page.reload();
    await expect(notebook.cells).toHaveCount(1);

    const saved = await saveAndRead(page);
    expect(saved.metadata.colab).toEqual({ provenance: [] });
    expect(saved.metadata.kernelspec.display_name).toBe("Python 3");
    expect(saved.cells[0]).toMatchObject({ id: "only", metadata: { tags: ["t"] } });
  });

});

test.describe("opening without the File System Access API", () => {
  test.beforeEach(async ({ page }) => {
    await installFilePickerStubs(page, { openPicker: false });
  });

  test("the fallback open path (hidden file input) keeps ids and metadata too", async ({ page, notebook }) => {
    await notebook.goto();
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Control+o");
    await (await chooser).setFiles({
      name: "fallback.ipynb",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        nbformat: 4, nbformat_minor: 5, metadata: { custom: { a: 1 } },
        cells: [{ id: "kept-id", cell_type: "markdown", metadata: { tags: ["x"] }, source: "Fallback" }],
      })),
    });
    // This path stores the notebook in a new session and reloads the page.
    await expect(notebook.cells).toHaveCount(1);
    await expect(notebook.cells.first()).toHaveAttribute("data-cell-id", "kept-id");
    const saved = await saveAndRead(page);
    expect(saved.metadata.custom).toEqual({ a: 1 });
    expect(saved.cells[0].metadata).toEqual({ tags: ["x"] });
  });
});

test.describe("markdown edits are never lost", () => {
  for (const exit of ["Escape", "Shift+Enter", "Control+Enter"]) {
    test(`text typed right before ${exit} is kept and undoable`, async ({ page, notebook }) => {
      await notebook.goto();
      const initial = await notebook.cellCount();
      await notebook.addMarkdownCell();
      await expect(markdownEditor(page)).toBeVisible();
      // Type and leave edit mode at once: no pause for the editor's 200ms debounce.
      await page.keyboard.type("Typed fast");
      await page.keyboard.press(exit);
      await expect(notebook.cells.nth(initial)).toContainText("Typed fast");

      // The edit is a proper history entry: global undo clears it. On the
      // last cell, Shift+Enter also inserts a new cell (its own entry), which
      // the first undo removes.
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      if (exit === "Shift+Enter") {
        await expect(notebook.cells).toHaveCount(initial + 2);
        await notebook.undo();
        await expect(notebook.cells).toHaveCount(initial + 1);
      }
      await notebook.undo();
      await expect(notebook.cells.nth(initial)).toContainText("Double click to edit");
    });
  }
});

test.describe("single-letter shortcuts ignore modifier chords", () => {
  test("Ctrl+Y and Alt+R do not change the selected cell's type", async ({ page, notebook }) => {
    await notebook.goto();
    const first = notebook.cells.first();
    await expect(first).toHaveAttribute("data-cell-type", "markdown");
    await first.click(); // select (markdown cells select on single click)
    await page.keyboard.press("Control+y");
    await page.keyboard.press("Alt+r");
    await expect(first).toHaveAttribute("data-cell-type", "markdown");
    // The plain letters still work.
    await page.keyboard.press("r");
    await expect(first).toHaveAttribute("data-cell-type", "raw");
    await page.keyboard.press("m");
    await expect(first).toHaveAttribute("data-cell-type", "markdown");
  });
});

