import { type Browser, type Page, expect, test } from '@playwright/test';
import { click, dblclick, drag, handle, openBoard, placeSticky, shapeById, typeAndCommit } from './helpers';

/** Font size the in-place editor is showing, in CSS pixels (zoom is 1 in these tests). */
const editorFontPx = (page: Page) => page.getByTestId('text-editor').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

async function joinAs(browser: Browser, url: string, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((n) => {
    window.localStorage.setItem('whiteboard.user', JSON.stringify({ name: n, color: '#8e24aa' }));
  }, name);
  const page = await context.newPage();
  await openBoard(page, url);
  return page;
}

test.describe('sticky notes auto-fit and votes', () => {
  test('the font shrinks as text grows, grows back when the note is resized, and the note grows when it cannot shrink further', async ({ page }) => {
    const ctx = await openBoard(page);
    const n = await placeSticky(ctx, { x: 300, y: 300 });
    await dblclick(ctx, { x: 300, y: 300 });
    await page.keyboard.type('Hi');
    const large = await editorFontPx(page);
    expect(large).toBeGreaterThanOrEqual(30);

    await page.keyboard.type(' there, this note has quite a lot more to say than before');
    const smaller = await editorFontPx(page);
    expect(smaller).toBeLessThan(large);
    expect(smaller).toBeGreaterThanOrEqual(10);
    expect((await shapeById(page, n.id)).h).toBe(120);

    // Far more text than fits at the smallest size: the note grows taller, keeping its width.
    await page.keyboard.type(' ' + Array.from({ length: 30 }, () => 'and on it goes').join(' '));
    const grown = await shapeById(page, n.id);
    expect(grown.w).toBe(120);
    expect(grown.h).toBeGreaterThan(120);
    expect(await editorFontPx(page)).toBe(10);
    await page.keyboard.press('Escape');

    // Making the note bigger lets the text grow again.
    await click(ctx, { x: 300, y: 300 });
    await drag(ctx, await handle(page, 'se'), { x: 640, y: 640 });
    await dblclick(ctx, { x: 400, y: 400 });
    expect(await editorFontPx(page)).toBeGreaterThan(10);
    await page.keyboard.press('Escape');
  });

  test('votes toggle per person, show a count, and sync', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    await page.getByTestId('user-name').fill('Ada');
    const n = await placeSticky(ctx, { x: 300, y: 300 });
    await dblclick(ctx, { x: 300, y: 300 });
    await typeAndCommit(page, 'Ship it');
    await click(ctx, { x: 300, y: 300 });
    const vote = page.getByTestId('prop-vote');
    await expect(vote).toHaveText('Vote');
    await vote.click();
    await expect(vote).toHaveText('Voted · 1');
    expect((await shapeById(page, n.id)).votes).toEqual(['Ada']);

    const other = await joinAs(browser, page.url(), 'Bo');
    await click({ page: other, origin: ctx.origin, width: ctx.width, height: ctx.height }, { x: 300, y: 300 });
    const otherVote = other.getByTestId('prop-vote');
    await expect(otherVote).toHaveText('Vote · 1');
    await otherVote.click();
    await expect(otherVote).toHaveText('Voted · 2');
    await expect.poll(async () => (await shapeById(page, n.id)).votes).toEqual(['Ada', 'Bo']);
    await expect(vote).toHaveText('Voted · 2');

    // Ada removes her vote; Bo's stays. Undo restores it.
    await vote.click();
    await expect.poll(async () => (await shapeById(page, n.id)).votes).toEqual(['Bo']);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await shapeById(page, n.id)).votes).toEqual(['Ada', 'Bo']);
    await other.context().close();
  });
});
