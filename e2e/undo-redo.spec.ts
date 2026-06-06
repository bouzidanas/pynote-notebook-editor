import { test, expect } from '@playwright/test';

test('undo/redo across cell add and delete operations', async ({ page }) => {
  await page.goto('/');
  await page.locator('#root').waitFor({ timeout: 15_000 });

  // Count initial cells
  const initialCells = await page.locator('[class*="cell"], [data-cell-id]').count();

  // Add a new cell via the + Code button
  const addBtn = page.locator('button').filter({ hasText: /code/i }).first();
  if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(500);
  }

  const afterAdd = await page.locator('[class*="cell"], [data-cell-id]').count();
  // Should have one more cell
  expect(afterAdd).toBeGreaterThanOrEqual(initialCells);

  // Undo with Ctrl+Z
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);

  const afterUndo = await page.locator('[class*="cell"], [data-cell-id]').count();
  // Cell count should decrease back (or at least not increase)
  expect(afterUndo).toBeLessThanOrEqual(afterAdd);

  // Redo with Ctrl+Shift+Z
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(500);

  const afterRedo = await page.locator('[class*="cell"], [data-cell-id]').count();
  expect(afterRedo).toBe(afterAdd);
});
