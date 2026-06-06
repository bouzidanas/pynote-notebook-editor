import { test, expect } from '@playwright/test';

test('loading with ?theme=magic_dark applies theme CSS variables', async ({ page }) => {
  await page.goto('/?theme=magic_dark');

  // Wait for app to render
  await page.locator('#root').waitFor({ timeout: 15_000 });

  // Theme is applied synchronously before kernel loads — no need to wait for Pyodide
  // The magic_dark theme has background: #0b0a0f, primary: #b9bbfe
  const bgColor = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--background')
  );
  const primary = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--primary')
  );

  expect(bgColor).toBe('#0b0a0f');
  expect(primary).toBe('#b9bbfe');
});
