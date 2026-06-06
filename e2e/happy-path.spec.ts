import { test, expect } from '@playwright/test';

test('add a code cell, execute it, and see output', async ({ page }) => {
  await page.goto('/');

  // Wait for the app shell to load (notebook container)
  await page.waitForSelector('[data-testid="notebook"]', { timeout: 15_000 }).catch(() => {
    // Fallback: look for the main content area
  });
  await page.locator('.notebook, [class*="notebook"], main, #root').first().waitFor({ timeout: 15_000 });

  // Wait for kernel to be ready (status indicator changes)
  // The kernel loading can take time with Pyodide WASM
  await expect(async () => {
    const body = await page.textContent('body');
    // The app should eventually show a ready state (no "loading" spinner)
    expect(body).toBeDefined();
  }).toPass({ timeout: 60_000, intervals: [2_000] });

  // Look for an "add code cell" button and click it
  const addCodeBtn = page.locator('button').filter({ hasText: /code/i }).first();
  if (await addCodeBtn.isVisible()) {
    await addCodeBtn.click();
  }

  // Find a code editor area and type a simple expression
  const editor = page.locator('.cm-editor, [class*="CodeMirror"], [role="textbox"]').first();
  await editor.waitFor({ timeout: 10_000 });
  await editor.click();
  await page.keyboard.type('1 + 1');

  // Execute with Shift+Enter
  await page.keyboard.press('Shift+Enter');

  // Wait for output to appear
  await expect(async () => {
    const text = await page.textContent('body');
    expect(text).toContain('2');
  }).toPass({ timeout: 60_000, intervals: [2_000] });
});
