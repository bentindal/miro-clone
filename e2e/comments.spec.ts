import { type Browser, type Page, expect, test } from '@playwright/test';
import { type BoardCtx, click, drag, drawRect, openBoard, selectTool, shapeById, syncInfo } from './helpers';

interface Thread {
  id: string;
  shapeId: string | null;
  x: number;
  y: number;
  resolved: boolean;
  messages: { author: string; text: string }[];
}
interface Pin {
  id: string;
  x: number;
  y: number;
  count: number;
  resolved: boolean;
  active: boolean;
}

const comments = (page: Page) => page.evaluate(() => (window as unknown as { __wb: { comments: () => Thread[] } }).__wb.comments());
const pins = (page: Page) => page.evaluate(() => (window as unknown as { __wb: { pins: () => Pin[] } }).__wb.pins());
const activeThread = (page: Page) => page.evaluate(() => (window as unknown as { __wb: { activeThread: () => string | null } }).__wb.activeThread());

async function joinAs(browser: Browser, url: string, name: string): Promise<{ page: Page; ctx: BoardCtx }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((n) => {
    window.localStorage.setItem('whiteboard.user', JSON.stringify({ name: n, color: '#8e24aa' }));
  }, name);
  const page = await context.newPage();
  const ctx = await openBoard(page, url);
  return { page, ctx };
}

test.describe('comments', () => {
  test('a comment on an object gets a pin that follows the object, and everyone sees the thread', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    await page.getByTestId('user-name').fill('Ada');
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 200 });
    const other = await joinAs(browser, page.url(), 'Bo');

    await selectTool(page, 'comment');
    await click(ctx, { x: 200, y: 150 });
    await expect(page.getByTestId('comments-panel')).toBeVisible();
    await expect(page.getByTestId('comment-composer')).toBeFocused();
    await page.keyboard.type('Should this be blue?');
    await page.keyboard.press('Enter');

    const [thread] = await comments(page);
    expect(thread.shapeId).toBe(r.id);
    expect(thread.messages).toEqual([{ ...thread.messages[0], author: 'Ada', text: 'Should this be blue?' }]);
    expect(await activeThread(page)).toBe(thread.id);
    // The pin sits at the rectangle's top-right corner.
    expect(await pins(page)).toEqual([{ id: thread.id, x: 300, y: 100, count: 1, resolved: false, active: true }]);
    await expect(page.locator('[data-action="toggle-comments"]')).toHaveText('Comments (1)');

    // Bo sees the pin and the text, replies, and Ada sees the reply.
    await expect.poll(() => pins(other.page)).toHaveLength(1);
    await other.page.locator('[data-action="toggle-comments"]').click();
    await expect(other.page.getByTestId('comment-text')).toHaveText('Should this be blue?');
    await other.page.getByTestId('thread').click();
    await other.page.getByTestId('reply-composer').fill('Yes, and bigger');
    await other.page.getByTestId('reply-composer-post').click();
    await expect(page.getByTestId('comment-message')).toHaveCount(2);
    await expect(page.getByTestId('comment-author').nth(1)).toHaveText('Bo');
    await expect.poll(async () => (await pins(page))[0]?.count).toBe(2);

    // Moving the rectangle moves the pin with it, on both sides.
    await selectTool(page, 'select');
    await drag(ctx, { x: 200, y: 150 }, { x: 500, y: 350 });
    expect(await shapeById(page, r.id)).toMatchObject({ x: 400, y: 300 });
    expect((await pins(page))[0]).toMatchObject({ x: 600, y: 300 });
    await expect.poll(async () => (await pins(other.page))[0]?.x).toBe(600);
    await other.page.context().close();
  });

  test('comments can be placed on empty board, opened from their pin, resolved and reopened', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'comment');
    await click(ctx, { x: 400, y: 400 });
    await page.keyboard.type('Free floating');
    await page.getByTestId('comment-composer-post').click();
    const [t] = await comments(page);
    expect(t.shapeId).toBeNull();
    expect(await pins(page)).toEqual([expect.objectContaining({ x: 400, y: 400, count: 1 })]);

    // Close the panel, then click the pin to reopen the thread.
    await page.locator('[data-action="toggle-comments"]').click();
    await expect(page.getByTestId('comments-panel')).toHaveCount(0);
    expect(await activeThread(page)).toBeNull();
    await click(ctx, { x: 406, y: 394 });
    await expect(page.getByTestId('comments-panel')).toBeVisible();
    expect(await activeThread(page)).toBe(t.id);

    await page.getByTestId('resolve-thread').click();
    expect((await comments(page))[0].resolved).toBe(true);
    await expect(page.getByTestId('thread')).toHaveCount(0);
    expect(await pins(page)).toEqual([]);
    await expect(page.locator('[data-action="toggle-comments"]')).toHaveText('Comments');

    await page.getByTestId('show-resolved').check();
    await expect(page.getByTestId('thread')).toHaveCount(1);
    expect(await pins(page)).toEqual([expect.objectContaining({ resolved: true })]);
    await page.getByTestId('reopen-thread').click();
    expect((await comments(page))[0].resolved).toBe(false);

    // Escape cancels a comment that was never posted.
    await selectTool(page, 'comment');
    await click(ctx, { x: 600, y: 600 });
    await expect(page.getByTestId('comment-composer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('comment-composer')).toHaveCount(0);
    expect(await comments(page)).toHaveLength(1);
  });

  test('viewers can read comments but not post them', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'comment');
    await click(ctx, { x: 300, y: 300 });
    await page.keyboard.type('For the record');
    await page.keyboard.press('Enter');
    await page.locator('[data-action="share"]').click();
    const viewLink = await page.getByTestId('share-view-link').inputValue();
    const viewer = await joinAs(browser, viewLink, 'Vi');
    expect((await syncInfo(viewer.page))!.role).toBe('view');
    await expect(viewer.page.locator('[data-tool="comment"]')).toBeDisabled();
    await viewer.page.locator('[data-action="toggle-comments"]').click();
    await expect(viewer.page.getByTestId('comment-text')).toHaveText('For the record');
    await viewer.page.getByTestId('thread').click();
    await expect(viewer.page.getByTestId('reply-composer')).toBeDisabled();
    await expect(viewer.page.getByTestId('resolve-thread')).toHaveCount(0);
    await viewer.page.context().close();
  });
});
