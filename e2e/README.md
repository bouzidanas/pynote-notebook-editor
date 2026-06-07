# End-to-End Tests

Browser-level tests for the PyNote notebook editor, running on
[Playwright](https://playwright.dev/) against the real Vite dev server and a
real Pyodide kernel. These cover whole user journeys (author a cell, run it,
reload, undo) that the [Vitest suite](../src/test/README.md) cannot.

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
videos at `reports/e2e-artifacts`.

## Layout

```
e2e/
  tests/                 # specs — one file per user journey
    happy-path.spec.ts
    session-persistence.spec.ts
    undo-redo.spec.ts
    themed-notebook.spec.ts
  pages/
    NotebookPage.ts      # page object: all selectors + interactions
  support/
    fixtures.ts          # custom `test`/`expect` with a `notebook` fixture
    selectors.ts         # bridges the app's shared testid registry
```

Configuration: [playwright.config.ts](../playwright.config.ts).

## Conventions

These exist to keep the suite from rotting into brittle, flaky seams.

1. **Import `test`/`expect` from `support/fixtures`, never from
   `@playwright/test`.** Every spec then receives a ready `notebook` page
   object and shares the same setup.

2. **Specs never contain selectors.** All locators and interactions live on
   `NotebookPage`. A DOM change is fixed in one place, not across every spec.

3. **Selectors come from the shared testid registry**
   ([src/lib/testids.ts](../src/lib/testids.ts)). The app sets
   `data-testid={TESTID.x}` and tests resolve it via `page.getByTestId`. Because
   both sides import the same map, renaming a hook is a compile error, not a
   silent break. Add a new hook only when no stable role/text selector exists.

4. **Waits are web-first — never `waitForTimeout`.** Use
   `expect(locator).toBeVisible()`, attribute assertions, and `expect.poll`.
   Kernel readiness is awaited via the `data-status="ready"` attribute on the
   status indicator (`NotebookPage.waitForKernelReady`).

5. **Assertions are unconditional.** No `if (maybe) expect(...)`; a test that
   can silently pass without verifying anything is worse than no test.

6. **One journey per spec file**, wrapped in a `test.describe` named for the
   journey.

## Adding a test

1. If you need a new element hook, add it to
   [src/lib/testids.ts](../src/lib/testids.ts) and set `data-testid` on the
   element in the component.
2. Add the locator/action to [pages/NotebookPage.ts](pages/NotebookPage.ts).
3. Write the spec in `tests/`, importing from `../support/fixtures`.
