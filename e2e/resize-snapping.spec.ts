import { type Page, expect, test } from '@playwright/test';
import { drag, drawRect, handle, openBoard, pagePt, selectTool, shapeById, shapesOf } from './helpers';

const guides = (page: Page) => page.evaluate(() => (window as unknown as { __wb: { guides: () => { axis: string; value: number }[] } }).__wb.guides());
const spacing = (page: Page) => page.evaluate(() => (window as unknown as { __wb: { spacingGuides: () => { axis: string; gaps: [number, number][] }[] } }).__wb.spacingGuides());

test.describe('resize snapping and even spacing', () => {
  test('a dragged edge snaps to a neighbour\'s edge with a guide; the anchored edge stays put', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 400, y: 100 }, { x: 500, y: 200 });
    const r = await drawRect(ctx, { x: 100, y: 300 }, { x: 200, y: 400 });
    await selectTool(page, 'select');
    // Drag the right edge to 4px short of the other rectangle's left edge (400): it snaps to 400.
    const e = await handle(page, 'e');
    const from = pagePt(ctx, e);
    const to = pagePt(ctx, { x: 396, y: 350 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    expect(await guides(page)).toContainEqual(expect.objectContaining({ axis: 'x', value: 400 }));
    await page.mouse.up();
    expect(await guides(page)).toEqual([]);
    expect(await shapeById(page, r.id)).toMatchObject({ x: 100, w: 300, y: 300, h: 100 });

    // The bottom edge snaps to the neighbour's centre line (150).
    await drag(ctx, await handle(page, 'n'), { x: 250, y: 153 });
    expect(await shapeById(page, r.id)).toMatchObject({ y: 150, h: 250 });

    // Alt disables it.
    await page.keyboard.down('Alt');
    await drag(ctx, await handle(page, 'n'), { x: 250, y: 104 });
    await page.keyboard.up('Alt');
    expect(await shapeById(page, r.id)).toMatchObject({ y: 104 });
  });

  test('moving a third object snaps it to the spacing of the other two and shows the gaps', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 240, y: 100 }, { x: 340, y: 200 });
    const c = await drawRect(ctx, { x: 600, y: 500 }, { x: 700, y: 600 });
    await selectTool(page, 'select');
    // Row gap is 40, so the third box should land at x=380. Drag it to 384, y 133 (overlapping the row, off any y edge).
    const from = pagePt(ctx, { x: 650, y: 550 });
    const to = pagePt(ctx, { x: 434, y: 183 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    const live = await spacing(page);
    expect(live).toEqual([expect.objectContaining({ axis: 'x', gaps: [[200, 240], [340, 380]] })]);
    await page.mouse.up();
    expect(await spacing(page)).toEqual([]);
    expect(await shapeById(page, c.id)).toMatchObject({ x: 380, y: 133 });
    const xs = (await shapesOf(page, 'rect')).map((s) => s.x);
    expect(xs).toEqual([100, 240, 380]);
  });
});
