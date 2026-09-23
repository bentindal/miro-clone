import { type Page, expect, test } from '@playwright/test';
import { type BoardCtx, type Pt, click, dblclick, openBoard, pagePt, placeSticky, selectTool, shapeById, shapes, shapesOf } from './helpers';

interface MarkRecord {
  kind: string;
  from: number;
  to: number;
  href: string;
}

const marksOf = async (page: Page, id: string): Promise<MarkRecord[]> => (await shapeById(page, id)).marks as unknown as MarkRecord[];

/** Highlight a character range in the open text editor. */
async function highlight(page: Page, from: number, to: number): Promise<void> {
  await page.getByTestId('text-editor').evaluate((el, [a, b]) => {
    const input = el as HTMLTextAreaElement;
    input.focus();
    input.setSelectionRange(a, b);
    document.dispatchEvent(new Event('selectionchange'));
  }, [from, to]);
}

/** Type into the open editor without committing, so the bar stays up. */
async function typeInto(page: Page, text: string): Promise<void> {
  const editor = page.getByTestId('text-editor');
  await expect(editor).toBeFocused();
  await page.keyboard.type(text);
}

/** Number of pixels inside a box that are not the note's own fill. */
async function ink(page: Page, box: { x: number; y: number; w: number; h: number }, fill: string): Promise<number> {
  return page.evaluate(
    ({ b, f }) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const dpr = window.devicePixelRatio || 1;
      const d = ctx.getImageData(Math.round(b.x * dpr), Math.round(b.y * dpr), Math.round(b.w * dpr), Math.round(b.h * dpr)).data;
      const want = [parseInt(f.slice(1, 3), 16), parseInt(f.slice(3, 5), 16), parseInt(f.slice(5, 7), 16)];
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - want[0]) + Math.abs(d[i + 1] - want[1]) + Math.abs(d[i + 2] - want[2]) > 20) n++;
      }
      return n;
    },
    { b: box, f: fill },
  );
}

/** A note with `text` typed into it, left open for editing. */
async function noteWith(ctx: BoardCtx, at: Pt, text: string) {
  const note = await placeSticky(ctx, at);
  await selectTool(ctx.page, 'select');
  await dblclick(ctx, at);
  await typeInto(ctx.page, text);
  return note;
}

test.describe('rich text', () => {
  test('the format bar bolds what is highlighted, and un-bolds it again', async ({ page }) => {
    const ctx = await openBoard(page);
    const note = await noteWith(ctx, { x: 400, y: 300 }, 'hello world');
    await expect(page.getByTestId('format-bar')).toBeVisible();

    // With nothing highlighted there is nothing to format.
    await highlight(page, 5, 5);
    await expect(page.getByTestId('format-bold')).toBeDisabled();

    await highlight(page, 0, 5);
    const boldButton = page.getByTestId('format-bold');
    await expect(boldButton).toBeEnabled();
    await expect(boldButton).toHaveAttribute('aria-pressed', 'false');
    await boldButton.click();
    await expect.poll(() => marksOf(page, note.id)).toEqual([{ kind: 'bold', from: 0, to: 5, href: '' }]);
    await expect(boldButton).toHaveAttribute('aria-pressed', 'true');

    // Pressing it again takes the formatting off, rather than adding it twice.
    await boldButton.click();
    await expect.poll(() => marksOf(page, note.id)).toEqual([]);
  });

  test('bold is drawn, not just recorded', async ({ page }) => {
    const ctx = await openBoard(page);
    const note = await noteWith(ctx, { x: 400, y: 300 }, 'aaaa');
    const box = { x: note.x!, y: note.y!, w: note.w!, h: note.h! };
    await page.keyboard.press('Escape');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    const plain = await ink(page, box, '#fff59d');

    await dblclick(ctx, { x: 400, y: 300 });
    await highlight(page, 0, 4);
    await page.getByTestId('format-bold').click();
    await page.keyboard.press('Escape');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    // Bold is heavier, so more of the note is ink than before.
    await expect.poll(() => ink(page, box, '#fff59d')).toBeGreaterThan(plain);
  });

  // Formatting is ranges over the string, so an edit that moves characters
  // has to move the ranges or the bold ends up on the wrong words.
  test('formatting follows the words when the text around it changes', async ({ page }) => {
    const ctx = await openBoard(page);
    const note = await noteWith(ctx, { x: 400, y: 300 }, 'the quick fox');
    await highlight(page, 4, 9);
    await page.getByTestId('format-bold').click();
    await expect.poll(() => marksOf(page, note.id)).toEqual([{ kind: 'bold', from: 4, to: 9, href: '' }]);

    // Put a word in front of it; the bold moves along by that much.
    await highlight(page, 0, 0);
    await typeInto(page, 'and ');
    await expect.poll(async () => {
      const s = await shapeById(page, note.id);
      const m = (s.marks as unknown as MarkRecord[])[0];
      return (s.text as unknown as string).slice(m.from, m.to);
    }).toBe('quick');
  });

  test('a link is added from the bar, opens in a new tab, and can be taken off', async ({ page, context }) => {
    const ctx = await openBoard(page);
    const note = await noteWith(ctx, { x: 400, y: 300 }, 'see docs');
    await highlight(page, 4, 8);
    await page.getByTestId('format-link').click();
    await page.getByTestId('format-link-url').fill('example.com');
    await page.getByTestId('format-link-apply').click();
    // A bare host is read as a website, over https.
    await expect.poll(() => marksOf(page, note.id)).toEqual([{ kind: 'link', from: 4, to: 8, href: 'https://example.com' }]);

    await page.keyboard.press('Escape');
    await page.getByTestId('canvas').focus();
    await click(ctx, { x: 400, y: 300 });

    // Answer the link ourselves: what is under test is that the click
    // navigates a new tab to that address, not that the address exists.
    await context.route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: 'ok' }));

    // Clicking the linked words opens the link in a new tab.
    const opened = context.waitForEvent('page');
    const at = pagePt(ctx, { x: 400, y: 300 });
    await page.mouse.click(at.x, at.y);
    const tab = await opened;
    expect(tab.url()).toContain('example.com');
    await tab.close();

    await dblclick(ctx, { x: 400, y: 300 });
    await highlight(page, 4, 8);
    const linkButton = page.getByTestId('format-link');
    await expect(linkButton).toHaveAttribute('aria-pressed', 'true');
    await linkButton.click();
    await expect.poll(() => marksOf(page, note.id)).toEqual([]);
  });

  test('a list is set from the property bar and changes how the note is drawn', async ({ page }) => {
    const ctx = await openBoard(page);
    const note = await noteWith(ctx, { x: 400, y: 300 }, 'one\ntwo');
    await page.keyboard.press('Escape');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    // A strip down the left inside edge of the note. Centred text never
    // reaches it; a bullet or a number is drawn exactly there.
    const strip = { x: note.x! + 5, y: note.y! + 5, w: 16, h: note.h! - 10 };
    expect(await ink(page, strip, '#fff59d')).toBe(0);

    await click(ctx, { x: 400, y: 300 });
    await page.getByTestId('property-bar').getByTestId('prop-list-bullet').click();
    expect((await shapeById(page, note.id)).list).toBe('bullet');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => ink(page, strip, '#fff59d')).toBeGreaterThan(0);

    await click(ctx, { x: 400, y: 300 });
    await page.getByTestId('property-bar').getByTestId('prop-list-number').click();
    expect((await shapeById(page, note.id)).list).toBe('number');
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => ink(page, strip, '#fff59d')).toBeGreaterThan(0);
  });

  test('formatting survives a round trip, and a board file cannot smuggle in a script link', async ({ page }) => {
    const ctx = await openBoard(page);
    const note = await noteWith(ctx, { x: 400, y: 300 }, 'hello world');
    await highlight(page, 0, 5);
    await page.getByTestId('format-bold').click();
    await page.keyboard.press('Escape');

    const saved = { format: 'whiteboard', version: 1, shapes: await shapes(page) };
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.evaluate((file) => (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file), saved);
    await expect.poll(() => marksOf(page, note.id)).toEqual([{ kind: 'bold', from: 0, to: 5, href: '' }]);

    // A link in someone's board file is a link the reader is invited to
    // click, so only a page may be behind one.
    await page.evaluate(
      (file) => (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file),
      {
        format: 'whiteboard',
        version: 1,
        shapes: [
          {
            type: 'text',
            id: 'hostile',
            parentId: null,
            x: 0,
            y: 0,
            w: 200,
            h: 30,
            rotation: 0,
            text: 'click me',
            fontSize: 18,
            color: '#222222',
            marks: [
              { kind: 'link', from: 0, to: 8, href: 'javascript:alert(1)' },
              { kind: 'bold', from: 0, to: 4, href: '' },
            ],
          },
        ],
      },
    );
    const loaded = (await shapesOf(page, 'text'))[0];
    // The bold survives; only the dangerous target is dropped.
    expect(loaded.marks).toEqual([{ kind: 'bold', from: 0, to: 4, href: '' }]);
    expect(JSON.stringify(await shapes(page))).not.toContain('javascript:');
  });

  test('older notes and text open unformatted rather than failing to open', async ({ page }) => {
    await openBoard(page);
    await page.evaluate((file) => (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file), {
      format: 'whiteboard',
      version: 1,
      shapes: [{ type: 'sticky', id: 'old', parentId: null, x: 0, y: 0, w: 120, h: 120, rotation: 0, text: 'Old note', fill: '#fff59d', votes: [] }],
    });
    expect(await shapeById(page, 'old')).toMatchObject({ marks: [], list: 'none' });
  });
});
