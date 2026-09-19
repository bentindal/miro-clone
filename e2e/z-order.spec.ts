import { expect, test } from '@playwright/test';
import { arrangeAction, click, drawRect, openBoard, order, selectTool, selection } from './helpers';

test.describe('z-order', () => {
  test('bring forward, send backward, bring to front and send to back reorder the stack', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 300 });
    const b = await drawRect(ctx, { x: 150, y: 150 }, { x: 350, y: 350 });
    const c = await drawRect(ctx, { x: 200, y: 200 }, { x: 400, y: 400 });
    expect(await order(page)).toEqual([a.id, b.id, c.id]);
    await selectTool(page, 'select');

    // The topmost shape wins the click where all three overlap.
    await click(ctx, { x: 250, y: 250 });
    expect(await selection(page)).toEqual([c.id]);

    await click(ctx, { x: 120, y: 120 });
    expect(await selection(page)).toEqual([a.id]);
    await page.keyboard.press(']');
    expect(await order(page)).toEqual([b.id, a.id, c.id]);
    await page.keyboard.press(']');
    expect(await order(page)).toEqual([b.id, c.id, a.id]);
    await page.keyboard.press('[');
    expect(await order(page)).toEqual([b.id, a.id, c.id]);
    await arrangeAction(page, 'send-to-back');
    expect(await order(page)).toEqual([a.id, b.id, c.id]);
    await arrangeAction(page, 'bring-to-front');
    expect(await order(page)).toEqual([b.id, c.id, a.id]);

    // Now A is on top and receives the click at the overlap.
    await click(ctx, { x: 600, y: 600 });
    await click(ctx, { x: 250, y: 250 });
    expect(await selection(page)).toEqual([a.id]);
    await page.keyboard.press('{');
    expect(await order(page)).toEqual([a.id, b.id, c.id]);
    await page.keyboard.press('}');
    expect(await order(page)).toEqual([b.id, c.id, a.id]);
  });
});
