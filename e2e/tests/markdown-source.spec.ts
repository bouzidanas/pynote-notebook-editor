import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { installFilePickerStubs, queueFileToOpen, writtenFiles } from "../support/file-pickers";
import { PYNOTE_KERNELSPEC, PYNOTE_LANGUAGE_INFO } from "../../src/lib/formats/document";
import { serializeIpynb } from "../../src/lib/formats/ipynb";

/**
 * A markdown cell keeps its exact source until the user changes it. The
 * editor (Milkdown) never writes a source back byte for byte: it escapes the
 * underscores in math, spaces out tight lists and adds a final newline. So
 * entering and leaving edit mode without changing anything, however edit
 * mode ends, must leave the source as it was (math still rendering) and add
 * nothing to the undo history; changing the text and changing it back must
 * restore the original source too.
 */

const SOURCES = {
  math: "$$\\text{softmax}(x_i) = \\frac{e^{x_i - \\max(x)}}{\\sum_j e^{x_j - \\max(x)}}$$",
  inline: "Inline $a_1 + b_1$ and $\\int_0^1 f(x)\\,dx$ math.",
  list: "* first item\n* second item",
};

const NOTEBOOK = serializeIpynb({
  metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { autorun: false, history: [] } },
  cells: [
    ...Object.entries(SOURCES).map(([id, source]) => ({ id, type: "markdown" as const, source, metadata: {} })),
    { id: "code", type: "code" as const, source: "x = 1", metadata: {} },
  ],
});

const cell = (page: Page, id: string) => page.locator(`[data-cell-id="${id}"]`);
const markdownEditor = (page: Page) => page.locator(".milkdown-editor-wrapper .editor");

async function openNotebook(page: Page): Promise<void> {
  await queueFileToOpen(page, { name: "sources.ipynb", content: NOTEBOOK });
  await page.keyboard.press("Control+o");
  await expect(page.locator("[data-cell-id]")).toHaveCount(4);
}

async function startEditing(page: Page, id: string): Promise<void> {
  await cell(page, id).locator(".prose").dblclick();
  await expect(markdownEditor(page)).toBeVisible();
  await expect(markdownEditor(page)).toBeFocused();
}

/** The cell sources a save writes (through the stubbed file handle). */
async function savedSources(page: Page): Promise<Record<string, string>> {
  const before = (await writtenFiles(page)).length;
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await writtenFiles(page)).length).toBe(before + 1);
  const files = await writtenFiles(page);
  const saved = JSON.parse(files[files.length - 1].content);
  return Object.fromEntries(saved.cells.map((c: { id: string; source: string[] }) => [c.id, c.source.join("")]));
}

const expectSourcesUnchanged = async (page: Page) => {
  const saved = await savedSources(page);
  for (const [id, source] of Object.entries(SOURCES)) expect(saved[id], id).toBe(source);
};

test.describe("markdown cells keep their exact source", () => {
  test.beforeEach(async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await openNotebook(page);
  });

  const exits: Record<string, (page: Page) => Promise<void>> = {
    "Escape": (page) => page.keyboard.press("Escape"),
    "selecting another cell": (page) => cell(page, "code").click(),
    "presentation mode": async (page) => {
      await page.keyboard.press("Alt+p");
      await expect(markdownEditor(page)).toHaveCount(0);
      await page.keyboard.press("Escape");
    },
  };

  for (const [exit, leave] of Object.entries(exits)) {
    test(`entering edit mode and leaving it by ${exit} changes nothing`, async ({ page }) => {
      for (const id of Object.keys(SOURCES)) {
        await startEditing(page, id);
        await leave(page);
        await expect(markdownEditor(page)).toHaveCount(0);
      }
      // Back to no cell selected or editing, where Undo shows the notebook's
      // history (in edit mode it shows the editor's own).
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      // Math still renders as math, and there is nothing to undo.
      await expect(cell(page, "math").locator(".katex")).toHaveCount(1);
      await expect(cell(page, "inline").locator(".katex")).toHaveCount(2);
      await expect(cell(page, "list").locator("li")).toHaveCount(2);
      await expect(cell(page, "list").locator("li p")).toHaveCount(0);
      await expect(page.getByTitle("Undo")).toBeDisabled();
      await expectSourcesUnchanged(page);
    });
  }

  test("saving while a cell is in edit mode changes nothing", async ({ page }) => {
    await startEditing(page, "math");
    await expectSourcesUnchanged(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTitle("Undo")).toBeDisabled();
  });

  test("changing the text and changing it back restores the exact source", async ({ page }) => {
    await startEditing(page, "inline");
    await page.keyboard.press("End");
    await page.keyboard.type(" Edited");
    // Long enough for the editor to report the change to the cell.
    await expect.poll(async () => (await savedSources(page)).inline).toContain("Edited");
    for (let i = 0; i < " Edited".length; i++) await page.keyboard.press("Backspace");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTitle("Undo")).toBeDisabled();
    await expectSourcesUnchanged(page);
  });

  test("a real edit is kept, and undo brings back the exact source", async ({ page }) => {
    await startEditing(page, "inline");
    await page.keyboard.press("End");
    await page.keyboard.type(" Edited");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(cell(page, "inline")).toContainText("Edited");
    expect((await savedSources(page)).inline).toContain("Edited");

    await expect(page.getByTitle("Undo")).toBeEnabled();
    await page.keyboard.press("Control+z");
    await expect(page.getByTitle("Undo")).toBeDisabled();
    await expectSourcesUnchanged(page);
  });
});
