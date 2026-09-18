import { expect, test } from '@playwright/test';
import { currentTool, dblclick, openBoard, placeSticky, selection, shapes, typeAndCommit } from './helpers';

test.describe('sticky notes', () => {
  test('click places a note, double-click edits its text', async ({ page }) => {
    const ctx = await openBoard(page);
    const note = await placeSticky(ctx, { x: 400, y: 300 });
    expect(note.type).toBe('sticky');
    expect(note.w).toBe(120);
    expect(note.h).toBe(120);
    expect(note.x).toBe(340);
    expect(note.y).toBe(240);
    expect(await selection(page)).toEqual([note.id]);
    expect(await currentTool(page)).toBe('select');

    await dblclick(ctx, { x: 400, y: 300 });
    await typeAndCommit(page, 'Hello board');
    const [after] = await shapes(page);
    expect(after.text).toBe('Hello board');

    // Editing again keeps the existing text and appends.
    await dblclick(ctx, { x: 400, y: 300 });
    const editor = page.getByTestId('text-editor');
    await expect(editor).toHaveValue('Hello board');
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await page.keyboard.press('Escape');
    expect((await shapes(page))[0].text).toBe('Hello board!');
  });

  test('each note gets a colour and several can be placed', async ({ page }) => {
    const ctx = await openBoard(page);
    await placeSticky(ctx, { x: 200, y: 200 });
    await placeSticky(ctx, { x: 400, y: 200 });
    await placeSticky(ctx, { x: 600, y: 200 });
    const notes = await shapes(page);
    expect(notes).toHaveLength(3);
    expect(new Set(notes.map((n) => n.fill)).size).toBe(3);
  });
});
