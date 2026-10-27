import { defineConfig, devices } from '@playwright/test';
import { createServer } from 'node:net';
import path from 'node:path';

// The pynote package inside real projects (test/consumers: Astro with MDX,
// SolidStart, Next.js in TypeScript, whose build type-checks the config
// import, plain HTML), built and served the way they ship, and the Next.js
// one in development too (React's StrictMode). `npm run
// test:consumers` builds the package, prepares the projects
// (scripts/prepare-consumers.mjs: npx pynote add, then a production build)
// and runs e2e/consumers/. Chromium routes the kernel's Pyodide requests and
// the font stylesheets to local copies, so nothing goes online.

const allocatePort = () => new Promise<number>((resolve, reject) => {
  const server = createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('Could not allocate a port'));
    server.close(() => resolve(address.port));
  });
});

const work = path.join(import.meta.dirname, '.cache/consumers');

// How each project serves its production build (and Next.js its development
// server, from the same project folder: `next dev` builds into .next/dev).
const SERVERS: Record<string, (port: number) => { project?: string; command: string; env?: Record<string, string> }> = {
  // A static build, served as plain files (astro preview can background itself).
  astro: (port) => ({ command: `node ${path.join(import.meta.dirname, 'e2e/export/static-server.ts')} dist ${port}` }),
  solidstart: (port) => ({ command: 'npm run start', env: { PORT: String(port), HOST: '127.0.0.1' } }),
  next: (port) => ({ command: `npm run start -- -p ${port} -H 127.0.0.1`, env: { NEXT_TELEMETRY_DISABLED: '1' } }),
  'next-dev': (port) => ({ project: 'next', command: `npx next dev -p ${port} -H 127.0.0.1`, env: { NEXT_TELEMETRY_DISABLED: '1' } }),
  html: (port) => ({ command: `npm run preview -- --port ${port} --host 127.0.0.1 --strictPort` }),
};

// Ports are chosen once; workers re-read this config and inherit the env
// (PYNOTE_CONSUMER_ASTRO, PYNOTE_CONSUMER_NEXT_DEV and so on).
const webServer = [];
for (const [name, server] of Object.entries(SERVERS)) {
  const key = `PYNOTE_CONSUMER_${name.toUpperCase().replace(/-/g, '_')}`;
  const port = process.env[key] ? Number(new URL(process.env[key]).port) : await allocatePort();
  process.env[key] = `http://127.0.0.1:${port}`;
  const { project = name, command, env } = server(port);
  webServer.push({ command, cwd: path.join(work, project), url: process.env[key], env, reuseExistingServer: false, timeout: 60_000 });
}

export default defineConfig({
  testDir: './e2e/consumers',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  outputDir: './reports/consumers-artifacts',
  reporter: [['list'], ['html', { outputFolder: './reports/consumers-html', open: 'never' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
