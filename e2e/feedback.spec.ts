import { expect, test } from '@playwright/test';
import { boardAction, drawRect, openBoard, selectTool } from './helpers';

test.describe('feedback', () => {
  test('an empty board says what to do first, and stops saying it once you have', async ({ page }) => {
    const ctx = await openBoard(page);
    const hint = page.getByTestId('empty-board');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Start with a sticky note');

    // The hint sits exactly where the first drag starts, so it must not be
    // able to take that drag. Draw straight through the middle of it.
    const mid = { x: Math.round(ctx.width / 2), y: Math.round(ctx.height / 2) };
    const r = await drawRect(ctx, { x: mid.x - 60, y: mid.y - 30 }, { x: mid.x + 60, y: mid.y + 30 });
    expect(r).toMatchObject({ w: 120, h: 60 });
    await expect(hint).toHaveCount(0);
  });

  test('a save is confirmed by a toast that goes away on its own', async ({ page }) => {
    await openBoard(page);
    const downloadPromise = page.waitForEvent('download');
    await boardAction(page, 'save-json');
    await downloadPromise;

    const toast = page.getByTestId('toast');
    await expect(toast).toContainText('Saved board.json');
    await expect(toast).toHaveAttribute('data-kind', 'success');
    // Nothing has to be clicked for it to leave.
    await expect(toast).toHaveCount(0, { timeout: 6000 });
  });

  test('a toast can be dismissed by hand', async ({ page }) => {
    await openBoard(page);
    const downloadPromise = page.waitForEvent('download');
    await boardAction(page, 'save-json');
    await downloadPromise;
    await page.getByTestId('toast').getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test('the chrome animates, and does not when motion is turned down', async ({ page }) => {
    await openBoard(page);
    const animationOfOpenDock = async () => {
      await page.locator('[data-action="toggle-comments"]').click();
      const name = await page.locator('.dock-panel').evaluate((el) => getComputedStyle(el).animationName);
      await page.locator('[data-action="toggle-comments"]').click();
      return name;
    };
    expect(await animationOfOpenDock()).toBe('ui-slide-from-right');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await animationOfOpenDock()).toBe('none');
    // And the property bar, which fades rather than moves.
    await selectTool(page, 'select');
    expect(await page.locator('.empty-board').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});
