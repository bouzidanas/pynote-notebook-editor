// Global test setup. Runs once per worker before any test file is loaded.
// Keep this file small: import side-effect-only globals here, not test
// utilities (those should be imported per-file so failures point clearly
// at the offending suite).

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@solidjs/testing-library";
import { afterEach } from "vitest";

// Ensure the DOM is reset between tests so component suites stay isolated.
afterEach(() => {
  cleanup();
});
