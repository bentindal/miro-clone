import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { drawRect, openBoard, placeSticky } from './helpers';

function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test.describe('export to PNG', () => {
  test('downloads a PNG covering every object on the board', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 300, y: 200 });
    await placeSticky(ctx, { x: 600, y: 400 });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="export-png"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('board.png');
    const path = await download.path();
    const buf = await readFile(path!);
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    // Board bounds: x 100..660, y 100..460 (sticky is 120 wide centred at 600,400),
    // plus a 24px title gutter and 20px padding, exported at 2x.
    const { w, h } = pngSize(buf);
    expect(w).toBe((560 + 40) * 2);
    expect(h).toBe((360 + 24 + 40) * 2);
  });

  test('an empty board still exports a valid image', async ({ page }) => {
    await openBoard(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="export-png"]').click();
    const buf = await readFile((await (await downloadPromise).path())!);
    const { w, h } = pngSize(buf);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });
});
