# PyNote Test Suite

Unit and component tests. Tests live next to the code they cover
(`*.test.ts` / `*.test.tsx`) and run on [Vitest](https://vitest.dev/) with
[jsdom](https://github.com/jsdom/jsdom) and
[`@solidjs/testing-library`](https://github.com/solidjs/solid-testing-library).

## Running tests

From the project root:

| Command                     | What it does                                              |
| --------------------------- | --------------------------------------------------------- |
| `npm test`                  | One-shot run (used by CI).                                |
| `npm run test:watch`        | Re-runs on file changes.                                  |
| `npm run test:coverage`     | One-shot + V8 coverage at `reports/coverage/index.html`.  |
| `npm run test:ci`           | One-shot + JUnit XML at `reports/junit.xml`.              |

Targeted runs (forward args after `--`):

```sh
npm test -- src/lib/markdownSplit.test.ts   # single file
npm test -- -t "smart cursor"               # tests whose name matches
npm run test:watch -- src/components        # watch a folder
```

Setup (jest-dom matchers, auto-cleanup) is in [setup.ts](setup.ts).
Configuration: [vitest.config.ts](../../vitest.config.ts),
[tsconfig.test.json](../../tsconfig.test.json).
