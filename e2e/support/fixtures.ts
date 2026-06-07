import { test as base } from "@playwright/test";
import { NotebookPage } from "../pages/NotebookPage";

/**
 * Custom fixtures layered on top of Playwright's base test. Importing `test`
 * and `expect` from here (instead of `@playwright/test`) gives every spec a
 * ready-made `notebook` page object, keeping specs free of setup boilerplate.
 *
 * Add new page objects / shared state as additional fixtures here so the wiring
 * stays in one place.
 */
type Fixtures = {
  notebook: NotebookPage;
};

export const test = base.extend<Fixtures>({
  notebook: async ({ page }, use) => {
    await use(new NotebookPage(page));
  },
});

export { expect } from "@playwright/test";
