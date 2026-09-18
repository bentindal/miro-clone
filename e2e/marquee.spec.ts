import { expect, test } from '@playwright/test';
import { click, drag, drawRect, openBoard, selectTool, selection } from './helpers';

test.describe('multi-select with marquee', () => {
  test('dragging on empty board selects everything fully inside; shift-click toggles', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 300, y: 100 }, { x: 400, y: 200 });
    const c = await drawRect(ctx, { x: 600, y: 100 }, { x: 700, y: 200 });
    await selectTool(page, 'select');

    await drag(ctx, { x: 50, y: 50 }, { x: 450, y: 250 });
    expect(new Set(await selection(page))).toEqual(new Set([a.id, b.id]));

    // A marquee that only partially covers C does not select it.
    await drag(ctx, { x: 50, y: 50 }, { x: 650, y: 250 });
    expect(new Set(await selection(page))).toEqual(new Set([a.id, b.id]));

    await click(ctx, { x: 650, y: 150 }, { shift: true });
    expect(new Set(await selection(page))).toEqual(new Set([a.id, b.id, c.id]));
    await click(ctx, { x: 150, y: 150 }, { shift: true });
    expect(new Set(await selection(page))).toEqual(new Set([b.id, c.id]));

    await click(ctx, { x: 500, y: 500 });
    expect(await selection(page)).toEqual([]);
  });

  test('a marquee with shift adds to the existing selection', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 500, y: 400 }, { x: 600, y: 500 });
    await selectTool(page, 'select');
    await click(ctx, { x: 150, y: 150 });
    expect(await selection(page)).toEqual([a.id]);
    await drag(ctx, { x: 450, y: 350 }, { x: 650, y: 550 }, { shift: true });
    expect(new Set(await selection(page))).toEqual(new Set([a.id, b.id]));
  });

  test('moving a multi-selection moves every member', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 300, y: 100 }, { x: 400, y: 200 });
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 450, y: 250 });
    await drag(ctx, { x: 150, y: 150 }, { x: 150, y: 350 });
    const boxes = (await page.evaluate(() => (window as unknown as { __wb: { shapes: () => { x: number; y: number }[] } }).__wb.shapes())).map((s) => [s.x, s.y]);
    expect(boxes).toEqual([
      [100, 300],
      [300, 300],
    ]);
  });
});
