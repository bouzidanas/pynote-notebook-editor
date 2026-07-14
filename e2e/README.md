# End-to-End Tests

Browser-level tests running on [Playwright](https://playwright.dev/) against
the real Vite dev server and a real Pyodide kernel. These cover whole user
journeys (author a cell, run it, reload, undo) that the Vitest suite cannot.

## Running tests

From the project root:

| Command                                  | What it does                                  |
| ---------------------------------------- | --------------------------------------------- |
| `npm run test:e2e`                       | Run the full suite (starts the dev server).   |
| `npm run test:e2e -- --headed`           | Watch it drive a visible browser.             |
| `npm run test:e2e -- --debug`            | Step through with the Playwright Inspector.   |
| `npm run test:e2e -- happy-path`         | Run a single spec by filename fragment.       |
| `npm run test:e2e -- -g "undo"`          | Run tests whose title matches.                |

First-time setup installs the browser binary:

```sh
npx playwright install chromium
```

The HTML report lands at `reports/e2e-html`; failure traces, screenshots, and
videos at `reports/e2e-artifacts`. Configuration:
[playwright.config.ts](../playwright.config.ts).

## Structure and conventions

Specs live in `tests/`, one user journey per file. Import `test`/`expect`
from `support/fixtures.ts` (not `@playwright/test`) to get the shared
`notebook` page object. Selectors and interactions belong on
[pages/NotebookPage.ts](pages/NotebookPage.ts), not in specs, and testids come
from the shared registry in [src/lib/testids.ts](../src/lib/testids.ts) so a
rename is a compile error instead of a silent break. Use web-first waits
(`expect(locator).toBeVisible()`, attribute assertions) instead of
`waitForTimeout`; kernel readiness is `NotebookPage.waitForKernelReady`.
