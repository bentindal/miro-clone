import { expect, test } from '@playwright/test';
import { drawRect, openBoard, shapesOf } from './helpers';

/**
 * What a static host with no sync server does: it answers /api/… with its own
 * 404 page rather than not answering at all.
 */
async function serveStaticHost404(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404: NOT_FOUND</title>' }));
}

test.describe('with no sync server', () => {
  // This was a dead end in production: the host's HTML 404 read as "this board
  // does not exist", and the only way out of that page — starting a new board
  // — failed the same way, so it looped.
  test('the board still opens, in this tab only', async ({ page }) => {
    await serveStaticHost404(page);
    const ctx = await openBoard(page);

    await expect(page.getByTestId('boot-error')).toHaveCount(0);
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'local');
    await expect(page.getByTestId('sync-status')).toHaveText('Local only');

    // And it is a working board, not just a friendlier message.
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 240, y: 200 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ id: r.id, w: 140, h: 100 });
  });

  test('a share link opens locally too, rather than claiming the board is gone', async ({ page }) => {
    await serveStaticHost404(page);
    await page.goto('/b/whatever#token');
    await expect(page.getByTestId('boot-error')).toHaveCount(0);
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'local');
  });

  // The other half: when a server does answer, its answer still stands.
  test('a board the server says is missing still reports that', async ({ page }) => {
    await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unknown board' }) }));
    await page.goto('/b/gone#token');
    await expect(page.getByTestId('boot-error')).toBeVisible();
    await expect(page.getByTestId('boot-error')).toContainText('This board does not exist.');
  });

  test('a link the server rejects still reports that', async ({ page }) => {
    await page.route('**/api/**', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Bad token' }) }));
    await page.goto('/b/private#token');
    await expect(page.getByTestId('boot-error')).toContainText('This link is not valid for this board.');
  });
});
