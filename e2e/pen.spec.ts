import { expect, test } from '@playwright/test';
import { currentTool, openBoard, pagePt, selectTool, selection, shapesOf } from './helpers';

test.describe('freehand pen', () => {
  test('dragging draws a stroke that follows the pointer path', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'pen');
    const path = [
      { x: 100, y: 500 },
      { x: 150, y: 540 },
      { x: 200, y: 500 },
      { x: 250, y: 560 },
      { x: 300, y: 500 },
    ];
    const first = pagePt(ctx, path[0]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const p of path.slice(1)) {
      const q = pagePt(ctx, p);
      await page.mouse.move(q.x, q.y, { steps: 5 });
    }
    await page.mouse.up();

    const [pen] = await shapesOf(page, 'pen');
    expect(pen).toMatchObject({ x: 100, y: 500, w: 200, h: 60 });
    expect(pen.points!.length).toBeGreaterThanOrEqual(path.length);
    // Every path vertex is present as a point relative to the stroke origin.
    for (const p of path) {
      expect(pen.points).toContainEqual({ x: p.x - 100, y: p.y - 500 });
    }
    expect(await selection(page)).toEqual([pen.id]);
    expect(await currentTool(page)).toBe('select');
  });

  test('a stroke can be selected by clicking on it and deleted', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'pen');
    const a = pagePt(ctx, { x: 100, y: 100 });
    const b = pagePt(ctx, { x: 300, y: 300 });
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    const [pen] = await shapesOf(page, 'pen');
    await page.mouse.click(ctx.origin.x + 600, ctx.origin.y + 600);
    expect(await selection(page)).toEqual([]);
    await page.mouse.click(ctx.origin.x + 200, ctx.origin.y + 200);
    expect(await selection(page)).toEqual([pen.id]);
    await page.keyboard.press('Backspace');
    expect(await shapesOf(page, 'pen')).toHaveLength(0);
  });
});
