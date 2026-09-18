import { expect, test } from '@playwright/test';
import { currentTool, drag, drawRect, openBoard, selectTool, selection, shapes, shapesOf } from './helpers';

test.describe('rectangles, ellipses and lines', () => {
  test('drag with the rectangle tool creates a rectangle of that size', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 250 });
    expect(r).toMatchObject({ type: 'rect', x: 100, y: 100, w: 200, h: 150, rotation: 0 });
    expect(await selection(page)).toEqual([r.id]);
    expect(await currentTool(page)).toBe('select');
  });

  test('dragging backwards still produces a normalised box', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 300, y: 250 }, { x: 100, y: 100 });
    expect(r).toMatchObject({ x: 100, y: 100, w: 200, h: 150 });
  });

  test('drag with the ellipse tool creates an ellipse', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'ellipse');
    await drag(ctx, { x: 400, y: 100 }, { x: 520, y: 180 });
    const [e] = await shapesOf(page, 'ellipse');
    expect(e).toMatchObject({ x: 400, y: 100, w: 120, h: 80 });
  });

  test('drag with the line tool creates a line between the two points', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'line');
    await drag(ctx, { x: 100, y: 400 }, { x: 300, y: 450 });
    const [l] = await shapesOf(page, 'line');
    expect(l).toMatchObject({ x: 100, y: 400, w: 200, h: 50 });
    expect(l.points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 50 },
    ]);
  });

  test('a plain click with a shape tool drops a default-sized shape', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'rect');
    await page.mouse.click(ctx.origin.x + 500, ctx.origin.y + 500);
    const [r] = await shapes(page);
    expect(r).toMatchObject({ type: 'rect', x: 450, y: 450, w: 100, h: 100 });
  });

  test('keyboard shortcuts pick tools', async ({ page }) => {
    await openBoard(page);
    await page.keyboard.press('o');
    expect(await currentTool(page)).toBe('ellipse');
    await page.keyboard.press('l');
    expect(await currentTool(page)).toBe('line');
    await page.keyboard.press('r');
    expect(await currentTool(page)).toBe('rect');
    await page.keyboard.press('Escape');
    expect(await currentTool(page)).toBe('select');
  });
});
