import { expect, test } from '@playwright/test';
import { click, connectorPath, connectorPoints, drag, drawRect, openBoard, selectTool, shapeById, shapesOf } from './helpers';

function isOrthogonal(pts: { x: number; y: number }[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i].x - pts[i - 1].x) > 1e-6 && Math.abs(pts[i].y - pts[i - 1].y) > 1e-6) return false;
  }
  return true;
}

test.describe('connector routing and anchors', () => {
  test('dragging from a side anchor pins the connector to that side', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 400, y: 300 }, { x: 500, y: 400 });
    await selectTool(page, 'connector');
    // Start within a few pixels of A's bottom-centre and finish near B's top-centre.
    await drag(ctx, { x: 152, y: 197 }, { x: 448, y: 303 });
    const [k] = await shapesOf(page, 'connector');
    expect(k.start).toMatchObject({ shapeId: a.id, anchor: 'bottom' });
    expect(k.end).toMatchObject({ shapeId: b.id, anchor: 'top' });
    expect(await connectorPoints(page, k.id)).toEqual({ a: { x: 150, y: 200 }, b: { x: 450, y: 300 } });

    // Moving B keeps both ends on their pinned sides.
    await selectTool(page, 'select');
    await drag(ctx, { x: 450, y: 350 }, { x: 650, y: 350 });
    expect(await connectorPoints(page, k.id)).toEqual({ a: { x: 150, y: 200 }, b: { x: 650, y: 300 } });
  });

  test('dragging from the middle of a shape leaves the anchor automatic', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 400, y: 100 }, { x: 500, y: 200 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 450, y: 150 });
    const [k] = await shapesOf(page, 'connector');
    expect(k.start?.anchor).toBe('auto');
    expect(k.end?.anchor).toBe('auto');
  });

  test('elbow and curved styles can be chosen from the property bar and are remembered for new connectors', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 400, y: 350 }, { x: 500, y: 450 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 450, y: 400 });
    const [k] = await shapesOf(page, 'connector');
    expect(k.style).toBe('straight');
    expect(await connectorPath(page, k.id)).toHaveLength(2);

    const bar = page.getByTestId('property-bar');
    await bar.getByTestId('prop-connector-elbow').click();
    expect((await shapeById(page, k.id)).style).toBe('elbow');
    const elbow = (await connectorPath(page, k.id))!;
    expect(elbow.length).toBeGreaterThanOrEqual(3);
    expect(isOrthogonal(elbow)).toBe(true);
    // Automatic anchors: leaves A's right edge and enters B's left edge on the centre-to-centre line.
    expect(elbow[0].x).toBe(200);
    expect(elbow[0].y).toBeCloseTo(150 + 250 / 6, 3);
    expect(elbow[elbow.length - 1].x).toBe(400);
    expect(elbow[elbow.length - 1].y).toBeCloseTo(400 - 250 / 6, 3);

    await bar.getByTestId('prop-connector-curved').click();
    expect((await shapeById(page, k.id)).style).toBe('curved');
    const curved = (await connectorPath(page, k.id))!;
    expect(curved).toHaveLength(25);
    expect(isOrthogonal(curved)).toBe(false);

    // Clicking the curve away from the straight chord still selects it.
    await click(ctx, { x: 900, y: 600 });
    const mid = curved[12];
    await click(ctx, mid);
    expect(await page.evaluate(() => (window as unknown as { __wb: { selection: () => string[] } }).__wb.selection())).toEqual([k.id]);

    // The last chosen style applies to the next connector drawn.
    await drawRect(ctx, { x: 700, y: 100 }, { x: 800, y: 200 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 450, y: 400 }, { x: 750, y: 150 });
    const connectors = await shapesOf(page, 'connector');
    expect(connectors).toHaveLength(2);
    expect(connectors[1].style).toBe('curved');

    // Undo the second connector, the third rect, then the switch to curved.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await shapesOf(page, 'connector')).toHaveLength(1);
    await page.keyboard.press('Control+z');
    expect((await shapeById(page, k.id)).style).toBe('elbow');
  });

  test('anchors can be changed from the property bar', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 400, y: 100 }, { x: 500, y: 200 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 450, y: 150 });
    const [k] = await shapesOf(page, 'connector');
    const bar = page.getByTestId('property-bar');
    await bar.getByTestId('prop-anchor-start').selectOption('top');
    await bar.getByTestId('prop-anchor-end').selectOption('bottom');
    expect(await connectorPoints(page, k.id)).toEqual({ a: { x: 150, y: 100 }, b: { x: 450, y: 200 } });
    await bar.getByTestId('prop-connector-elbow').click();
    const pts = (await connectorPath(page, k.id))!;
    expect(isOrthogonal(pts)).toBe(true);
    // Leaves A upwards and enters B from below.
    expect(pts[1]).toEqual({ x: 150, y: 76 });
    expect(pts[pts.length - 2]).toEqual({ x: 450, y: 224 });
  });
});
