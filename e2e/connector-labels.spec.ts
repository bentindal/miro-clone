import { expect, test } from '@playwright/test';
import { type Browser, type Page } from '@playwright/test';
import { boardAction, click, dblclick, drag, drawRect, openBoard, openBoardMenu, selectTool, selection, shapeById, shapesOf } from './helpers';

async function joinAs(browser: Browser, url: string, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((n) => {
    window.localStorage.setItem('whiteboard.user', JSON.stringify({ name: n, color: '#8e24aa' }));
  }, name);
  const page = await context.newPage();
  await openBoard(page, url);
  return page;
}

test.describe('connector labels and arrowheads', () => {
  test('double-clicking a connector edits its label, which sits at the path midpoint and syncs', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 500, y: 100 }, { x: 600, y: 200 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 550, y: 150 });
    const [k] = await shapesOf(page, 'connector');
    expect(k.label).toBe('');
    expect(k.startArrow).toBe('none');
    expect(k.endArrow).toBe('arrow');

    await selectTool(page, 'select');
    await dblclick(ctx, { x: 350, y: 150 });
    const editor = page.getByTestId('text-editor');
    await expect(editor).toBeFocused();
    await page.keyboard.type('depends on');
    await page.keyboard.press('Enter');
    await expect(editor).toHaveCount(0);
    expect((await shapeById(page, k.id)).label).toBe('depends on');

    // The label pill is part of the connector: clicking it selects the connector.
    await click(ctx, { x: 700, y: 500 });
    expect(await selection(page)).toEqual([]);
    await click(ctx, { x: 350, y: 143 });
    expect(await selection(page)).toEqual([k.id]);

    // The property bar edits the label too, and it is one undo step per edit.
    const bar = page.getByTestId('property-bar');
    await bar.getByTestId('prop-label').fill('blocks');
    expect((await shapeById(page, k.id)).label).toBe('blocks');
    await page.keyboard.press('Escape');
    await click(ctx, { x: 350, y: 143 });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await shapeById(page, k.id)).label).not.toBe('blocks');

    const other = await joinAs(browser, page.url(), 'Bo');
    await expect.poll(async () => (await shapeById(other, k.id)).label).toBe((await shapeById(page, k.id)).label);
    await other.context().close();
  });

  test('arrowheads can be set per end from the property bar and survive save and load', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 500, y: 100 }, { x: 600, y: 200 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 550, y: 150 });
    const [k] = await shapesOf(page, 'connector');
    const bar = page.getByTestId('property-bar');
    await bar.getByTestId('prop-arrow-start').selectOption('dot');
    await bar.getByTestId('prop-arrow-end').selectOption('open');
    expect(await shapeById(page, k.id)).toMatchObject({ startArrow: 'dot', endArrow: 'open' });
    await bar.getByTestId('prop-arrow-end').selectOption('none');
    expect((await shapeById(page, k.id)).endArrow).toBe('none');

    const before = await shapeById(page, k.id);
    const downloadPromise = page.waitForEvent('download');
    await boardAction(page, 'save-json');
    const path = (await (await downloadPromise).path())!;
    await openBoard(page);
    await openBoardMenu(page);
    await page.locator('[data-action="load-json"]').setInputFiles(path);
    await expect.poll(() => shapeById(page, k.id)).toEqual(before);
  });
});
