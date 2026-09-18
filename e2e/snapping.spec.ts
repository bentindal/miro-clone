import { expect, test } from '@playwright/test';
import { drag, drawRect, openBoard, pagePt, selectTool, shapeById, shapesOf } from './helpers';

async function guides(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as unknown as { __wb: { guides: () => { axis: string; value: number }[] } }).__wb.guides());
}

test.describe('snapping and alignment', () => {
  test('a moved object snaps to a neighbour\'s edge with a guide, and lands exactly aligned', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 400, y: 400 }, { x: 500, y: 500 });
    await selectTool(page, 'select');

    // Drag B so its left edge lands 4px right of A's left edge: it should snap to x=100.
    const from = pagePt(ctx, { x: 450, y: 450 });
    const to = pagePt(ctx, { x: 154, y: 450 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    const live = await guides(page);
    expect(live).toContainEqual(expect.objectContaining({ axis: 'x', value: 100 }));
    await page.mouse.up();
    expect(await guides(page)).toEqual([]);
    expect(await shapeById(page, b.id)).toMatchObject({ x: 100, y: 400 });
    expect(await shapeById(page, a.id)).toMatchObject({ x: 100 });
  });

  test('centres and opposite edges snap too; holding Alt disables snapping', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 200 });
    const b = await drawRect(ctx, { x: 400, y: 400 }, { x: 500, y: 500 });
    await selectTool(page, 'select');
    // B's centre 3px off A's centre x (200): snaps so B.x = 150.
    await drag(ctx, { x: 450, y: 450 }, { x: 203, y: 450 });
    expect(await shapeById(page, b.id)).toMatchObject({ x: 150 });
    // B's top edge 5px below A's bottom edge (200): snaps to y=200.
    await drag(ctx, { x: 200, y: 450 }, { x: 200, y: 255 });
    expect(await shapeById(page, b.id)).toMatchObject({ x: 150, y: 200 });

    await page.keyboard.down('Alt');
    await drag(ctx, { x: 200, y: 250 }, { x: 204, y: 250 });
    await page.keyboard.up('Alt');
    expect(await shapeById(page, b.id)).toMatchObject({ x: 154, y: 200 });
  });

  test('grid snap rounds positions to the grid when no neighbour is close', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await selectTool(page, 'select');
    const grid = page.locator('[data-action="toggle-grid"]');
    await expect(grid).toHaveAttribute('aria-pressed', 'false');
    await drag(ctx, { x: 150, y: 150 }, { x: 463, y: 471 });
    expect(await shapeById(page, r.id)).toMatchObject({ x: 413, y: 421 });

    await grid.click();
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await drag(ctx, { x: 463, y: 471 }, { x: 150, y: 150 });
    expect(await shapeById(page, r.id)).toMatchObject({ x: 100, y: 100 });
    await drag(ctx, { x: 150, y: 150 }, { x: 463, y: 471 });
    expect(await shapeById(page, r.id)).toMatchObject({ x: 420, y: 420 });

    await page.keyboard.press('g');
    await expect(grid).toHaveAttribute('aria-pressed', 'false');
  });

  test('align and distribute commands arrange a multi-selection and undo as one step each', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 150 });
    const b = await drawRect(ctx, { x: 320, y: 220 }, { x: 370, y: 270 });
    const c = await drawRect(ctx, { x: 600, y: 130 }, { x: 700, y: 230 });
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 750, y: 350 });
    const bar = page.getByTestId('property-bar');

    await bar.getByTestId('prop-align-top').click();
    const tops = (await shapesOf(page, 'rect')).map((r) => r.y);
    expect(tops).toEqual([100, 100, 100]);

    await bar.getByTestId('prop-align-centerY').click();
    // Union after align-top: y 100..200, centre 150.
    expect((await shapeById(page, a.id)).y).toBe(125);
    expect((await shapeById(page, b.id)).y).toBe(125);
    expect((await shapeById(page, c.id)).y).toBe(100);

    await bar.getByTestId('prop-distribute-x').click();
    // Span 100..700, widths 250, two gaps of 175: B starts at 375.
    expect((await shapeById(page, b.id)).x).toBe(375);
    expect((await shapeById(page, a.id)).x).toBe(100);
    expect((await shapeById(page, c.id)).x).toBe(600);

    await bar.getByTestId('prop-align-right').click();
    expect((await shapesOf(page, 'rect')).map((r) => r.x! + r.w!)).toEqual([700, 700, 700]);

    await page.keyboard.press('Control+z');
    expect((await shapeById(page, b.id)).x).toBe(375);
    await page.keyboard.press('Control+z');
    expect((await shapeById(page, b.id)).x).toBe(320);
    await page.keyboard.press('Control+z');
    expect((await shapeById(page, a.id)).y).toBe(100);
    await page.keyboard.press('Control+z');
    expect((await shapeById(page, b.id)).y).toBe(220);
  });

  test('distribute needs three objects; align needs two', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 400, y: 300 }, { x: 500, y: 400 });
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 550, y: 450 });
    const bar = page.getByTestId('property-bar');
    await expect(bar.getByTestId('prop-distribute-x')).toBeDisabled();
    await expect(bar.getByTestId('prop-align-left')).toBeEnabled();
    await page.mouse.click(ctx.origin.x + 150, ctx.origin.y + 150);
    await expect(bar.getByTestId('prop-align-left')).toHaveCount(0);
  });
});
