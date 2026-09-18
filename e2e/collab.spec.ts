import { type Browser, type Page, expect, test } from '@playwright/test';
import { type BoardCtx, click, drag, drawRect, openBoard, pagePt, peers, placeSticky, selectTool, shapeById, shapes, shapesOf, syncInfo, dblclick, typeAndCommit } from './helpers';

/** A second, independent browser session (own storage, own identity) on the same board. */
async function joinAs(browser: Browser, url: string, name: string): Promise<{ page: Page; ctx: BoardCtx }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((n) => {
    window.localStorage.setItem('whiteboard.user', JSON.stringify({ name: n, color: '#8e24aa' }));
  }, name);
  const page = await context.newPage();
  const ctx = await openBoard(page, url);
  return { page, ctx };
}

test.describe('boards and share links', () => {
  test('visiting /new creates a board and moves to its edit link', async ({ page }) => {
    await openBoard(page);
    expect(page.url()).toMatch(/\/b\/[a-f0-9]{20}#[A-Za-z0-9_-]{20,}$/);
    const info = (await syncInfo(page))!;
    expect(info.role).toBe('edit');
    expect(info.boardId).toBe(page.url().match(/\/b\/([a-f0-9]+)#/)![1]);
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'connected');
  });

  test('the share panel offers an edit link and a different view link', async ({ page }) => {
    await openBoard(page);
    await page.locator('[data-action="share"]').click();
    const editLink = await page.getByTestId('share-edit-link').inputValue();
    const viewLink = await page.getByTestId('share-view-link').inputValue();
    expect(editLink).toBe(page.url());
    expect(viewLink).not.toBe(editLink);
    expect(viewLink.split('#')[0]).toBe(editLink.split('#')[0]);
  });

  test('a wrong token or unknown board shows an error instead of a blank canvas', async ({ page }) => {
    await openBoard(page);
    const bad = `${page.url().split('#')[0]}#not-a-real-token`;
    await page.goto(bad);
    await expect(page.getByTestId('boot-error')).toContainText('not valid');
    await page.goto('/b/00000000000000000000#x');
    await expect(page.getByTestId('boot-error')).toContainText('does not exist');
  });

  test('the home page lists boards opened in this browser, newest first, with their titles', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-empty')).toBeVisible();
    await page.getByTestId('new-board').click();
    await page.waitForURL(/\/b\//);
    await openBoard(page, page.url());
    const first = page.url();
    await page.getByTestId('board-title').fill('First board');
    await openBoard(page);
    const second = page.url();
    await page.getByTestId('board-title').fill('Second board');

    await page.goto('/');
    const entries = page.getByTestId('board-entry');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText('Second board');
    await expect(entries.nth(1)).toContainText('First board');
    await expect(entries.nth(1).locator('a')).toHaveAttribute('href', first);

    // A view link to an already-known board does not downgrade the stored edit link.
    await page.goto(second);
    await openBoard(page, second);
    await page.locator('[data-action="share"]').click();
    const viewLink = await page.getByTestId('share-view-link').inputValue();
    await openBoard(page, viewLink);
    await page.goto('/');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0).locator('a')).toHaveAttribute('href', second);
    await expect(entries.nth(0)).not.toContainText('View only');

    // Entries can be removed; opening the board again re-adds it.
    await entries.nth(0).getByRole('button').click();
    await expect(entries).toHaveCount(1);
    await expect(entries.nth(0)).toContainText('First board');
    await entries.nth(0).locator('a').click();
    await openBoard(page, first);
    expect(page.url()).toBe(first);
  });

  test('the board title syncs and persists', async ({ page, browser }) => {
    await openBoard(page);
    await page.getByTestId('board-title').fill('Retro week 3');
    const other = await joinAs(browser, page.url(), 'Bo');
    await expect(other.page.getByTestId('board-title')).toHaveValue('Retro week 3');
    await other.page.context().close();
  });
});

test.describe('real-time collaboration', () => {
  test('edits made by one person appear for the other, and each undoes only their own', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    const other = await joinAs(browser, page.url(), 'Bo');

    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await expect.poll(() => shapesOf(other.page, 'rect')).toHaveLength(1);
    expect(await shapeById(other.page, r.id)).toMatchObject({ x: 100, y: 100, w: 100, h: 100 });

    const n = await placeSticky(other.ctx, { x: 500, y: 300 });
    await dblclick(other.ctx, { x: 500, y: 300 });
    await typeAndCommit(other.page, 'from Bo');
    await expect.poll(async () => (await shapes(page)).find((s) => s.id === n.id)?.text).toBe('from Bo');

    // Bo moves the first person's rectangle; the move shows up on the other side.
    await selectTool(other.page, 'select');
    await drag(other.ctx, { x: 150, y: 150 }, { x: 350, y: 150 });
    await expect.poll(async () => (await shapeById(page, r.id)).x).toBe(300);

    // Undo on the first page reverts only that person's step (creating the rect): the rect goes
    // away, Bo's sticky and text are untouched.
    await page.keyboard.press('Control+z');
    await expect.poll(() => shapes(page).then((all) => all.map((s) => s.type))).toEqual(['sticky']);
    await expect.poll(() => shapes(other.page).then((all) => all.map((s) => s.type))).toEqual(['sticky']);
    await expect.poll(async () => (await shapes(page)).find((s) => s.id === n.id)?.text).toBe('from Bo');
    // Bo's newest step was moving the now-deleted rect; undoing it changes nothing, so Yjs skips it
    // and Bo's undo lands on the previous own step: the text edit. Nothing of the first person's is touched.
    await other.page.keyboard.press('Control+z');
    await expect.poll(async () => (await shapes(other.page)).find((s) => s.id === n.id)?.text).toBe('');
    await expect.poll(async () => (await shapes(page)).find((s) => s.id === n.id)?.text).toBe('');
    await other.page.keyboard.press('Control+z');
    await expect.poll(() => shapes(other.page)).toEqual([]);
    await expect.poll(() => shapes(page)).toEqual([]);
    // Redo brings Bo's sticky back for both.
    await other.page.keyboard.press('Control+Shift+z');
    await expect.poll(() => shapes(page).then((all) => all.map((s) => s.type))).toEqual(['sticky']);
    await other.page.context().close();
  });

  test('presence: names, cursors and selections of others are visible', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    await page.getByTestId('user-name').fill('Ada');
    const other = await joinAs(browser, page.url(), 'Bo');

    await expect(page.getByTestId('peer')).toHaveCount(1);
    await expect(page.getByTestId('peer')).toHaveAttribute('data-name', 'Bo');
    await expect(other.page.getByTestId('peer')).toHaveAttribute('data-name', 'Ada');

    // Bo moves the mouse; Ada sees the cursor at that world position.
    const at = pagePt(other.ctx, { x: 400, y: 300 });
    await other.page.mouse.move(at.x, at.y);
    await expect.poll(async () => (await peers(page))[0]?.cursor).toEqual({ x: 400, y: 300 });

    // Bo selects a shape; Ada's peer list shows that selection.
    const r = await drawRect(other.ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await expect.poll(async () => (await peers(page))[0]?.selection).toEqual([r.id]);
    await click(other.ctx, { x: 600, y: 600 });
    await expect.poll(async () => (await peers(page))[0]?.selection).toEqual([]);

    // Renaming updates live; leaving removes the peer.
    await other.page.getByTestId('user-name').fill('Bob');
    await expect(page.getByTestId('peer')).toHaveAttribute('data-name', 'Bob');
    await other.page.context().close();
    await expect(page.getByTestId('peer')).toHaveCount(0);
    void ctx;
  });

  test('the board survives everyone leaving: a later visitor gets the saved content', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    const url = page.url();
    await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 200 });
    await placeSticky(ctx, { x: 500, y: 400 });
    const saved = await shapes(page);
    expect(saved).toHaveLength(2);
    await page.context().close();

    // Give the server a moment to unload and compact the empty room, then come back.
    const later = await joinAs(browser, url, 'Cy');
    await expect.poll(() => shapes(later.page)).toEqual(saved);
    // Reloading the same tab also restores it.
    await later.page.reload();
    await openBoard(later.page, url);
    expect(await shapes(later.page)).toEqual(saved);
    await later.page.context().close();
  });
});

test.describe('view-only links', () => {
  test('a viewer sees live changes but cannot make any, and the server refuses their writes', async ({ page, browser }) => {
    const ctx = await openBoard(page);
    await page.locator('[data-action="share"]').click();
    const viewLink = await page.getByTestId('share-view-link').inputValue();
    const viewer = await joinAs(browser, viewLink, 'Vi');
    expect((await syncInfo(viewer.page))!.role).toBe('view');
    await expect(viewer.page.getByTestId('read-only-badge')).toBeVisible();
    await expect(viewer.page.locator('[data-tool="rect"]')).toBeDisabled();
    await expect(viewer.page.locator('[data-tool="select"]')).toBeEnabled();

    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await expect.poll(() => shapesOf(viewer.page, 'rect')).toHaveLength(1);

    // UI attempts do nothing: dragging, deleting, keyboard shortcuts for tools.
    await selectTool(viewer.page, 'select');
    await drag(viewer.ctx, { x: 150, y: 150 }, { x: 400, y: 400 });
    await viewer.page.keyboard.press('Delete');
    await viewer.page.keyboard.press('n');
    await click(viewer.ctx, { x: 600, y: 600 });
    await expect(viewer.page.getByTestId('property-bar')).toHaveCount(0);
    expect(await shapeById(viewer.page, r.id)).toMatchObject({ x: 100, y: 100 });
    expect(await shapesOf(viewer.page, 'sticky')).toHaveLength(0);

    // Even a write forced straight into the viewer's document is dropped by the server:
    // the viewer's own copy loses the shape, nobody else does.
    await viewer.page.evaluate(() => {
      const e = (window as unknown as { __wb: { editor: { doc: import('yjs').Doc } } }).__wb.editor;
      e.doc.transact(() => e.doc.getMap('shapes').clear(), 'forced');
    });
    await expect.poll(() => shapesOf(viewer.page, 'rect')).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 500));
    expect(await shapesOf(page, 'rect')).toHaveLength(1);
    const fresh = await joinAs(browser, page.url(), 'Di');
    expect(await shapesOf(fresh.page, 'rect')).toHaveLength(1);

    // The viewer's own view link cannot be upgraded: the share panel has no edit link.
    await viewer.page.locator('[data-action="share"]').click();
    await expect(viewer.page.getByTestId('share-edit-link')).toHaveCount(0);
    await expect(viewer.page.getByTestId('share-view-link')).toHaveValue(viewLink);
    await viewer.page.context().close();
    await fresh.page.context().close();
  });
});
