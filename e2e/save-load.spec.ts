import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { boardAction, dblclick, drag, drawRect, openBoard, openBoardMenu, placeSticky, selectTool, shapes, typeAndCommit } from './helpers';

test.describe('save and load board JSON', () => {
  test('saving downloads JSON and loading it restores every object', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 400, y: 100 }, { x: 500, y: 200 });
    await placeSticky(ctx, { x: 300, y: 400 });
    await dblclick(ctx, { x: 300, y: 400 });
    await typeAndCommit(page, 'persist me');
    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 450, y: 150 });
    await selectTool(page, 'pen');
    await drag(ctx, { x: 100, y: 500 }, { x: 300, y: 550 }, { steps: 10 });
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 550, y: 250 });
    await page.keyboard.press('Control+g');
    const saved = await shapes(page);
    expect(saved.map((s) => s.type).sort()).toEqual(['connector', 'group', 'pen', 'rect', 'rect', 'sticky']);

    const downloadPromise = page.waitForEvent('download');
    await boardAction(page, 'save-json');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('board.json');
    const path = (await download.path())!;
    const file = JSON.parse(await readFile(path, 'utf8'));
    expect(file.format).toBe('whiteboard');
    expect(file.version).toBe(1);
    expect(file.shapes).toEqual(saved);

    // A brand new board, then load the file into it.
    await openBoard(page);
    expect(await shapes(page)).toEqual([]);
    await openBoardMenu(page);
    await page.locator('[data-action="load-json"]').setInputFiles(path);
    await expect.poll(() => shapes(page)).toEqual(saved);
    const connector = (await shapes(page)).find((s) => s.type === 'connector')!;
    expect(connector.start?.shapeId).toBe(a.id);
    expect(connector.end?.shapeId).toBe(b.id);
  });

  test('loading a malformed file reports an error and leaves the board alone', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    // A native dialog used to block the tab until it was dismissed; the same
    // message now arrives as a toast that can be read and ignored.
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      void d.dismiss();
    });
    await openBoardMenu(page);
    await page.locator('[data-action="load-json"]').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'whiteboard', version: 1, shapes: [{ type: 'rect', id: 'x' }] })),
    });
    const toast = page.getByTestId('toast');
    await expect(toast).toContainText('Could not load board');
    await expect(toast).toHaveAttribute('data-kind', 'error');
    expect(await shapes(page)).toHaveLength(1);
    expect(dialogs).toBe(0);
  });
});
