import { defineConfig, devices } from '@playwright/test';

// End-to-end configuration. The suite drives the real Vite dev server with a
// real Pyodide kernel, so timeouts are generous and runs are serial (a single
// shared WASM kernel does not parallelize cleanly).
export default defineConfig({
  testDir: './e2e/tests',
  // Pyodide cold-starts the kernel, so individual tests need headroom.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // One kernel, one tab: keep runs deterministic rather than fast.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Test artifacts live under reports/ alongside the vitest coverage output.
  outputDir: './reports/e2e-artifacts',
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: './reports/e2e-html', open: 'never' }], ['junit', { outputFile: './reports/e2e-junit.xml' }]]
    : [['list'], ['html', { outputFolder: './reports/e2e-html', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    // Stable hooks come from the shared registry (src/lib/testids.ts).
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
