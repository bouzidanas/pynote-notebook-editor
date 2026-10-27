import { defineConfig, devices } from '@playwright/test';

// Exported web apps (e2e/export/). Global setup assembles real exports from
// the production runtime build and a local Pyodide mirror; the specs open them
// the ways readers do (double click from disk, or from a static host) in all
// three engines, with the network blocked for offline exports. Run through
// `npm run test:export`, which builds the runtime and fetches the mirror.
export default defineConfig({
  testDir: './e2e/export',
  globalSetup: './e2e/export/build-exports.ts',
  // Offline exports decode and start Pyodide from the page itself.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // One kernel at a time, as in the app suite.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  outputDir: './reports/export-artifacts',
  reporter: [['list'], ['html', { outputFolder: './reports/export-html', open: 'never' }]],
  use: {
    testIdAttribute: 'data-testid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
