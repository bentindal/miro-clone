import { type Browser, type Page, expect, test } from '@playwright/test';
import { type BoardCtx, click, dblclick, openBoard, placeSticky, selectTool, shapeById, shapes, typeAndCommit } from './helpers';

/** Padding the in-place editor puts above the text, in CSS pixels (zoom is 1 here). */
const editorPadTop = (page: Page) => page.getByTestId('text-editor').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));

/** Number of pixels inside a box that are not the note's own fill. */
async function inkIn(page: Page, box: { x: number; y: number; w: number; h: number }, fill: string): Promise<number> {
  return page.evaluate(
    ({ b, f }) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const dpr = window.devicePixelRatio || 1;
      const d = ctx.getImageData(Math.round(b.x * dpr), Math.round(b.y * dpr), Math.round(b.w * dpr), Math.round(b.h * dpr)).data;
      const want = [parseInt(f.slice(1, 3), 16), parseInt(f.slice(3, 5), 16), parseInt(f.slice(5, 7), 16)];
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - want[0]) + Math.abs(d[i + 1] - want[1]) + Math.abs(d[i + 2] - want[2]) > 12) n++;
      }
      return n;
    },
    { b: box, f: fill },
  );
}

async function addTag(page: Page, text: string): Promise<void> {
  await page.getByTestId('prop-tags').fill(text);
  await page.getByTestId('prop-tags').press('Enter');
}

async function joinAs(browser: Browser, url: string, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((n) => {
    window.localStorage.setItem('whiteboard.user', JSON.stringify({ name: n, color: '#8e24aa' }));
  }, name);
  const page = await context.newPage();
  await openBoard(page, url);
  return page;
}

test.describe('sticky note tags', () => {
  test('tags are added and removed from the property bar and drawn on the note', async ({ page }) => {
    const ctx = await openBoard(page);
    const n = await placeSticky(ctx, { x: 300, y: 300 });
    await selectTool(page, 'select');
    await click(ctx, { x: 300, y: 300 });

    // The field only exists for notes, and starts empty.
    await expect(page.getByTestId('prop-tags')).toBeVisible();
    await expect(page.getByTestId('prop-tags-chip')).toHaveCount(0);
    const box = { x: n.x, y: n.y, w: n.w, h: n.h };

    await addTag(page, 'blocked');
    await expect(page.locator('[data-testid="prop-tags-chip"][data-tag="blocked"]')).toBeVisible();
    expect((await shapeById(page, n.id)).tags).toEqual(['blocked']);
    // And it is on the canvas, in the row across the top of the note.
    const row = { x: box.x + 2, y: box.y + 2, w: box.w - 4, h: 28 };
    expect(await inkIn(page, row, '#fff59d')).toBeGreaterThan(20);

    await addTag(page, 'urgent');
    expect((await shapeById(page, n.id)).tags).toEqual(['blocked', 'urgent']);

    // The same tag twice would be two chips saying one thing.
    await addTag(page, 'urgent');
    expect((await shapeById(page, n.id)).tags).toEqual(['blocked', 'urgent']);

    await page.locator('[data-testid="prop-tags-remove"][data-tag="blocked"]').click();
    expect((await shapeById(page, n.id)).tags).toEqual(['urgent']);
    // Focus is still in the tag field, where Ctrl+Z is the field's own undo.
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await shapeById(page, n.id)).tags).toEqual(['blocked', 'urgent']);
  });

  // The chips and the words would otherwise be drawn on top of each other.
  test('the tag row takes its space off the text rather than overlapping it', async ({ page }) => {
    const ctx = await openBoard(page);
    await placeSticky(ctx, { x: 300, y: 300 });
    await selectTool(page, 'select');
    await dblclick(ctx, { x: 300, y: 300 });
    await typeAndCommit(page, 'Hi');
    await click(ctx, { x: 300, y: 300 });
    // Pin the text to the top, so the measurement is the tag row and not the
    // centring moving with the box.
    await page.getByTestId('prop-valign-top').click();

    await dblclick(ctx, { x: 300, y: 300 });
    const plain = await editorPadTop(page);
    await page.keyboard.press('Escape');

    await click(ctx, { x: 300, y: 300 });
    await addTag(page, 'todo');
    await dblclick(ctx, { x: 300, y: 300 });
    // TAG_HEIGHT + TAG_GAP, exactly: the editor sits where the drawn text sits.
    expect(await editorPadTop(page)).toBe(plain + 20);
    await page.keyboard.press('Escape');
  });

  test('tags survive a round trip through the board file, and older notes open with none', async ({ page }) => {
    const ctx = await openBoard(page);
    const n = await placeSticky(ctx, { x: 300, y: 300 });
    await selectTool(page, 'select');
    await click(ctx, { x: 300, y: 300 });
    await addTag(page, 'design');

    const saved = { format: 'whiteboard', version: 1, shapes: await shapes(page) };
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    expect(await shapes(page)).toHaveLength(0);
    await page.evaluate((file) => (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file), saved);
    expect((await shapeById(page, n.id)).tags).toEqual(['design']);

    await page.evaluate((file) => (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file), {
      format: 'whiteboard',
      version: 1,
      shapes: [{ type: 'sticky', id: 'old', parentId: null, x: 0, y: 0, w: 120, h: 120, rotation: 0, text: 'Old note', fill: '#fff59d', votes: [] }],
    });
    expect((await shapeById(page, 'old')).tags).toEqual([]);
  });

  test('a tag added by one person appears for the other', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    const n = await placeSticky(ctx, { x: 300, y: 300 });
    await selectTool(page, 'select');
    await click(ctx, { x: 300, y: 300 });
    await addTag(page, 'shared');

    const other = await joinAs(browser, page.url(), 'Bo');
    const otherCtx: BoardCtx = { page: other, origin: ctx.origin, width: ctx.width, height: ctx.height };
    await expect.poll(async () => (await shapeById(other, n.id)).tags).toEqual(['shared']);

    await selectTool(other, 'select');
    await click(otherCtx, { x: 300, y: 300 });
    await other.locator('[data-testid="prop-tags-remove"][data-tag="shared"]').click();
    await expect.poll(async () => (await shapeById(page, n.id)).tags).toEqual([]);
    await other.context().close();
  });
});
