import { expect, test } from '@playwright/test';
import { boardAction, click, drag, drawRect, openBoard, openBoardMenu, placeSticky, selectTool, selectTool as tool, shapeById, shapesOf, typeAndCommit } from './helpers';

test.describe('property editing', () => {
  test('fill, stroke and stroke width of a selected shape can be changed and undone', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 100, y: 200 }, { x: 300, y: 300 });
    const bar = page.getByTestId('property-bar');
    await expect(bar).toBeVisible();

    await bar.locator('[data-testid="prop-fill-swatch"][data-color="#e53935"]').click();
    expect(await shapeById(page, r.id)).toMatchObject({ fill: '#e53935', stroke: '#222222', strokeWidth: 2 });
    await bar.locator('[data-testid="prop-stroke-swatch"][data-color="#1e88e5"]').click();
    expect(await shapeById(page, r.id)).toMatchObject({ fill: '#e53935', stroke: '#1e88e5' });
    await bar.getByTestId('prop-width-8').click();
    expect(await shapeById(page, r.id)).toMatchObject({ strokeWidth: 8 });
    await expect(bar.getByTestId('prop-width-8')).toHaveAttribute('aria-pressed', 'true');

    // Each change is one undo step.
    await page.keyboard.press('Control+z');
    expect(await shapeById(page, r.id)).toMatchObject({ strokeWidth: 2, stroke: '#1e88e5' });
    await page.keyboard.press('Control+z');
    expect(await shapeById(page, r.id)).toMatchObject({ stroke: '#222222', fill: '#e53935' });
    await page.keyboard.press('Control+z');
    expect(await shapeById(page, r.id)).toMatchObject({ fill: '#ffffff' });
    await page.keyboard.press('Control+Shift+z');
    expect(await shapeById(page, r.id)).toMatchObject({ fill: '#e53935' });
  });

  test('a custom colour applies through the colour input', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 100, y: 200 }, { x: 300, y: 300 });
    await page.getByTestId('prop-fill-custom').fill('#123456');
    expect(await shapeById(page, r.id)).toMatchObject({ fill: '#123456' });
  });

  test('a multi-selection applies the change to every shape that supports it', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 100, y: 200 }, { x: 200, y: 300 });
    await tool(page, 'ellipse');
    await drag(ctx, { x: 300, y: 200 }, { x: 400, y: 300 });
    const [e] = await shapesOf(page, 'ellipse');
    await tool(page, 'line');
    await drag(ctx, { x: 500, y: 200 }, { x: 600, y: 300 });
    const [l] = await shapesOf(page, 'line');
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 150 }, { x: 650, y: 350 });

    const bar = page.getByTestId('property-bar');
    await bar.locator('[data-testid="prop-fill-swatch"][data-color="#43a047"]').click();
    await bar.getByTestId('prop-width-4').click();
    expect(await shapeById(page, r.id)).toMatchObject({ fill: '#43a047', strokeWidth: 4 });
    expect(await shapeById(page, e.id)).toMatchObject({ fill: '#43a047', strokeWidth: 4 });
    // Lines have no fill; they still take the width.
    expect(await shapeById(page, l.id)).toMatchObject({ strokeWidth: 4 });
    expect((await shapeById(page, l.id)).fill).toBeUndefined();
    // One undo step for the whole multi-selection change.
    await page.keyboard.press('Control+z');
    expect(await shapeById(page, r.id)).toMatchObject({ fill: '#43a047', strokeWidth: 2 });
    expect(await shapeById(page, l.id)).toMatchObject({ strokeWidth: 2 });
  });

  test('sticky colour and text font size have their own controls', async ({ page }) => {
    const ctx = await openBoard(page);
    const n = await placeSticky(ctx, { x: 300, y: 300 });
    const bar = page.getByTestId('property-bar');
    await expect(bar.getByTestId('prop-stroke-swatch')).toHaveCount(0);
    await bar.locator('[data-testid="prop-fill-swatch"][data-color="#90caf9"]').click();
    expect(await shapeById(page, n.id)).toMatchObject({ fill: '#90caf9' });

    await tool(page, 'text');
    await click(ctx, { x: 600, y: 500 });
    await typeAndCommit(page, 'Sized');
    const [t] = await shapesOf(page, 'text');
    await click(ctx, { x: 620, y: 500 });
    await expect(bar).toBeVisible();
    await bar.getByTestId('prop-font-size').selectOption('32');
    expect(await shapeById(page, t.id)).toMatchObject({ fontSize: 32 });
    await bar.getByTestId('prop-text-color').fill('#e53935');
    expect(await shapeById(page, t.id)).toMatchObject({ color: '#e53935' });
  });

  test('the bar follows the selection and hides while dragging or with nothing selected', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 300 }, { x: 300, y: 400 });
    const bar = page.getByTestId('property-bar');
    const box1 = await bar.boundingBox();
    expect(box1).not.toBeNull();
    // Sits above the selection.
    expect(box1!.y + box1!.height).toBeLessThanOrEqual(ctx.origin.y + 300);

    await page.mouse.move(ctx.origin.x + 200, ctx.origin.y + 350);
    await page.mouse.down();
    await page.mouse.move(ctx.origin.x + 500, ctx.origin.y + 350, { steps: 5 });
    await expect(bar).toHaveCount(0);
    await page.mouse.up();
    await expect(bar).toBeVisible();
    const box2 = await bar.boundingBox();
    expect(box2!.x).toBeGreaterThan(box1!.x + 250);

    await click(ctx, { x: 900, y: 550 });
    await expect(bar).toHaveCount(0);

    // With a drawing tool active the bar stays out of the way even with a selection.
    await drawRect(ctx, { x: 100, y: 300 }, { x: 300, y: 400 });
    await expect(bar).toBeVisible();
    await selectTool(page, 'sticky');
    await expect(bar).toHaveCount(0);
    await selectTool(page, 'select');
    await expect(bar).toBeVisible();
  });

  // Showing the first shape's value for a selection that disagrees is a lie
  // the control writes back on the next click, quietly changing the shapes
  // that were already what the person wanted.
  test('a selection that disagrees shows as mixed, and picking a value settles it', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 300, y: 100 }, { x: 400, y: 200 });
    await selectTool(page, 'select');
    const bar = page.getByTestId('property-bar');
    await click(ctx, { x: 150, y: 150 });
    await bar.locator('[data-testid="prop-fill-swatch"][data-color="#e53935"]').click();
    await click(ctx, { x: 350, y: 150 });
    await bar.locator('[data-testid="prop-fill-swatch"][data-color="#1e88e5"]').click();

    await drag(ctx, { x: 50, y: 50 }, { x: 450, y: 250 });
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-testid="prop-fill-swatch"][aria-pressed="true"]')).toHaveCount(0);
    await expect(bar.getByTestId('prop-fill-custom')).toHaveAttribute('data-mixed', 'true');

    await bar.locator('[data-testid="prop-fill-swatch"][data-color="#43a047"]').click();
    expect(await shapeById(page, a.id)).toMatchObject({ fill: '#43a047' });
    expect(await shapeById(page, b.id)).toMatchObject({ fill: '#43a047' });
    await expect(bar.locator('[data-testid="prop-fill-swatch"][data-color="#43a047"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByTestId('prop-fill-custom')).not.toHaveAttribute('data-mixed', 'true');
  });

  test('a dropdown over a disagreeing selection reads Mixed', async ({ page }) => {
    const ctx = await openBoard(page);
    await tool(page, 'text');
    await click(ctx, { x: 600, y: 300 });
    await typeAndCommit(page, 'First');
    await tool(page, 'text');
    await click(ctx, { x: 600, y: 480 });
    await typeAndCommit(page, 'Second');
    await selectTool(page, 'select');
    const bar = page.getByTestId('property-bar');
    await click(ctx, { x: 620, y: 300 });
    await bar.getByTestId('prop-font-size').selectOption('32');

    // Clear the selection first: the bar floats above it, over the point the
    // marquee would otherwise start from.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    await expect(bar).toHaveCount(0);
    // Text shapes are 240 wide; the marquee has to contain them, not clip them.
    await drag(ctx, { x: 540, y: 250 }, { x: 900, y: 560 });
    const sizes = (await shapesOf(page, 'text')).map((t) => (t as unknown as { fontSize: number }).fontSize);
    expect(new Set(sizes).size).toBe(2);
    const select = bar.getByTestId('prop-font-size');
    await expect(select).toHaveAttribute('data-mixed', 'true');
    await expect(select).toHaveValue('');
    await expect(select.locator('option[disabled]')).toHaveText('Mixed');

    await select.selectOption('24');
    await expect.poll(async () => (await shapesOf(page, 'text')).map((t) => (t as unknown as { fontSize: number }).fontSize)).toEqual([24, 24]);
    await expect(select).not.toHaveAttribute('data-mixed', 'true');
  });

  test('styles survive save and load', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 100, y: 200 }, { x: 300, y: 300 });
    const bar = page.getByTestId('property-bar');
    await bar.locator('[data-testid="prop-fill-swatch"][data-color="#fb8c00"]').click();
    await bar.getByTestId('prop-width-1').click();
    const before = await shapeById(page, r.id);
    const downloadPromise = page.waitForEvent('download');
    await boardAction(page, 'save-json');
    const path = (await (await downloadPromise).path())!;
    await openBoard(page);
    await openBoardMenu(page);
    await page.locator('[data-action="load-json"]').setInputFiles(path);
    await expect.poll(() => shapeById(page, r.id)).toEqual(before);
  });
});
