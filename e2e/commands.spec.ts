import { expect, test } from '@playwright/test';
import { type BoardCtx, type Pt, click, ctrl, drawRect, openBoard, pagePt, selectTool, selection, shapes } from './helpers';

async function rightClick(ctx: BoardCtx, p: Pt): Promise<void> {
  const q = pagePt(ctx, p);
  await ctx.page.mouse.click(q.x, q.y, { button: 'right' });
}

test.describe('the command palette', () => {
  test('opens on Ctrl+K, filters, and runs what is highlighted', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 200, y: 200 }, { x: 320, y: 300 });
    await selectTool(page, 'select');
    await click(ctx, { x: 260, y: 250 });
    expect(await selection(page)).toHaveLength(1);

    await page.getByTestId('canvas').focus();
    await page.keyboard.press(`${ctrl(page)}+KeyK`);
    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible();

    await page.getByTestId('palette-input').fill('duplic');
    const rows = palette.locator('.palette-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-action', 'duplicate');
    // The row advertises the key that also runs it.
    await expect(rows.first().locator('kbd')).toHaveText('Ctrl+D');

    await page.keyboard.press('Enter');
    await expect(palette).toHaveCount(0);
    expect(await shapes(page)).toHaveLength(2);
  });

  test('moves the highlight with the arrow keys and closes on Escape', async ({ page }) => {
    await openBoard(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press(`${ctrl(page)}+KeyK`);
    await page.getByTestId('palette-input').fill('zoom');
    const rows = page.getByTestId('command-palette').locator('.palette-row');
    await expect(rows.nth(0)).toHaveAttribute('data-active', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(0)).toHaveAttribute('data-active', 'false');
    await expect(rows.nth(1)).toHaveAttribute('data-active', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-palette')).toHaveCount(0);
  });

  // A command that is missing reads as a command that does not exist; a
  // command that is greyed says why nothing happened.
  test('lists a command that cannot run right now, disabled', async ({ page }) => {
    await openBoard(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press(`${ctrl(page)}+KeyK`);
    await page.getByTestId('palette-input').fill('group');
    const group = page.locator('.palette-row[data-action="group"]');
    await expect(group).toBeVisible();
    await expect(group).toBeDisabled();
  });

  test('says so when nothing matches', async ({ page }) => {
    await openBoard(page);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press(`${ctrl(page)}+KeyK`);
    await page.getByTestId('palette-input').fill('teleport');
    await expect(page.getByTestId('command-palette').locator('.palette-row')).toHaveCount(0);
    await expect(page.getByTestId('command-palette')).toContainText('No command matches');
  });
});

test.describe('the context menu', () => {
  test('selects what is under the pointer and offers the selection commands', async ({ page }) => {
    const ctx = await openBoard(page);
    const rect = await drawRect(ctx, { x: 200, y: 200 }, { x: 320, y: 300 });
    await selectTool(page, 'select');
    await click(ctx, { x: 600, y: 400 });
    expect(await selection(page)).toEqual([]);

    await rightClick(ctx, { x: 260, y: 250 });
    // Right-clicking a shape acts on that shape, not on nothing.
    expect(await selection(page)).toEqual([rect.id]);
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-action="delete"]')).toBeVisible();
    await expect(menu.locator('[data-action="bring-to-front"]')).toBeVisible();

    await menu.locator('[data-action="delete"]').click();
    await expect(page.getByTestId('context-menu')).toHaveCount(0);
    expect(await shapes(page)).toHaveLength(0);
  });

  test('offers the board commands on empty canvas, and closes on Escape', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 200, y: 200 }, { x: 320, y: 300 });
    await selectTool(page, 'select');

    await rightClick(ctx, { x: 700, y: 450 });
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-action="select-all"]')).toBeVisible();
    await expect(menu.locator('[data-action="delete"]')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('context-menu')).toHaveCount(0);

    await rightClick(ctx, { x: 700, y: 450 });
    await page.getByTestId('context-menu').locator('[data-action="select-all"]').click();
    expect(await selection(page)).toHaveLength(1);
  });

  test('stays inside the board when asked for in the bottom-right corner', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'select');
    await rightClick(ctx, { x: ctx.width - 12, y: ctx.height - 12 });
    const box = (await page.getByTestId('context-menu').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(ctx.origin.x + ctx.width);
    expect(box.y + box.height).toBeLessThanOrEqual(ctx.origin.y + ctx.height);
  });
});

test.describe('remappable shortcuts', () => {
  test('a rebind reaches the keyboard, the menus and the palette at once', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 200, y: 200 }, { x: 320, y: 300 });
    await selectTool(page, 'select');
    await click(ctx, { x: 260, y: 250 });

    await page.locator('[data-action="toggle-shortcuts"]').click();
    const panel = page.getByTestId('shortcuts-panel');
    await expect(panel).toBeVisible();
    const button = panel.locator('[data-action="rebind-duplicate"]');
    await expect(button).toHaveText('Ctrl+D');

    await button.click();
    await expect(button).toHaveText('Press a key…');
    await page.keyboard.press(`${ctrl(page)}+KeyJ`);
    await expect(button).toHaveText('Ctrl+J');

    // The palette reads the same store, so it advertises the new key.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press(`${ctrl(page)}+KeyK`);
    await page.getByTestId('palette-input').fill('duplic');
    await expect(page.locator('.palette-row[data-action="duplicate"] kbd')).toHaveText('Ctrl+J');
    await page.keyboard.press('Escape');

    // And the old key no longer does anything.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press(`${ctrl(page)}+KeyD`);
    expect(await shapes(page)).toHaveLength(1);
    await page.keyboard.press(`${ctrl(page)}+KeyJ`);
    expect(await shapes(page)).toHaveLength(2);
  });

  test('taking a key from another command says so, and survives a reload', async ({ page }) => {
    await openBoard(page);
    await selectTool(page, 'select');
    await page.locator('[data-action="toggle-shortcuts"]').click();

    const panel = page.getByTestId('shortcuts-panel');
    await panel.locator('[data-action="rebind-select-all"]').click();
    // Ctrl+D belongs to Duplicate until now.
    await page.keyboard.press(`${ctrl(page)}+KeyD`);
    await expect(page.getByTestId('toaster')).toContainText('Ctrl+D no longer runs Duplicate');
    await expect(panel.locator('[data-action="rebind-duplicate"]')).toHaveText('None');

    await page.reload();
    await openBoard(page, page.url());
    await page.locator('[data-action="toggle-shortcuts"]').click();
    await expect(page.getByTestId('shortcuts-panel').locator('[data-action="rebind-select-all"]')).toHaveText('Ctrl+D');

    // And resetting puts everything back.
    await page.getByTestId('shortcuts-panel').locator('[data-action="reset-shortcuts"]').click();
    await expect(page.getByTestId('shortcuts-panel').locator('[data-action="rebind-duplicate"]')).toHaveText('Ctrl+D');
    await expect(page.getByTestId('shortcuts-panel').locator('[data-action="rebind-select-all"]')).toHaveText('Ctrl+A');
  });
});

test.describe('one definition per action', () => {
  // The zoom cluster used to hold its own copy of every label, key and
  // disabled rule. It is a list of command ids now, so this checks the
  // registry is what the buttons are made of.
  test('the zoom cluster is the registry', async ({ page }) => {
    const ctx = await openBoard(page);
    const cluster = page.locator('.zoom-cluster');
    await expect(cluster.locator('[data-action="undo"]')).toBeDisabled();
    await drawRect(ctx, { x: 200, y: 200 }, { x: 320, y: 300 });
    await expect(cluster.locator('[data-action="undo"]')).toBeEnabled();
    await expect(cluster.locator('[data-action="redo"]')).toBeDisabled();

    await cluster.locator('[data-action="undo"]').click();
    expect(await shapes(page)).toHaveLength(0);
    await expect(cluster.locator('[data-action="redo"]')).toBeEnabled();

    // The tooltip carries the key the registry declares.
    await cluster.locator('[data-action="zoom-fit"]').hover();
    await expect(page.locator('.ui-tooltip').filter({ hasText: 'Zoom to fit' })).toContainText('Shift+1');
  });
});
