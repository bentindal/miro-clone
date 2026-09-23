import { expect, test } from '@playwright/test';
import { camera, click, ctrl, drawRect, openBoard, selectTool, shapes } from './helpers';

/** Move the camera so the given world point is in the middle of the viewport. */
async function centerOn(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
  await page.evaluate(([px, py]) => (window as never as { __wb: { editor: { centerOn: (p: { x: number; y: number }) => void } } }).__wb.editor.centerOn({ x: px, y: py }), [x, y]);
}

test.describe('the minimap', () => {
  test('shows by default, hides from the zoom cluster, and comes back', async ({ page }) => {
    await openBoard(page);
    const map = page.getByTestId('minimap');
    await expect(map).toBeVisible();

    const toggle = page.locator('.zoom-cluster [data-action="toggle-minimap"]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(map).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(map).toBeVisible();
  });

  test('clicking it moves the camera to that part of the board', async ({ page }) => {
    const ctx = await openBoard(page);
    // Two shapes far apart, so the minimap covers a wide stretch of board.
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await selectTool(page, 'select');
    await centerOn(page, 3000, 2000);
    const before = await camera(page);

    const map = page.getByTestId('minimap');
    const box = (await map.boundingBox())!;
    // The far left of the minimap is the far left of the board.
    await page.mouse.click(box.x + 12, box.y + box.height / 2);
    const after = await camera(page);
    expect(after.zoom).toBe(before.zoom);
    expect(after.tx).toBeGreaterThan(before.tx);

    // And dragging keeps moving it, rather than only the first press landing.
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect((await camera(page)).tx).toBeLessThan(after.tx);
  });

  // The minimap is a way of looking, not a way of editing.
  test('never changes the board', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const before = await shapes(page);
    const box = (await page.getByTestId('minimap').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await shapes(page)).toEqual(before);
  });

  test('keeps clear of the dock when a panel is open', async ({ page }) => {
    await openBoard(page);
    const before = (await page.getByTestId('minimap').boundingBox())!;
    await page.locator('[data-action="toggle-comments"]').click();
    await expect(page.getByTestId('panel-comments')).toBeVisible();
    const after = (await page.getByTestId('minimap').boundingBox())!;
    const panel = (await page.getByTestId('panel-comments').boundingBox())!;
    expect(after.x).toBeLessThan(before.x);
    expect(after.x + after.width).toBeLessThanOrEqual(panel.x + 1);
  });
});

test.describe('zoom to selection', () => {
  test('fills the viewport with the selection and nothing else', async ({ page }) => {
    const ctx = await openBoard(page);
    const near = await drawRect(ctx, { x: 100, y: 100 }, { x: 180, y: 180 });
    await drawRect(ctx, { x: 900, y: 500 }, { x: 1100, y: 700 });
    await selectTool(page, 'select');
    await click(ctx, { x: 140, y: 140 });

    const before = await camera(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Shift+Digit2');
    const after = await camera(page);
    // The small shape now fills the viewport, so the zoom went up a lot.
    expect(after.zoom).toBeGreaterThan(before.zoom * 2);

    // And the selection is centred, which fit-to-board would not be.
    const centre = await page.evaluate(() => {
      const wb = (window as never as { __wb: { camera: () => { tx: number; ty: number; zoom: number }; editor: { viewport: { w: number; h: number } } } }).__wb;
      const c = wb.camera();
      return { x: (wb.editor.viewport.w / 2 - c.tx) / c.zoom, y: (wb.editor.viewport.h / 2 - c.ty) / c.zoom };
    });
    expect(centre.x).toBeCloseTo(near.x + near.w / 2, 0);
    expect(centre.y).toBeCloseTo(near.y + near.h / 2, 0);
  });

  test('is offered in the palette, and greyed with nothing selected', async ({ page }) => {
    const ctx = await openBoard(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press(`${ctrl(page)}+KeyK`);
    await page.getByTestId('palette-input').fill('zoom to selection');
    const row = page.locator('.palette-row[data-action="zoom-selection"]');
    await expect(row).toBeDisabled();
    await expect(row.locator('kbd')).toHaveText('Shift+2');
    await page.keyboard.press('Escape');

    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await selectTool(page, 'select');
    await click(ctx, { x: 150, y: 150 });
    await page.getByTestId('canvas').focus();
    await page.keyboard.press(`${ctrl(page)}+KeyK`);
    await page.getByTestId('palette-input').fill('zoom to selection');
    await expect(page.locator('.palette-row[data-action="zoom-selection"]')).toBeEnabled();
  });
});
