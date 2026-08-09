import { defineConfig, devices } from '@playwright/test';
import { createServer } from 'node:net';

const allocatePort = () => new Promise<number>((resolve, reject) => {
  const server = createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      reject(new Error('Could not allocate a port for Playwright'));
      return;
    }
    const { port } = address;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

const e2ePort = process.env.PYNOTE_E2E_PORT
  ? Number(process.env.PYNOTE_E2E_PORT)
  : await allocatePort();
process.env.PYNOTE_E2E_PORT = String(e2ePort);

// End-to-end configuration. The suite drives the real Vite dev server with a
// real Pyodide kernel, so timeouts are generous and runs are serial to avoid
// starting several resource-heavy WASM kernels at once.
export default defineConfig({
  testDir: './e2e/tests',
  // Pyodide cold-starts the kernel, so individual tests need headroom.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Each test gets a fresh page and kernel; run one at a time to limit resource use.
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
    baseURL: `http://127.0.0.1:${e2ePort}`,
    // Stable hooks come from the shared registry (src/lib/testids.ts).
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    port: e2ePort,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
