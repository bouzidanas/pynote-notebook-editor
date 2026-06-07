// Bridges the application's shared testid registry into the Playwright suite.
// Tests and page objects never hard-code raw `data-testid` strings; they go
// through `byTestId` (or Playwright's built-in `getByTestId`, configured in
// playwright.config.ts to use the `data-testid` attribute). Importing the same
// `TESTID` map the app uses means a renamed hook fails to compile rather than
// silently breaking a selector at runtime.
import { TESTID } from "../../src/lib/testids";

export { TESTID };

/** Build a CSS attribute selector for a registered testid. */
export function byTestId(id: (typeof TESTID)[keyof typeof TESTID]): string {
  return `[data-testid="${id}"]`;
}
