import { type Page, expect, test } from '@playwright/test';
import { click, openBoard, pagePt, selectTool, selection, shapes, shapesOf } from './helpers';

/**
 * A 64 by 64 solid red PNG, so a pixel check can say whether it was drawn.
 * Big enough that the selection handles do not cover the middle of it.
 */
const RED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdLep8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3IPanc8OLDQitxAAAAAElFTkSuQmCC';

/** Build a File in the page and hand it to the editor the way a browser would. */
async function sendFile(page: Page, how: 'paste' | 'drop', file: { url: string; name: string; type?: string; padTo?: number }, at?: { x: number; y: number }): Promise<void> {
  await page.evaluate(
    async ({ how, file, at }) => {
      const res = await fetch(file.url);
      const blob = await res.blob();
      const parts: BlobPart[] = [blob];
      // Pad to a given size, to test the limit without shipping a big fixture.
      if (file.padTo && file.padTo > blob.size) parts.push(new Uint8Array(file.padTo - blob.size));
      const made = new File(parts, file.name, { type: file.type ?? blob.type });
      const dt = new DataTransfer();
      dt.items.add(made);
      if (how === 'paste') {
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      } else {
        const host = document.querySelector('.board') as HTMLElement;
        const r = host.getBoundingClientRect();
        host.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: r.left + (at?.x ?? 0), clientY: r.top + (at?.y ?? 0), bubbles: true, cancelable: true }));
      }
    },
    { how, file, at },
  );
}

/** Colour of one canvas pixel, as `r,g,b`. */
async function pixel(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const dpr = window.devicePixelRatio || 1;
      const d = ctx.getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data;
      return `${d[0]},${d[1]},${d[2]}`;
    },
    [x, y],
  );
}

const anImage = (page: Page) => expect.poll(async () => (await shapesOf(page, 'image')).length);

test.describe('images', () => {
  test('a pasted image lands in the middle of the view and is drawn', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'select');
    await page.getByTestId('canvas').focus();
    await sendFile(page, 'paste', { url: RED_PNG, name: 'red.png' });
    await anImage(page).toBe(1);

    const [img] = await shapesOf(page, 'image');
    // Its own size, because it is smaller than the cap.
    expect(img).toMatchObject({ w: 64, h: 64, alt: 'red' });
    // Centred on the viewport, which is where a paste with no position goes.
    expect(img.x! + 32).toBeCloseTo(ctx.width / 2, 0);
    expect(img.y! + 32).toBeCloseTo(ctx.height / 2, 0);
    // And it is the selected shape, ready to be moved.
    expect(await selection(page)).toEqual([img.id]);

    // Deselected first, so the selection chrome is not what gets sampled.
    await page.keyboard.press('Escape');
    await expect.poll(() => pixel(page, ctx.width / 2, ctx.height / 2)).toBe('255,0,0');
  });

  test('a dropped image lands where it was dropped', async ({ page }) => {
    await openBoard(page);
    await selectTool(page, 'select');
    await sendFile(page, 'drop', { url: RED_PNG, name: 'photo.png' }, { x: 500, y: 320 });
    await anImage(page).toBe(1);
    const [img] = await shapesOf(page, 'image');
    expect(img.x! + img.w! / 2).toBeCloseTo(500, 0);
    expect(img.y! + img.h! / 2).toBeCloseTo(320, 0);
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => pixel(page, 500, 320)).toBe('255,0,0');
  });

  test('a file that is not an image, or one that is too big, is refused and says why', async ({ page }) => {
    await openBoard(page);
    await selectTool(page, 'select');
    await sendFile(page, 'drop', { url: 'data:text/plain,hello', name: 'notes.txt', type: 'text/plain' }, { x: 400, y: 300 });
    await expect(page.getByTestId('toaster')).toContainText('notes.txt is not an image');
    expect(await shapesOf(page, 'image')).toHaveLength(0);

    await sendFile(page, 'drop', { url: RED_PNG, name: 'huge.png', padTo: 3 * 1024 * 1024 }, { x: 400, y: 300 });
    await expect(page.getByTestId('toaster')).toContainText('huge.png');
    await expect(page.getByTestId('toaster')).toContainText('2.0 MB');
    expect(await shapesOf(page, 'image')).toHaveLength(0);
  });

  test('an image survives a round trip, and a board file that points outside itself is refused', async ({ page }) => {
    await openBoard(page);
    await selectTool(page, 'select');
    await page.getByTestId('canvas').focus();
    await sendFile(page, 'paste', { url: RED_PNG, name: 'red.png' });
    await anImage(page).toBe(1);

    const saved = { format: 'whiteboard', version: 1, shapes: await shapes(page) };
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    expect(await shapes(page)).toHaveLength(0);
    await page.evaluate((file) => (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file), saved);
    const [back] = await shapesOf(page, 'image');
    expect(back.src).toBe(RED_PNG);

    // Opening a board file must never make the browser fetch someone's URL.
    const hostile = {
      format: 'whiteboard',
      version: 1,
      shapes: [{ type: 'image', id: 'evil', parentId: null, x: 0, y: 0, w: 100, h: 100, rotation: 0, src: 'https://example.com/tracker.png' }],
    };
    const refused = await page.evaluate((file) => {
      try {
        (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file);
        return null;
      } catch (err) {
        return String(err);
      }
    }, hostile);
    expect(refused).toContain('data: URL');
    // A refused file leaves the board as it was rather than emptying it, and
    // the URL it named is nowhere in the scene.
    expect((await shapesOf(page, 'image')).map((s) => s.id)).toEqual([back.id]);
    expect(JSON.stringify(await shapes(page))).not.toContain('example.com');
  });

  test('the property bar edits the description, which is what a screen reader reads', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'select');
    await sendFile(page, 'drop', { url: RED_PNG, name: 'red.png' }, { x: 400, y: 300 });
    await anImage(page).toBe(1);
    await click(ctx, { x: 400, y: 300 });

    const alt = page.getByTestId('prop-alt');
    await expect(alt).toHaveValue('red');
    await alt.fill('a red square');
    await expect.poll(async () => (await shapesOf(page, 'image'))[0].alt).toBe('a red square');
    await expect(page.getByTestId('a11y-status')).toContainText('a red square');
  });

  // Reworking paste so the clipboard's own event decides must not break the
  // editor's own clipboard, which is what Ctrl+V did before images existed.
  test('pasting with nothing on the system clipboard still pastes copied shapes', async ({ page }) => {
    const ctx = await openBoard(page);
    await selectTool(page, 'rect');
    const { x, y } = pagePt(ctx, { x: 200, y: 200 });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 100, y + 100, { steps: 5 });
    await page.mouse.up();
    await selectTool(page, 'select');
    await click(ctx, { x: 250, y: 250 });

    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await shapes(page)).length).toBe(2);
  });

  test('a view-only board refuses a dropped image', async ({ page, browser }) => {
    await openBoard(page);
    await selectTool(page, 'select');
    await page.locator('[data-action="share"]').click();
    const viewLink = await page.getByTestId('share-view-link').inputValue();

    const viewer = await browser.newPage();
    await openBoard(viewer, viewLink);
    await expect(viewer.getByTestId('read-only-badge')).toBeVisible();
    await sendFile(viewer, 'drop', { url: RED_PNG, name: 'red.png' }, { x: 400, y: 300 });
    await viewer.waitForTimeout(250);
    expect(await shapesOf(viewer, 'image')).toHaveLength(0);
    expect(await shapesOf(page, 'image')).toHaveLength(0);
    await viewer.close();
  });
});
