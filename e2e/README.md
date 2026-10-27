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

First-time setup installs the browser binaries.
The export suite uses all three, and the app suite also runs some Export dialog tests (modal focus and downloads without folder access) in WebKit:

```sh
npx playwright install chromium firefox webkit
```

Every Pyodide request is answered from the local mirror in `.cache/pyodide/` (the `pyodideMirror` fixture in `support/fixtures.ts`), so the suite never depends on the network.
`npm run test:e2e` fetches the mirror first; a package a test imports must be in it (`scripts/fetch-pyodide-mirror.mjs`).

Two more suites have their own configs:

| Command | Suite |
| --- | --- |
| `npm run test:export` | `export/`: web app exports opened from disk and a static host, in Chromium, Firefox and WebKit ([playwright.export.config.ts](../playwright.export.config.ts)). |
| `npm run test:consumers` | `consumers/`: the `pynote` package in real Astro, SolidStart, Next.js (TypeScript, so its build type-checks the documented config import) and HTML projects ([playwright.consumers.config.ts](../playwright.consumers.config.ts)). |

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
