import { expect, test } from '@playwright/test';
import { click, dblclick, openBoard, selectTool, shapes, shapesOf, typeAndCommit } from './helpers';

test.describe('text editing', () => {
  test('text tool places a text object and edits it in place', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'text');
    await click(ctx, { x: 300, y: 300 });
    await typeAndCommit(page, 'Roadmap');
    const [t] = await shapesOf(page, 'text');
    expect(t).toMatchObject({ type: 'text', text: 'Roadmap', x: 300 });

    // Double-click re-opens the editor with the current text; replace it.
    await dblclick(ctx, { x: 320, y: 300 });
    const editor = page.getByTestId('text-editor');
    await expect(editor).toHaveValue('Roadmap');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Roadmap Q4');
    await page.keyboard.press('Escape');
    expect((await shapesOf(page, 'text'))[0].text).toBe('Roadmap Q4');
  });

  test('committing an empty text object discards it', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'text');
    await click(ctx, { x: 300, y: 300 });
    await expect(page.getByTestId('text-editor')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await shapes(page)).toHaveLength(0);
  });

  test('clicking elsewhere commits the edit', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'text');
    await click(ctx, { x: 300, y: 300 });
    await page.keyboard.type('line one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('line two');
    await click(ctx, { x: 700, y: 600 });
    await expect(page.getByTestId('text-editor')).toHaveCount(0);
    expect((await shapesOf(page, 'text'))[0].text).toBe('line one\nline two');
  });
});
