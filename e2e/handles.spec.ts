import { expect, test } from '@playwright/test';
import { drag, drawRect, handle, openBoard, selectTool, shapesOf } from './helpers';

test.describe('resize and rotate handles', () => {
  test('dragging a corner handle resizes, an edge handle resizes one axis', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 200 });
    const se = await handle(page, 'se');
    expect(se).toEqual({ x: 300, y: 200 });
    await drag(ctx, se, { x: 400, y: 300 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ id: r.id, x: 100, y: 100, w: 300, h: 200 });

    const w = await handle(page, 'w');
    expect(w).toEqual({ x: 100, y: 200 });
    await drag(ctx, w, { x: 50, y: 250 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ x: 50, y: 100, w: 350, h: 200 });

    const nw = await handle(page, 'nw');
    await drag(ctx, nw, { x: 150, y: 150 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ x: 150, y: 150, w: 250, h: 150 });
  });

  test('dragging past the opposite edge flips instead of collapsing', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const e = await handle(page, 'e');
    await drag(ctx, e, { x: 50, y: 150 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ x: 50, y: 100, w: 50, h: 100 });
  });

  test('dragging the rotate handle rotates around the centre', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 200 });
    const rot = await handle(page, 'rotate');
    expect(rot.x).toBe(200);
    expect(rot.y).toBeLessThan(100);
    // From straight up to straight right around the centre (200,150) is +90 degrees.
    await drag(ctx, rot, { x: 300, y: 150 }, { steps: 20 });
    const [r] = await shapesOf(page, 'rect');
    expect(r.rotation).toBeCloseTo(Math.PI / 2, 2);
    expect(r).toMatchObject({ x: 100, y: 100, w: 200, h: 100 });

    // Handles now follow the rotated frame: the "north" handle points right.
    const n = await handle(page, 'n');
    expect(n.x).toBeCloseTo(250, 0);
    expect(n.y).toBeCloseTo(150, 0);
    // Resizing a rotated shape along its own axis keeps the rotation.
    await drag(ctx, n, { x: 300, y: 150 });
    const [after] = await shapesOf(page, 'rect');
    expect(after.rotation).toBeCloseTo(Math.PI / 2, 2);
    expect(after.h).toBeCloseTo(150, 0);
    expect(after.w).toBeCloseTo(200, 0);
  });

  test('a multi-selection scales all members together', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 300, y: 100 }, { x: 400, y: 200 });
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 450, y: 250 });
    const se = await handle(page, 'se');
    expect(se).toEqual({ x: 400, y: 200 });
    await drag(ctx, se, { x: 700, y: 300 });
    const rects = await shapesOf(page, 'rect');
    expect(rects[0]).toMatchObject({ x: 100, y: 100, w: 200, h: 200 });
    expect(rects[1]).toMatchObject({ x: 500, y: 100, w: 200, h: 200 });
  });
});
