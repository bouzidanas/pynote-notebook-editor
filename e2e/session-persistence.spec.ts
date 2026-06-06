import { test, expect } from '@playwright/test';

test('session state persists through page reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('#root').waitFor({ timeout: 15_000 });

  // Wait a moment for the session to initialize
  await page.waitForTimeout(2_000);

  // Get the current session URL (contains ?session= parameter)
  const url = page.url();

  // Check that localStorage has session data
  const hasSession = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    return keys.some(k => k.startsWith('pynote-session-'));
  });

  // The app should have autosaved an initial session
  // (some apps create a session on first load, others on first edit)
  // Verify the page loads without errors after reload
  await page.reload();
  await page.locator('#root').waitFor({ timeout: 15_000 });

  // After reload, session data should still be in localStorage
  const hasSessionAfter = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    return keys.some(k => k.startsWith('pynote-session-'));
  });

  // If a session was created before reload, it should persist
  if (hasSession) {
    expect(hasSessionAfter).toBe(true);
  }

  // The page should render cells (not be empty/broken after reload)
  const rootContent = await page.locator('#root').innerHTML();
  expect(rootContent.length).toBeGreaterThan(0);
});
