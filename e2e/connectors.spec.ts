import { expect, test } from '@playwright/test';
import { connectorPoints, drag, drawRect, openBoard, selectTool, shapesOf } from './helpers';

test.describe('connectors', () => {
  test('a connector dragged between two shapes attaches to both and follows them', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 400, y: 100 }, { x: 500, y: 200 });

    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 450, y: 150 });
    const [k] = await shapesOf(page, 'connector');
    expect(k.start?.shapeId).toBe(a.id);
    expect(k.end?.shapeId).toBe(b.id);
    let pts = await connectorPoints(page, k.id);
    expect(pts).toEqual({ a: { x: 200, y: 150 }, b: { x: 400, y: 150 } });

    // Move B straight down; both endpoints re-resolve to the shapes' edges.
    await selectTool(page, 'select');
    await drag(ctx, { x: 450, y: 150 }, { x: 450, y: 400 });
    const [movedB] = (await shapesOf(page, 'rect')).filter((s) => s.id === b.id);
    expect(movedB).toMatchObject({ x: 400, y: 350 });
    pts = await connectorPoints(page, k.id);
    expect(pts!.a.x).toBeCloseTo(200, 3);
    expect(pts!.a.y).toBeCloseTo(150 + 250 / 6, 3);
    expect(pts!.b.x).toBeCloseTo(400, 3);
    expect(pts!.b.y).toBeCloseTo(400 - 250 / 6, 3);

    // Move A as well; the start end follows.
    await drag(ctx, { x: 150, y: 150 }, { x: 150, y: 400 });
    pts = await connectorPoints(page, k.id);
    expect(pts).toEqual({ a: { x: 200, y: 400 }, b: { x: 400, y: 400 } });
  });

  test('a connector can start on empty board and end on a shape', async ({ page }) => {
    const ctx = await openBoard(page);
    const b = await drawRect(ctx, { x: 400, y: 100 }, { x: 500, y: 200 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 100, y: 150 }, { x: 450, y: 150 });
    const [k] = await shapesOf(page, 'connector');
    expect(k.start?.shapeId).toBeNull();
    expect(k.start?.point).toEqual({ x: 100, y: 150 });
    expect(k.end?.shapeId).toBe(b.id);
    const pts = await connectorPoints(page, k.id);
    expect(pts).toEqual({ a: { x: 100, y: 150 }, b: { x: 400, y: 150 } });
  });

  test('deleting a shape frees the attached connector end at its last position', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 400, y: 100 }, { x: 500, y: 200 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 450, y: 150 });
    await selectTool(page, 'select');
    await page.mouse.click(ctx.origin.x + 450, ctx.origin.y + 150);
    await page.keyboard.press('Delete');
    expect(await shapesOf(page, 'rect')).toHaveLength(1);
    const [k] = await shapesOf(page, 'connector');
    expect(k.end?.shapeId).toBeNull();
    expect(k.end?.point).toEqual({ x: 400, y: 150 });
  });
});
