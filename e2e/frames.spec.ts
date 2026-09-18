import { expect, test } from '@playwright/test';
import { dblclick, drag, drawRect, openBoard, selectTool, selection, shapesOf, typeAndCommit } from './helpers';

test.describe('frames', () => {
  test('objects inside a frame move with it; the title can be edited', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'frame');
    await drag(ctx, { x: 100, y: 100 }, { x: 500, y: 400 });
    const [frame] = await shapesOf(page, 'frame');
    expect(frame).toMatchObject({ x: 100, y: 100, w: 400, h: 300, title: 'Frame' });

    const inside = await drawRect(ctx, { x: 200, y: 200 }, { x: 300, y: 300 });
    expect(inside.parentId).toBe(frame.id);
    const outside = await drawRect(ctx, { x: 600, y: 200 }, { x: 700, y: 300 });
    expect(outside.parentId).toBeNull();

    // Drag the frame by its title bar; the inner rect follows, the outer one stays.
    await selectTool(page, 'select');
    await drag(ctx, { x: 300, y: 90 }, { x: 400, y: 140 });
    expect((await shapesOf(page, 'frame'))[0]).toMatchObject({ x: 200, y: 150 });
    const rects = await shapesOf(page, 'rect');
    expect(rects.find((r) => r.id === inside.id)).toMatchObject({ x: 300, y: 250 });
    expect(rects.find((r) => r.id === outside.id)).toMatchObject({ x: 600, y: 200 });

    // Dragging a shape into the frame adopts it; dragging out releases it.
    await drag(ctx, { x: 650, y: 250 }, { x: 500, y: 350 });
    expect((await shapesOf(page, 'rect')).find((r) => r.id === outside.id)?.parentId).toBe(frame.id);
    await drag(ctx, { x: 500, y: 350 }, { x: 900, y: 600 });
    expect((await shapesOf(page, 'rect')).find((r) => r.id === outside.id)?.parentId).toBeNull();

    // Rename via double-click on the title.
    await dblclick(ctx, { x: 300, y: 140 });
    await page.keyboard.press('Control+a');
    await typeAndCommit(page, 'Sprint 12');
    expect((await shapesOf(page, 'frame'))[0].title).toBe('Sprint 12');
  });

  test('a frame drawn around existing shapes adopts them and sits behind them', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 200, y: 200 }, { x: 300, y: 300 });
    await selectTool(page, 'frame');
    await drag(ctx, { x: 100, y: 100 }, { x: 500, y: 400 });
    const [frame] = await shapesOf(page, 'frame');
    expect((await shapesOf(page, 'rect'))[0].parentId).toBe(frame.id);
    const ids = await page.evaluate(() => (window as unknown as { __wb: { order: () => string[] } }).__wb.order());
    expect(ids).toEqual([frame.id, a.id]);
    // Clicking inside the frame's empty area does not select the frame.
    await selectTool(page, 'select');
    await page.mouse.click(ctx.origin.x + 400, ctx.origin.y + 350);
    expect(await selection(page)).toEqual([]);
    await page.mouse.click(ctx.origin.x + 400, ctx.origin.y + 100);
    expect(await selection(page)).toEqual([frame.id]);
    // Deleting the frame removes its contents.
    await page.keyboard.press('Delete');
    expect(await shapesOf(page, 'rect')).toHaveLength(0);
  });
});
