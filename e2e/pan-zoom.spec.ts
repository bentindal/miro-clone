import { expect, test } from '@playwright/test';
import { camera, drawRect, openBoard, pagePt, pinch, toWorld } from './helpers';

test.describe('infinite pan and zoom', () => {
  test('wheel scrolls the board in both axes', async ({ page }) => {
    const ctx = await openBoard(page);
    const start = await camera(page);
    expect(start).toEqual({ tx: 0, ty: 0, zoom: 1 });
    const mid = pagePt(ctx, { x: 400, y: 300 });
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => camera(page)).toEqual({ tx: 0, ty: -120, zoom: 1 });
    await page.mouse.wheel(-80, 0);
    await expect.poll(() => camera(page)).toEqual({ tx: 80, ty: -120, zoom: 1 });
  });

  test('trackpad pinch zooms around the cursor', async ({ page }) => {
    const ctx = await openBoard(page);
    const at = { x: 500, y: 350 };
    const worldBefore = await toWorld(page, at);
    await pinch(ctx, at, -100);
    const cam = await camera(page);
    expect(cam.zoom).toBeGreaterThan(1.5);
    const worldAfter = await toWorld(page, at);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    await expect(page.getByTestId('zoom-level')).toHaveText(`${Math.round(cam.zoom * 100)}%`);

    await pinch(ctx, at, 250);
    const out = await camera(page);
    expect(out.zoom).toBeLessThan(1);
    const worldOut = await toWorld(page, at);
    expect(worldOut.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldOut.y).toBeCloseTo(worldBefore.y, 6);
  });

  test('zoom is clamped to the allowed range', async ({ page }) => {
    const ctx = await openBoard(page);
    for (let i = 0; i < 12; i++) await pinch(ctx, { x: 300, y: 300 }, -200);
    expect((await camera(page)).zoom).toBe(8);
    for (let i = 0; i < 30; i++) await pinch(ctx, { x: 300, y: 300 }, 400);
    expect((await camera(page)).zoom).toBe(0.05);
  });

  test('the board extends indefinitely: objects can be placed far from the origin', async ({ page }) => {
    const ctx = await openBoard(page);
    const mid = pagePt(ctx, { x: 400, y: 300 });
    await page.mouse.move(mid.x, mid.y);
    for (let i = 0; i < 25; i++) await page.mouse.wheel(4000, 4000);
    const cam = await camera(page);
    expect(cam.tx).toBe(-100000);
    expect(cam.ty).toBe(-100000);
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    expect(r.x).toBe(100100);
    expect(r.y).toBe(100100);
    // Panning back reveals the origin again while the object stays put.
    for (let i = 0; i < 25; i++) await page.mouse.wheel(-4000, -4000);
    expect(await camera(page)).toEqual({ tx: 0, ty: 0, zoom: 1 });
    await page.getByRole('button', { name: 'Fit' }).click();
    const fit = await camera(page);
    expect(fit.zoom).toBeLessThanOrEqual(8);
  });
});
