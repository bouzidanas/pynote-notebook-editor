import { type Locator, type Page, expect } from "@playwright/test";
import { type PickedFile, writtenFiles } from "../support/file-pickers";
import { TESTID } from "../support/selectors";

export type ExportFormat = "pynote" | "ipynb" | "python" | "markdown" | "pair" | "webapp" | "component";

/**
 * Page object for the Export dialog (Options > Export, Ctrl+E). Pair it
 * with installFilePickerStubs to read back what an export writes.
 */
export class ExportDialog {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get root(): Locator {
    return this.page.getByTestId(TESTID.exportDialog);
  }

  get filename(): Locator {
    return this.page.getByTestId(TESTID.exportFilename);
  }

  get extension(): Locator {
    return this.page.getByTestId(TESTID.exportExtension);
  }

  /** The text an export writes; on the Preview tab (showPreview). */
  get preview(): Locator {
    return this.page.getByTestId(TESTID.exportPreview);
  }

  get settings(): Locator {
    return this.page.getByTestId(TESTID.exportSettings);
  }

  get scriptCheck(): Locator {
    return this.page.getByTestId(TESTID.exportScriptCheck);
  }

  get status(): Locator {
    return this.page.getByTestId(TESTID.exportStatus);
  }

  get exportButton(): Locator {
    return this.page.getByTestId(TESTID.exportButton);
  }

  /** Stops an export that is being built (shown only then). */
  get cancelButton(): Locator {
    return this.page.getByTestId(TESTID.exportCancel);
  }

  /** The component export's setup command (on its Preview tab). */
  get setupCommand(): Locator {
    return this.page.getByTestId(TESTID.exportSetupCommand);
  }

  /** The format the sidebar has selected. */
  get selectedFormat(): Locator {
    return this.root.getByRole("radiogroup", { name: "Format" }).getByRole("radio", { checked: true });
  }

  async open(): Promise<void> {
    await this.page.keyboard.press("Control+e");
    await expect(this.root).toBeVisible();
  }

  async choose(format: ExportFormat): Promise<void> {
    await this.root.locator(`[data-format="${format}"]`).click();
    await expect(this.root.locator(`[data-format="${format}"]`)).toHaveAttribute("aria-checked", "true");
  }

  private tab(name: "Settings" | "Preview"): Locator {
    return this.root.getByRole("tablist", { name: "Format details" }).getByRole("tab", { name, exact: true });
  }

  /** The format's settings (the tab the dialog opens on). */
  async showSettings(): Promise<void> {
    if (await this.settings.isVisible()) return;
    await this.tab("Settings").click();
    await expect(this.settings).toBeVisible();
  }

  async showPreview(): Promise<void> {
    await this.tab("Preview").click();
    await expect(this.preview).toBeVisible();
  }

  option(label: string): Locator {
    return this.root.getByRole("checkbox", { name: label, exact: true });
  }

  async setOption(label: string, checked: boolean): Promise<void> {
    await this.showSettings();
    const box = this.option(label);
    if ((await box.getAttribute("aria-checked")) !== String(checked)) await box.click();
    await expect(box).toHaveAttribute("aria-checked", String(checked));
  }

  async pick(group: string, choice: string): Promise<void> {
    await this.showSettings();
    const radio = this.root.getByRole("radiogroup", { name: group }).getByRole("radio", { name: choice, exact: true });
    await radio.click();
    await expect(radio).toHaveAttribute("aria-checked", "true");
  }

  async setFilename(name: string): Promise<void> {
    await this.filename.fill(name);
  }

  /** Click Export and wait for this many new files to be written. */
  async exportAndCollect(count = 1, timeout = 30_000): Promise<PickedFile[]> {
    const before = (await writtenFiles(this.page)).length;
    await this.exportButton.click();
    await expect.poll(async () => (await writtenFiles(this.page)).length, { timeout }).toBe(before + count);
    await expect(this.root).toBeHidden({ timeout });
    return (await writtenFiles(this.page)).slice(before);
  }
}
