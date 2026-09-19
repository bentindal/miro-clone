import { expect, test } from '@playwright/test';
import { arrangeAction, bounds, click, drag, drawRect, openBoard, selectTool, selection, shapes, shapesOf } from './helpers';

test.describe('group and ungroup', () => {
  test('grouped objects select and move as one, ungroup restores them', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 300, y: 100 }, { x: 400, y: 200 });
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 450, y: 250 });
    await page.keyboard.press('Control+g');

    const sel = await selection(page);
    expect(sel).toHaveLength(1);
    const [group] = await shapesOf(page, 'group');
    expect(sel[0]).toBe(group.id);
    const rects = await shapesOf(page, 'rect');
    expect(rects.every((r) => r.parentId === group.id)).toBe(true);
    expect(await bounds(page, group.id)).toEqual({ x: 100, y: 100, w: 300, h: 100 });

    // Clicking a member selects the group; dragging moves both members.
    await click(ctx, { x: 500, y: 500 });
    expect(await selection(page)).toEqual([]);
    await click(ctx, { x: 150, y: 150 });
    expect(await selection(page)).toEqual([group.id]);
    await drag(ctx, { x: 150, y: 150 }, { x: 250, y: 300 });
    const moved = await shapesOf(page, 'rect');
    expect(moved.find((r) => r.id === a.id)).toMatchObject({ x: 200, y: 250 });
    expect(moved.find((r) => r.id === b.id)).toMatchObject({ x: 400, y: 250 });

    await page.keyboard.press('Control+Shift+g');
    expect(await shapesOf(page, 'group')).toHaveLength(0);
    expect((await shapesOf(page, 'rect')).every((r) => r.parentId === null)).toBe(true);
    expect(new Set(await selection(page))).toEqual(new Set([a.id, b.id]));
    await click(ctx, { x: 600, y: 600 });
    await click(ctx, { x: 250, y: 300 });
    expect(await selection(page)).toEqual([a.id]);
  });

  test('groups nest and the toolbar buttons work too', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 300, y: 100 }, { x: 400, y: 200 });
    await drawRect(ctx, { x: 500, y: 100 }, { x: 600, y: 200 });
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 450, y: 250 });
    await arrangeAction(page, 'group');
    const [inner] = await shapesOf(page, 'group');
    await drag(ctx, { x: 50, y: 50 }, { x: 650, y: 250 });
    await arrangeAction(page, 'group');
    const groups = await shapesOf(page, 'group');
    expect(groups).toHaveLength(2);
    const outer = groups.find((g) => g.id !== inner.id)!;
    expect(groups.find((g) => g.id === inner.id)?.parentId).toBe(outer.id);
    await click(ctx, { x: 150, y: 150 });
    expect(await selection(page)).toEqual([outer.id]);
    await arrangeAction(page, 'ungroup');
    expect(await shapesOf(page, 'group')).toHaveLength(1);
    expect((await shapes(page)).filter((s) => s.parentId === inner.id)).toHaveLength(2);
  });
});
