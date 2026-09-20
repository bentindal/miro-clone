import { expect, test } from '@playwright/test';
import { click, dblclick, openBoard, placeSticky, selectTool, shapeById, typeAndCommit } from './helpers';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the dark pixels sit inside a note, as a fraction of its width and
 * height. The note's own border and any selection chrome are excluded by
 * sampling the inside only.
 */
async function inkCentre(page: import('@playwright/test').Page, box: Box): Promise<{ x: number; y: number; ink: number }> {
  return page.evaluate((b) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const dpr = window.devicePixelRatio || 1;
    const inset = 4;
    const x0 = Math.round((b.x + inset) * dpr);
    const y0 = Math.round((b.y + inset) * dpr);
    const w = Math.round((b.w - inset * 2) * dpr);
    const h = Math.round((b.h - inset * 2) * dpr);
    const d = ctx.getImageData(x0, y0, w, h).data;
    let sx = 0;
    let sy = 0;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      // The note is pale; its text is near black.
      if (d[i] + d[i + 1] + d[i + 2] > 330) continue;
      const p = i / 4;
      sx += p % w;
      sy += Math.floor(p / w);
      ink++;
    }
    return ink === 0 ? { x: 0, y: 0, ink } : { x: sx / ink / w, y: sy / ink / h, ink };
  }, box);
}

test.describe('sticky text alignment', () => {
  test('is centred to start with, and follows the buttons in both directions', async ({ page }) => {
    const ctx = await openBoard(page);
    const note = await placeSticky(ctx, { x: 400, y: 300 });
    await selectTool(page, 'select');
    await dblclick(ctx, { x: 400, y: 300 });
    await typeAndCommit(page, 'Hi');

    // The default a note is created with, and the default an older note that
    // never had an alignment is read back as.
    expect(await shapeById(page, note.id)).toMatchObject({ align: 'center', valign: 'middle' });

    const box = { x: note.x, y: note.y, w: note.w, h: note.h };
    /** Set an alignment, then deselect so the selection chrome is not sampled. */
    const applied = async (testId: string) => {
      await click(ctx, { x: 400, y: 300 });
      await page.getByTestId('property-bar').getByTestId(testId).click();
      await page.getByTestId('canvas').focus();
      await page.keyboard.press('Escape');
      return inkCentre(page, box);
    };

    const centred = await inkCentre(page, box);
    expect(centred.ink).toBeGreaterThan(0);
    expect(centred.x).toBeGreaterThan(0.35);
    expect(centred.x).toBeLessThan(0.65);
    expect(centred.y).toBeGreaterThan(0.35);
    expect(centred.y).toBeLessThan(0.65);

    // Measured against the centred note rather than against fixed fractions:
    // the font auto-fits, so how far the text can travel depends on how big it
    // ended up. What has to be true is that it moved, and in which direction.
    const SHIFT = 0.12;

    const left = await applied('prop-align-left');
    expect(await shapeById(page, note.id)).toMatchObject({ align: 'left' });
    expect(left.x).toBeLessThan(centred.x - SHIFT);

    const right = await applied('prop-align-right');
    expect(await shapeById(page, note.id)).toMatchObject({ align: 'right' });
    expect(right.x).toBeGreaterThan(centred.x + SHIFT);

    const top = await applied('prop-valign-top');
    expect(await shapeById(page, note.id)).toMatchObject({ valign: 'top' });
    expect(top.y).toBeLessThan(centred.y - SHIFT);

    const bottom = await applied('prop-valign-bottom');
    expect(await shapeById(page, note.id)).toMatchObject({ valign: 'bottom' });
    expect(bottom.y).toBeGreaterThan(centred.y + SHIFT);

    // Horizontal alignment does not drift when only the vertical changes.
    expect(Math.abs(bottom.x - right.x)).toBeLessThan(0.05);
  });

  test('survives a round trip through the board file', async ({ page }) => {
    const ctx = await openBoard(page);
    const note = await placeSticky(ctx, { x: 400, y: 300 });
    await selectTool(page, 'select');
    await click(ctx, { x: 400, y: 300 });
    await page.getByTestId('property-bar').getByTestId('prop-align-right').click();
    await page.getByTestId('property-bar').getByTestId('prop-valign-bottom').click();
    const saved = await shapeById(page, note.id);

    await page.evaluate((file) => (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file), {
      format: 'whiteboard',
      version: 1,
      shapes: [saved],
    });
    expect(await shapeById(page, note.id)).toMatchObject({ align: 'right', valign: 'bottom' });
  });

  test('a note written before alignment existed opens centred', async ({ page }) => {
    await openBoard(page);
    await page.evaluate((file) => (window as never as { __wb: { load: (d: unknown) => void } }).__wb.load(file), {
      format: 'whiteboard',
      version: 1,
      shapes: [{ type: 'sticky', id: 'old', parentId: null, x: 0, y: 0, w: 120, h: 120, rotation: 0, text: 'Old note', fill: '#fff59d', votes: [] }],
    });
    expect(await shapeById(page, 'old')).toMatchObject({ align: 'center', valign: 'middle' });
  });
});
