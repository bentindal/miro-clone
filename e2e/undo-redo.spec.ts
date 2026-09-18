import { expect, test } from '@playwright/test';
import {
  click,
  dblclick,
  drag,
  drawRect,
  handle,
  historyDepth,
  openBoard,
  placeSticky,
  selectTool,
  shapes,
  shapesOf,
  typeAndCommit,
} from './helpers';

test.describe('undo and redo', () => {
  test('every editing operation can be undone and redone in order', async ({ page }) => {
    const ctx = await openBoard(page);
    const snapshots: unknown[] = [await shapes(page)];
    const record = async () => snapshots.push(await shapes(page));

    // 1. create a rectangle
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await record();
    // 2. move it
    await selectTool(page, 'select');
    await drag(ctx, { x: 150, y: 150 }, { x: 250, y: 250 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ x: 200, y: 200 });
    await record();
    // 3. resize it
    await drag(ctx, await handle(page, 'se'), { x: 400, y: 400 });
    expect((await shapesOf(page, 'rect'))[0]).toMatchObject({ w: 200, h: 200 });
    await record();
    // 4. rotate it
    await drag(ctx, await handle(page, 'rotate'), { x: 400, y: 300 }, { steps: 20 });
    expect((await shapesOf(page, 'rect'))[0].rotation).toBeCloseTo(Math.PI / 2, 2);
    await record();
    // 5. place a sticky
    await placeSticky(ctx, { x: 600, y: 150 });
    await record();
    // 6. edit its text
    await dblclick(ctx, { x: 600, y: 150 });
    await typeAndCommit(page, 'note');
    await record();
    // 7. connect the two
    await selectTool(page, 'connector');
    await drag(ctx, { x: 300, y: 300 }, { x: 600, y: 150 });
    expect(await shapesOf(page, 'connector')).toHaveLength(1);
    await record();
    // 8. draw a pen stroke
    await selectTool(page, 'pen');
    await drag(ctx, { x: 100, y: 500 }, { x: 300, y: 550 }, { steps: 10 });
    await record();
    // 9. line and ellipse
    await selectTool(page, 'line');
    await drag(ctx, { x: 400, y: 500 }, { x: 500, y: 550 });
    await record();
    await selectTool(page, 'ellipse');
    await drag(ctx, { x: 600, y: 500 }, { x: 700, y: 600 });
    await record();
    // 10. frame around the pen stroke
    await selectTool(page, 'frame');
    await drag(ctx, { x: 50, y: 450 }, { x: 350, y: 650 });
    expect((await shapesOf(page, 'pen'))[0].parentId).not.toBeNull();
    await record();
    // 11. group rect + sticky
    await selectTool(page, 'select');
    await click(ctx, { x: 300, y: 300 });
    await click(ctx, { x: 600, y: 150 }, { shift: true });
    await page.keyboard.press('Control+g');
    expect(await shapesOf(page, 'group')).toHaveLength(1);
    await record();
    // 12. z-order
    await page.keyboard.press('{');
    await record();
    // 13. copy/paste
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await record();
    // 14. delete the pasted group
    await page.keyboard.press('Delete');
    await record();
    // 15. ungroup
    await click(ctx, { x: 300, y: 300 });
    await page.keyboard.press('Control+Shift+g');
    expect(await shapesOf(page, 'group')).toHaveLength(0);
    await record();

    const steps = snapshots.length - 1;
    expect(await historyDepth(page)).toEqual({ undo: steps, redo: 0 });

    // Undo all the way back to an empty board, checking each intermediate state.
    for (let i = steps; i >= 1; i--) {
      await page.keyboard.press('Control+z');
      expect(await shapes(page)).toEqual(snapshots[i - 1]);
    }
    expect(await shapes(page)).toEqual([]);
    expect(await historyDepth(page)).toEqual({ undo: 0, redo: steps });

    // Redo all the way forward again.
    for (let i = 1; i <= steps; i++) {
      await page.keyboard.press(i % 2 ? 'Control+Shift+z' : 'Control+y');
      expect(await shapes(page)).toEqual(snapshots[i]);
    }
    expect(await historyDepth(page)).toEqual({ undo: steps, redo: 0 });
    void r;
  });

  test('a new edit after undo discards the redo branch; toolbar buttons mirror the keys', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 300, y: 100 }, { x: 400, y: 200 });
    await page.locator('[data-action="undo"]').click();
    expect(await shapes(page)).toHaveLength(1);
    await expect(page.locator('[data-action="redo"]')).toBeEnabled();
    await placeSticky(ctx, { x: 500, y: 500 });
    await expect(page.locator('[data-action="redo"]')).toBeDisabled();
    expect(await historyDepth(page)).toEqual({ undo: 2, redo: 0 });
    await page.locator('[data-action="undo"]').click();
    await page.locator('[data-action="undo"]').click();
    expect(await shapes(page)).toHaveLength(0);
    await expect(page.locator('[data-action="undo"]')).toBeDisabled();
  });
});
