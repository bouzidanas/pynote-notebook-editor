import { type Page, type Locator, expect } from "@playwright/test";
import { TESTID } from "../support/selectors";

/**
 * Page object for the notebook editor. Encapsulates every selector and
 * interaction so specs read as user intent ("add a code cell, run it, read the
 * output") and any DOM change is absorbed here rather than across every test.
 *
 * Conventions:
 * - Locators are exposed as getters so they are re-resolved on each access
 *   (Solid re-renders cells; stale handles would flake).
 * - Waits are web-first (`expect(locator).toBeVisible()`, attribute assertions)
 *   — never arbitrary `waitForTimeout`.
 */
export class NotebookPage {
  constructor(private readonly page: Page) {}

  // --- Core locators ---------------------------------------------------------

  get root(): Locator {
    return this.page.getByTestId(TESTID.appRoot);
  }

  get kernelStatus(): Locator {
    return this.page.getByTestId(TESTID.kernelStatus);
  }

  get addCodeCellButton(): Locator {
    return this.page.getByTestId(TESTID.addCodeCell);
  }

  get addMarkdownCellButton(): Locator {
    return this.page.getByTestId(TESTID.addMarkdownCell);
  }

  get cells(): Locator {
    return this.page.getByTestId(TESTID.cell);
  }

  get outputs(): Locator {
    return this.page.getByTestId(TESTID.cellOutput);
  }

  /** The CodeMirror editing surface inside the nth cell (0-based). */
  cellEditor(index: number): Locator {
    return this.cells.nth(index).locator(".cm-editor");
  }

  // --- Navigation / lifecycle ------------------------------------------------

  /**
   * Navigate to the app (optionally with a query string such as
   * `?theme=magic_dark`) and wait until the shell has mounted.
   */
  async goto(query = ""): Promise<void> {
    await this.page.goto(`/${query}`);
    await expect(this.root).toBeVisible();
  }

  /**
   * Wait until the Pyodide kernel reports ready. The status element carries a
   * `data-status` attribute mirroring `kernel.status`, so this is a precise,
   * non-flaky wait rather than polling visible text.
   */
  async waitForKernelReady(timeout = 60_000): Promise<void> {
    await expect(this.kernelStatus).toHaveAttribute("data-status", "ready", {
      timeout,
    });
  }

  /** Navigate and wait for both the shell and a ready kernel. */
  async open(query = ""): Promise<void> {
    await this.goto(query);
    await this.waitForKernelReady();
  }

  // --- Actions ---------------------------------------------------------------

  async addCodeCell(): Promise<void> {
    const before = await this.cells.count();
    await this.addCodeCellButton.click();
    await expect(this.cells).toHaveCount(before + 1);
  }

  async addMarkdownCell(): Promise<void> {
    const before = await this.cells.count();
    await this.addMarkdownCellButton.click();
    await expect(this.cells).toHaveCount(before + 1);
  }

  /** Type source into a cell's editor. */
  async typeInCell(index: number, source: string): Promise<void> {
    const editor = this.cellEditor(index);
    await editor.click();
    await this.page.keyboard.type(source);
  }

  /** Run the focused cell and keep selection (Ctrl+Enter). */
  async runFocusedCell(): Promise<void> {
    await this.page.keyboard.press("Control+Enter");
  }

  /**
   * Leave edit mode (Esc). Adding a cell focuses its editor, which captures
   * Ctrl+Z for its own text history; the global notebook undo only fires in
   * command mode, so callers exit edit mode first.
   */
  async exitEditMode(): Promise<void> {
    await this.page.keyboard.press("Escape");
  }

  async undo(): Promise<void> {
    await this.page.keyboard.press("Control+z");
  }

  async redo(): Promise<void> {
    await this.page.keyboard.press("Control+Shift+z");
  }

  // --- Assertions / reads ----------------------------------------------------

  async cellCount(): Promise<number> {
    return this.cells.count();
  }

  /** The session id from the `?session=` query param the app assigns on load. */
  sessionId(): Promise<string | null> {
    return this.page.evaluate(
      () => new URLSearchParams(window.location.search).get("session"),
    );
  }

  /**
   * Number of cells in the autosaved session payload for `id`, or -1 if nothing
   * is persisted yet. Lets tests wait for the debounced autosave to flush
   * before reloading.
   */
  persistedCellCount(id: string): Promise<number> {
    return this.page.evaluate((sessionId) => {
      const raw = localStorage.getItem(`pynote-session-${sessionId}`);
      if (!raw) return -1;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.cells) ? parsed.cells.length : -1;
      } catch {
        return -1;
      }
    }, id);
  }

  /** The combined visible text of all output regions. */
  async outputText(): Promise<string> {
    const count = await this.outputs.count();
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      parts.push((await this.outputs.nth(i).textContent()) ?? "");
    }
    return parts.join("\n");
  }

  /** Read a CSS custom property set on :root (used for theme assertions). */
  cssVariable(name: string): Promise<string> {
    return this.page.evaluate(
      (varName) =>
        document.documentElement.style.getPropertyValue(varName).trim(),
      name,
    );
  }
}
