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

/**
 * After a real edit the cell gets back only what changed. Math (wherever the
 * renderer finds it, src/lib/markdown-math.ts) and literal dollar signs come
 * back byte for byte, in the edited paragraph and everywhere else, and so do
 * the paragraphs, lists and math blocks that were not touched.
 */
const MIXED = [
  "The softmax of $x_i$ is $\\frac{e^{x_i}}{\\sum_j e^{x_j}}$, and $\\{a, b\\}$ is a set.",
  "",
  "$$",
  "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}",
  "$$",
  "",
  "- tight list with $\\alpha_1$",
  "- second item",
  "",
  "It costs $5 and $10.",
  "",
  "Pay \\$5 for $y_j$ alone.",
].join("\n");

const MIXED_NOTEBOOK = serializeIpynb({
  metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { autorun: false, history: [] } },
  cells: [{ id: "mixed", type: "markdown", source: MIXED, metadata: {} }],
});

test.describe("a real edit to a markdown cell with math", () => {
  test.beforeEach(async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, { name: "mixed.ipynb", content: MIXED_NOTEBOOK });
    await page.keyboard.press("Control+o");
    await expect(page.locator("[data-cell-id]")).toHaveCount(1);
    // Inline math in the first paragraph, the list and the last paragraph,
    // and the math block.
    await expect(cell(page, "mixed").locator(".katex")).toHaveCount(6);
  });

  /** Edit mode with the cursor at the end of the cell's last paragraph. */
  async function editLastParagraph(page: Page): Promise<void> {
    await startEditing(page, "mixed");
    await markdownEditor(page).locator("> p").last().click();
    await page.keyboard.press("End");
  }

  test("keeps every math span and dollar sign, edited paragraph included", async ({ page }) => {
    await editLastParagraph(page);
    await page.keyboard.type(" Edited.");
    await page.keyboard.press("Escape");

    expect((await savedSources(page)).mixed).toBe(`${MIXED} Edited.`);
    await expect(cell(page, "mixed")).toContainText("Edited.");
    await expect(cell(page, "mixed").locator(".katex")).toHaveCount(6);
    await expect(cell(page, "mixed")).toContainText("It costs $5 and $10.");
    await expect(cell(page, "mixed")).toContainText("Pay $5 for");
  });

  test("writes math typed in the editor as typed", async ({ page }) => {
    await editLastParagraph(page);
    // "^*" twice would otherwise be taken for emphasis as it is typed.
    await page.keyboard.type(" Then $z_k^*$ and $a^* b^*$ cost $2.");
    await page.keyboard.press("Escape");

    expect((await savedSources(page)).mixed).toBe(`${MIXED} Then $z_k^*$ and $a^* b^*$ cost $2.`);
    await expect(cell(page, "mixed").locator(".katex")).toHaveCount(8);
  });
});

/**
 * Math under more than one mark (bold italic, a link in bold) comes back as
 * written from an edit to its paragraph, the text around it too.
 */
const FORMATTED = "***If $x_1$ is prime***, **[see $y_1$](u)**.";

test.describe("a real edit next to formatted math", () => {
  test("keeps the math and its formatting", async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, {
      name: "formatted.ipynb",
      content: serializeIpynb({
        metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { autorun: false, history: [] } },
        cells: [{ id: "formatted", type: "markdown", source: FORMATTED, metadata: {} }],
      }),
    });
    await page.keyboard.press("Control+o");
    await expect(cell(page, "formatted").locator(".katex")).toHaveCount(2);

    // Not on the link, which a double click would follow.
    await cell(page, "formatted").locator(".prose em").dblclick();
    await expect(markdownEditor(page)).toBeFocused();
    await markdownEditor(page).locator("> p").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Edited.");
    await page.keyboard.press("Escape");

    expect((await savedSources(page)).formatted).toBe(`${FORMATTED} Edited.`);
    await expect(cell(page, "formatted").locator("em strong .katex, strong em .katex")).toHaveCount(1);
    await expect(cell(page, "formatted").locator("strong a .katex, a strong .katex")).toHaveCount(1);
  });
});

/**
 * A dollar amount earlier in a line does not take the emphasis around math
 * after it into math with it: the editor reads the line as the renderer
 * does, so an edit to the paragraph keeps the bold, italic and struck-through
 * math.
 */
const AMOUNTS = "It costs $5 for **$n$** items, $10 for *$x_1$* and $3 for ~~$k$~~.";

test.describe("a real edit after a dollar amount", () => {
  test("keeps the emphasis around the math", async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, {
      name: "amounts.ipynb",
      content: serializeIpynb({
        metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { autorun: false, history: [] } },
        cells: [{ id: "amounts", type: "markdown", source: AMOUNTS, metadata: {} }],
      }),
    });
    await page.keyboard.press("Control+o");
    const emphasizedMath = async () => {
      for (const mark of ["strong", "em", "del"]) await expect(cell(page, "amounts").locator(`${mark} .katex`), mark).toHaveCount(1);
    };
    await emphasizedMath();

    await startEditing(page, "amounts");
    // The editor shows the same: math in bold, in italics and struck through.
    for (const mark of ["strong", "em", "del"]) await expect(markdownEditor(page).locator(`${mark} [data-math]`), mark).toHaveCount(1);
    // The end of the paragraph: its last line, past its text.
    const paragraph = markdownEditor(page).locator("> p");
    const box = (await paragraph.boundingBox())!;
    await paragraph.click({ position: { x: box.width - 2, y: box.height - 4 } });
    await page.keyboard.type(" Thanks");
    await page.keyboard.press("Escape");

    expect((await savedSources(page)).amounts).toBe(`${AMOUNTS} Thanks`);
    await emphasizedMath();
  });
});

/**
 * A line of "$" or "$$" that no closing line follows opens no block math, so
 * the list and the quote after it are a list and a quote: in the cell, in
 * the editor, and after an edit to the list.
 */
const LONE_FENCES = "$\n* apples\n* pears\n\n$$\n> A quote";

test.describe("a line of dollar signs that opens no block math", () => {
  test("leaves the list and the quote after it as they are", async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, {
      name: "fences.ipynb",
      content: serializeIpynb({
        metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { autorun: false, history: [] } },
        cells: [{ id: "fences", type: "markdown", source: LONE_FENCES, metadata: {} }],
      }),
    });
    await page.keyboard.press("Control+o");
    const rendered = cell(page, "fences").locator(".prose");
    await expect(rendered.locator("li")).toHaveText(["apples", "pears"]);
    await expect(rendered.locator("blockquote")).toHaveText("A quote");

    await startEditing(page, "fences");
    // The editor reads the same list and quote.
    await expect(markdownEditor(page).locator("li")).toHaveText(["apples", "pears"]);
    await expect(markdownEditor(page).locator("blockquote")).toHaveText("A quote");
    await markdownEditor(page).locator("li").last().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" and plums");
    await page.keyboard.press("Escape");

    // Milkdown spaces out the list it writes (markdownWriteBack.ts).
    expect((await savedSources(page)).fences).toMatch(/^\$\n\* apples\n+\* pears and plums\n\n\$\$\n> A quote$/);
    await expect(rendered.locator("li")).toHaveText(["apples", "pears and plums"]);
    await expect(rendered.locator("blockquote")).toHaveText("A quote");
  });
});

/**
 * What an edit anywhere in a cell once lost: the escape of a list marker
 * before math (the cell became a list), and a footnote definition holding
 * block math and HTML (the editor left it out of its document).
 */
const KEPT = {
  escaped: "\\- $x$ is a negative step.",
  footnote: "See the note.[^e]\n\n[^e]: $$\n    E = mc^2\n    $$\n    <div>Einstein, 1905</div>",
};

test.describe("a real edit keeps what the editor once dropped", () => {
  test.beforeEach(async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, {
      name: "kept.ipynb",
      content: serializeIpynb({
        metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { autorun: false, history: [] } },
        cells: Object.entries(KEPT).map(([id, source]) => ({ id, type: "markdown" as const, source, metadata: {} })),
      }),
    });
    await page.keyboard.press("Control+o");
    await expect(page.locator("[data-cell-id]")).toHaveCount(2);
  });

  test("the escape of a list marker before math", async ({ page }) => {
    await expect(cell(page, "escaped").locator(".katex")).toHaveCount(1);
    await expect(cell(page, "escaped").locator("li")).toHaveCount(0);
    await startEditing(page, "escaped");
    await markdownEditor(page).locator("> p").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Edited.");
    await page.keyboard.press("Escape");

    expect((await savedSources(page)).escaped).toBe(`${KEPT.escaped} Edited.`);
    await expect(cell(page, "escaped").locator("li")).toHaveCount(0);
    await expect(cell(page, "escaped").locator(".katex")).toHaveCount(1);
  });

  test("a footnote definition that holds block math and HTML", async ({ page }) => {
    await startEditing(page, "footnote");
    await markdownEditor(page).locator("> p").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Edited.");
    await page.keyboard.press("Escape");

    expect((await savedSources(page)).footnote).toBe(KEPT.footnote.replace("[^e]\n", "[^e] Edited.\n"));
  });
});

/**
 * "$$" alone in a paragraph, then Enter, starts a block of math in the
 * editor with its closing "$$" in place; Enter in it adds a line, and the
 * formula renders as display math once edit mode ends.
 */
test.describe("typing a block of math", () => {
  test("starts with $$ and Enter, and takes more than one line", async ({ page, notebook }) => {
    await installFilePickerStubs(page);
    await notebook.goto();
    await queueFileToOpen(page, {
      name: "typed.ipynb",
      content: serializeIpynb({
        metadata: { kernelspec: PYNOTE_KERNELSPEC, language_info: PYNOTE_LANGUAGE_INFO, PyNote: { autorun: false, history: [] } },
        cells: [{ id: "typed", type: "markdown", source: "Energy and momentum:", metadata: {} }],
      }),
    });
    await page.keyboard.press("Control+o");
    await startEditing(page, "typed");
    await markdownEditor(page).locator("> p").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("$$");
    await page.keyboard.press("Enter");
    // A block of its own, tinted like inline math, not boxed like code.
    const block = markdownEditor(page).locator("div[data-math]");
    await expect(block).toHaveCount(1);
    await expect(block).toHaveCSS("border-top-style", "none");
    await expect(block).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.keyboard.type("\\begin{aligned} E &= mc^2 \\\\");
    await page.keyboard.press("Enter");
    await page.keyboard.type("p &= mv \\end{aligned}");
    await page.keyboard.press("Escape");

    expect((await savedSources(page)).typed).toBe("Energy and momentum:\n\n$$\n\\begin{aligned} E &= mc^2 \\\\\np &= mv \\end{aligned}\n$$");
    await expect(cell(page, "typed").locator(".katex-display")).toHaveCount(1);
    await expect(cell(page, "typed").locator(".katex-error")).toHaveCount(0);
  });
});
