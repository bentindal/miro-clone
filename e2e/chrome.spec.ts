import { expect, test } from '@playwright/test';
import { drag, drawRect, handle, openBoard, pagePt, selectTool, selection, shapesOf } from './helpers';

/** The CSS cursor the board is showing, after moving the pointer over it. */
async function cursorOverCanvas(page: import('@playwright/test').Page, at: { x: number; y: number }): Promise<string> {
  await page.mouse.move(at.x, at.y);
  return page.locator('.board').evaluate((el) => getComputedStyle(el).cursor);
}

test.describe('canvas chrome', () => {
  test('each drawing tool has its own cursor, and select keeps the arrow', async ({ page }) => {
    const ctx = await openBoard(page);
    const empty = pagePt(ctx, { x: 700, y: 600 });

    await selectTool(page, 'select');
    expect(await cursorOverCanvas(page, empty)).toBe('default');

    const seen = new Set<string>();
    for (const tool of ['rect', 'ellipse', 'line', 'sticky', 'text', 'pen', 'connector', 'frame', 'comment'] as const) {
      await selectTool(page, tool);
      const cursor = await cursorOverCanvas(page, empty);
      expect(cursor, tool).toContain('data:image/svg+xml');
      expect(seen.has(cursor), `${tool} reuses another tool's cursor`).toBe(false);
      seen.add(cursor);
    }

    // The hand is the browser's own grab, which people already read correctly.
    await selectTool(page, 'hand');
    expect(await cursorOverCanvas(page, empty)).toBe('grab');
  });

  // The handles were made smaller to look less like a debug harness. Shrinking
  // what is drawn must not shrink what can be grabbed.
  test('a resize handle can be grabbed from outside the square that is drawn', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 200 });
    const se = await handle(page, 'se');
    // The drawn handle is 7px across, so 6px diagonally out is well outside it
    // but inside the 9px grab radius. The corner follows the pointer.
    await drag(ctx, { x: se.x + 6, y: se.y + 6 }, { x: se.x + 106, y: se.y + 106 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ x: 100, y: 100, w: 306, h: 206 });

    // Far enough out it is board again, not a handle: this marquees and
    // finds nothing rather than resizing. Without it the test above would
    // still pass if the grab radius swallowed the whole board.
    const se2 = await handle(page, 'se');
    await drag(ctx, { x: se2.x + 12, y: se2.y + 12 }, { x: se2.x + 112, y: se2.y + 112 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ w: 306, h: 206 });
    expect(await selection(page)).toEqual([]);
  });
});
