import { test, expect, type Page, type Locator } from "@playwright/test";
import { NotebookPage } from "../pages/NotebookPage";

/**
 * Markdown cell editing: formatting toolbar toggle states and typing with
 * marks at a collapsed cursor.
 *
 * These pin down two fixes plus their regression guard:
 * 1. Toggle buttons (Bold / Italic / Quote / Inline Code) report their
 *    active state via aria-pressed, both from the cursor position and
 *    right after clicking the button (before any typing).
 * 2. Inline Code works at a collapsed cursor (Milkdown's own command
 *    refuses empty selections).
 * 3. Typing marked text after a space must NOT absorb the preceding space
 *    into the mark. This regressed silently because the editor ran without
 *    ProseMirror's required white-space CSS; the assertions on raw text
 *    node content keep it fixed.
 */

/** The Milkdown contenteditable inside the cell being edited. */
const editorSurface = (page: Page): Locator =>
  page.locator(".milkdown-editor-wrapper .editor");

const toolbarButton = (page: Page, title: string): Locator =>
  page.locator(`button[title="${title}"]`).first();

/** Ensure the formatting toolbar is interactable (it is collapsed by default). */
async function showFormattingToolbar(page: Page): Promise<void> {
  const bold = toolbarButton(page, "Bold");
  const covered = await bold.evaluate((btn) => {
    const r = btn.getBoundingClientRect();
    if (r.height === 0) return true;
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !btn.contains(el);
  });
  if (covered) {
    // The toggle must not steal focus from the editor (mousedown is
    // prevented in CellWrapper), so no refocus is needed here.
    await page.getByTitle("Show Formatting Toolbar").click();
    await expect(bold).toBeVisible();
  }
}

/**
 * Per-mark text content of the current paragraph, e.g.
 * [["text", "plain "], ["CODE", "abc"]]. Asserting on this catches both
 * wrong mark application and whitespace being moved across mark boundaries.
 */
const paragraphRuns = (page: Page): Promise<[string, string][]> =>
  editorSurface(page)
    .locator("p")
    .first()
    .evaluate((p) =>
      [...p.childNodes].map((n) => [
        n.nodeType === Node.TEXT_NODE ? "text" : (n as Element).tagName,
        n.textContent ?? "",
      ])
    ) as Promise<[string, string][]>;

test.describe("markdown formatting toolbar", () => {
  let notebook: NotebookPage;

  test.beforeEach(async ({ page }) => {
    notebook = new NotebookPage(page);
    // The markdown editor never talks to the kernel; don't wait for Pyodide.
    await notebook.goto();
    await notebook.addMarkdownCell();
    // New markdown cells open in edit mode with the editor focused.
    await expect(editorSurface(page)).toBeVisible();
    await showFormattingToolbar(page);
  });

  test("bold button reflects cursor context and stored marks", async ({ page }) => {
    const bold = toolbarButton(page, "Bold");

    await page.keyboard.type("plain ");
    await expect(bold).toHaveAttribute("aria-pressed", "false");

    // Clicking Bold at a collapsed cursor must light up BEFORE typing.
    await bold.click();
    await expect(bold).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.type("fat");
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await expect(editorSurface(page).locator("strong", { hasText: "fat" })).toBeVisible();

    // Toggling off restores plain typing.
    await bold.click();
    await expect(bold).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.type(" tail");
    expect(await paragraphRuns(page)).toEqual([
      ["text", "plain "],
      ["STRONG", "fat"],
      ["text", " tail"],
    ]);

    // Moving the cursor back inside the bold text lights the button again.
    for (let i = 0; i < " tail".length + 1; i++) await page.keyboard.press("ArrowLeft");
    await expect(bold).toHaveAttribute("aria-pressed", "true");
  });

  test("inline code works at a collapsed cursor and leaves the preceding space alone", async ({ page }) => {
    const code = toolbarButton(page, "Inline Code");

    await page.keyboard.type("hello ");
    await code.click();
    await expect(code).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.type("abc");
    await expect(code).toHaveAttribute("aria-pressed", "true");

    // The space typed before toggling must stay in the plain run; only the
    // newly typed text carries the code mark.
    expect(await paragraphRuns(page)).toEqual([
      ["text", "hello "],
      ["CODE", "abc"],
    ]);
  });

  test("quote button tracks blockquote state", async ({ page }) => {
    const quote = toolbarButton(page, "Quote");

    await page.keyboard.type("quotable");
    await expect(quote).toHaveAttribute("aria-pressed", "false");

    await quote.click();
    await expect(quote).toHaveAttribute("aria-pressed", "true");
    await expect(editorSurface(page).locator("blockquote")).toBeVisible();

    await quote.click();
    await expect(quote).toHaveAttribute("aria-pressed", "false");
    await expect(editorSurface(page).locator("blockquote")).toHaveCount(0);
  });

  test("header cycle button tracks whether the cursor is in a heading", async ({ page }) => {
    const header = toolbarButton(page, "Cycle Header Level");

    await page.keyboard.type("title");
    await expect(header).toHaveAttribute("aria-pressed", "false");

    // Cycle paragraph -> H1; the collapsed cursor is now inside a heading.
    await header.click();
    await expect(editorSurface(page).locator("h1")).toBeVisible();
    await expect(header).toHaveAttribute("aria-pressed", "true");

    // Also pressed when text inside the heading is highlighted.
    await page.keyboard.press("Control+a");
    await expect(header).toHaveAttribute("aria-pressed", "true");

    // Cycling H4 -> paragraph turns it back off (H1 -> H2 -> H3 -> H4 -> P).
    for (let i = 0; i < 4; i++) await header.click();
    await expect(editorSurface(page).locator("h1, h2, h3, h4")).toHaveCount(0);
    await expect(header).toHaveAttribute("aria-pressed", "false");
  });

  test("typing italic after a space keeps the space out of the mark", async ({ page }) => {
    const italic = toolbarButton(page, "Italic");

    await page.keyboard.type("lean ");
    await italic.click();
    await expect(italic).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type("slanted");

    expect(await paragraphRuns(page)).toEqual([
      ["text", "lean "],
      ["EM", "slanted"],
    ]);
  });

  test("list buttons wrap, convert between types, and unwrap to paragraphs", async ({ page }) => {
    const bullet = toolbarButton(page, "Bullet List");
    const ordered = toolbarButton(page, "Numbered List");
    const surface = editorSurface(page);

    // Build a three-item bullet list by typing.
    await page.keyboard.type("alpha");
    await bullet.click();
    await expect(surface.locator("ul > li")).toHaveCount(1);
    await page.keyboard.type("\nbeta\ngamma");
    await expect(surface.locator("ul > li")).toHaveCount(3);
    await expect(bullet).toHaveAttribute("aria-pressed", "true");
    await expect(ordered).toHaveAttribute("aria-pressed", "false");

    // Numbered click inside a bullet list converts it in place.
    await ordered.click();
    await expect(surface.locator("ol > li")).toHaveCount(3);
    await expect(surface.locator("ul")).toHaveCount(0);
    await expect(ordered).toHaveAttribute("aria-pressed", "true");
    await expect(bullet).toHaveAttribute("aria-pressed", "false");

    // Numbered click inside a numbered list unwraps it: one paragraph per item.
    await ordered.click();
    await expect(surface.locator("ol, ul")).toHaveCount(0);
    await expect(surface.locator("p")).toHaveCount(3);
    await expect(surface.locator("p").nth(0)).toHaveText("alpha");
    await expect(surface.locator("p").nth(1)).toHaveText("beta");
    await expect(surface.locator("p").nth(2)).toHaveText("gamma");
    await expect(ordered).toHaveAttribute("aria-pressed", "false");

    // The cursor must survive the unwrap in its original text position
    // (end of "gamma"): step back twice and type to prove where it is.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("X");
    await expect(surface.locator("p").nth(2)).toHaveText("gamXma");

    // Re-wrap as bullet, then bullet click again unwraps the same way.
    await bullet.click();
    await expect(surface.locator("ul > li")).toHaveCount(1);
    await expect(bullet).toHaveAttribute("aria-pressed", "true");
    await bullet.click();
    await expect(surface.locator("ol, ul")).toHaveCount(0);
    await expect(bullet).toHaveAttribute("aria-pressed", "false");
  });

  test("a text highlight survives the list wrap/unwrap round trip", async ({ page }) => {
    const bullet = toolbarButton(page, "Bullet List");
    const surface = editorSurface(page);
    const highlighted = () =>
      page.evaluate(() => {
        const sel = window.getSelection();
        return { text: sel?.toString() ?? "", collapsed: sel?.isCollapsed ?? true };
      });

    await page.keyboard.type("pick me please");
    // Highlight the middle word with a double click.
    await surface.locator("p").getByText("pick me please").dblclick({ position: { x: 45, y: 8 } });
    const before = await highlighted();
    expect(before.collapsed).toBe(false);
    expect(before.text.length).toBeGreaterThan(0);

    await bullet.click();
    await expect(surface.locator("ul > li")).toHaveCount(1);
    expect(await highlighted()).toEqual(before);

    await bullet.click();
    await expect(surface.locator("ol, ul")).toHaveCount(0);
    expect(await highlighted()).toEqual(before);
  });

  test("toolbar toggle does not steal the caret before a list action", async ({ page }) => {
    const bullet = toolbarButton(page, "Bullet List");
    const surface = editorSurface(page);

    await page.keyboard.type("one two");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft"); // caret after "one"

    // Hide + show the formatting toolbar via the cell chrome toggle. This
    // used to move focus to the toggle button; ProseMirror then skipped the
    // DOM selection sync on the next doc change and the visible caret fell
    // back to the editor container (the "phantom top line").
    await page.getByTitle("Hide Formatting Toolbar").click();
    await page.getByTitle("Show Formatting Toolbar").click();
    await expect(bullet).toBeVisible();

    await bullet.click();
    await expect(surface.locator("ul > li")).toHaveCount(1);

    // Prove the caret is still right after "one" by typing into it.
    await page.keyboard.type("X");
    await expect(surface.locator("ul > li").first()).toHaveText("oneX two");
  });

  test("inserting a table places the cursor in the first header cell", async ({ page }) => {
    const surface = editorSurface(page);

    await page.keyboard.type("intro");
    await toolbarButton(page, "Table Options").click();
    await page.getByText("Insert Table").click();
    await expect(surface.locator("table")).toBeVisible();

    // Typing must land in the table's first header cell, not the paragraph.
    await page.keyboard.type("Col A");
    await expect(surface.locator("table th").first()).toHaveText("Col A");
    await expect(surface.locator("p").first()).toHaveText("intro");

    // Deleting the table from the dropdown must leave the caret at a sane
    // text position where the table was, so typing continues in the document.
    await toolbarButton(page, "Table Options").click();
    await page.getByText("Delete Table").click();
    await expect(surface.locator("table")).toHaveCount(0);
    await page.keyboard.type("after");
    await expect(surface).toContainText("after");
  });
});
