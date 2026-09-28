import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { type BoardCtx, type Pt, boardAction, camera, click, drag, drawRect, openBoard, openBoardMenu, placeSticky, selectTool, shapesOf, toScreen, typeAndCommit } from './helpers';

interface Slide {
  id: string;
  title: string;
  slide: string;
}

async function slides(page: Page): Promise<Slide[]> {
  return page.evaluate(() => (window as unknown as { __wb: { slides: () => Slide[] } }).__wb.slides());
}

async function presenting(page: Page): Promise<number | null> {
  return page.evaluate(() => (window as unknown as { __wb: { presenting: () => number | null } }).__wb.presenting());
}

/** Draw a frame and give it a title, so the deck is readable in failures. */
async function addFrame(ctx: BoardCtx, from: Pt, to: Pt, title: string): Promise<string> {
  const before = new Set((await shapesOf(ctx.page, 'frame')).map((f) => f.id));
  await selectTool(ctx.page, 'frame');
  await drag(ctx, from, to);
  const frame = (await shapesOf(ctx.page, 'frame')).find((f) => !before.has(f.id));
  expect(frame, 'the frame tool made no frame').toBeDefined();
  await selectTool(ctx.page, 'select');
  // The title sits in the bar above the frame's top edge.
  await ctx.page.mouse.dblclick(ctx.origin.x + (from.x + to.x) / 2, ctx.origin.y + Math.min(from.y, to.y) - 10);
  await ctx.page.keyboard.press('Control+a');
  await typeAndCommit(ctx.page, title);
  return frame!.id;
}

async function openSlidesPanel(page: Page): Promise<void> {
  if (await page.getByTestId('slides-panel').isVisible().catch(() => false)) return;
  await page.locator('[data-action="toggle-slides"]').click();
  await expect(page.getByTestId('slides-panel')).toBeVisible();
}

/** The deck as the panel lists it, which is what a person actually reads. */
async function panelTitles(page: Page): Promise<string[]> {
  return page.locator('.slide-row .slide-title').allInnerTexts();
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

/** A `#rrggbb` theme colour in the form `pixel` reports. */
function rgbOf(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

test.describe('frames as slides', () => {
  test('every frame is a slide, listed in the order it was drawn', async ({ page }) => {
    const ctx = await openBoard(page);
    await addFrame(ctx, { x: 60, y: 120 }, { x: 260, y: 270 }, 'One');
    await addFrame(ctx, { x: 320, y: 120 }, { x: 520, y: 270 }, 'Two');
    await addFrame(ctx, { x: 580, y: 120 }, { x: 780, y: 270 }, 'Three');

    // Frames go to the bottom of the z-order so they stay behind their
    // contents. The deck must not inherit that, or every new frame would
    // become slide one.
    const ids = await page.evaluate(() => (window as unknown as { __wb: { order: () => string[] } }).__wb.order());
    const deck = await slides(page);
    expect(deck.map((f) => f.title)).toEqual(['One', 'Two', 'Three']);
    expect(deck.map((f) => f.id)).toEqual([...ids].reverse());

    await openSlidesPanel(page);
    expect(await panelTitles(page)).toEqual(['One', 'Two', 'Three']);
  });

  test('the panel reorders the deck, and the move can be undone', async ({ page }) => {
    const ctx = await openBoard(page);
    await addFrame(ctx, { x: 60, y: 120 }, { x: 260, y: 270 }, 'One');
    await addFrame(ctx, { x: 320, y: 120 }, { x: 520, y: 270 }, 'Two');
    await addFrame(ctx, { x: 580, y: 120 }, { x: 780, y: 270 }, 'Three');
    await openSlidesPanel(page);

    await page.locator('[data-action="slide-down-0"]').click();
    expect(await panelTitles(page)).toEqual(['Two', 'One', 'Three']);
    await page.locator('[data-action="slide-up-2"]').click();
    expect(await panelTitles(page)).toEqual(['Two', 'Three', 'One']);

    // The ends cannot be pushed off either edge.
    await expect(page.locator('[data-action="slide-up-0"]')).toBeDisabled();
    await expect(page.locator('[data-action="slide-down-2"]')).toBeDisabled();

    // Clear of the dock, and on the canvas so the undo chord reaches the board.
    await page.getByTestId('canvas').click({ position: { x: 400, y: 520 } });
    await page.keyboard.press('Control+z');
    expect(await panelTitles(page)).toEqual(['Two', 'One', 'Three']);
    await page.keyboard.press('Control+z');
    expect(await panelTitles(page)).toEqual(['One', 'Two', 'Three']);
  });

  test('presenting fills the screen with one slide, hides the editor and walks the deck', async ({ page }) => {
    const ctx = await openBoard(page);
    await addFrame(ctx, { x: 60, y: 120 }, { x: 260, y: 270 }, 'One');
    await addFrame(ctx, { x: 320, y: 120 }, { x: 520, y: 270 }, 'Two');
    const before = await camera(page);

    await openSlidesPanel(page);
    await page.locator('[data-action="present-from-panel"]').click();
    await expect(page.getByTestId('presenter')).toBeVisible();
    await expect(page.getByTestId('slide-count')).toHaveText('1 / 2');
    await expect(page.getByTestId('slide-title')).toHaveText('One');

    // The editor is gone: rail, zoom controls, dock and top bar.
    await expect(page.locator('[data-tool="select"]')).toHaveCount(0);
    await expect(page.getByTestId('dock')).toHaveCount(0);
    await expect(page.locator('[data-action="board-menu"]')).toHaveCount(0);

    // The camera moved to the slide, and the slide fills one axis of the view.
    const fitted = await camera(page);
    expect(fitted.zoom).not.toBeCloseTo(before.zoom, 2);
    // Measured again: hiding the top bar gives the canvas the height back.
    const box = (await page.getByTestId('canvas').boundingBox())!;
    const onScreen = { w: 200 * fitted.zoom, h: 150 * fitted.zoom };
    expect(Math.max(onScreen.w / box.width, onScreen.h / box.height)).toBeCloseTo(1, 2);

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-count')).toHaveText('2 / 2');
    await expect(page.getByTestId('slide-title')).toHaveText('Two');
    // The deck does not wrap: the last slide is the last slide.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('slide-count')).toHaveText('2 / 2');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('slide-count')).toHaveText('1 / 2');
    await page.keyboard.press('End');
    await expect(page.getByTestId('slide-count')).toHaveText('2 / 2');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('presenter')).toHaveCount(0);
    expect(await presenting(page)).toBeNull();
    await expect(page.locator('[data-tool="select"]')).toBeVisible();
  });

  test('the slide is masked, so the board beside it does not show in the letterbox', async ({ page }) => {
    const ctx = await openBoard(page);
    await addFrame(ctx, { x: 60, y: 120 }, { x: 260, y: 270 }, 'One');
    // A neighbour just past the first slide's right edge, so it falls in the
    // band a 4:3 slide leaves on a wide screen rather than off screen.
    await addFrame(ctx, { x: 266, y: 120 }, { x: 466, y: 270 }, 'Two');

    await openSlidesPanel(page);
    await page.locator('[data-action="present-from-panel"]').click();
    await expect(page.getByTestId('presenter')).toBeVisible();

    const theme = await page.evaluate(() => (window as unknown as { __wb: { theme: () => { background: string; frameFill: string } } }).__wb.theme());
    expect(theme.frameFill, 'a frame that matched the backdrop would prove nothing').not.toBe(theme.background);
    const box = (await page.getByTestId('canvas').boundingBox())!;
    // A point on the neighbouring frame's fill, in this camera.
    const at = await toScreen(page, { x: 276, y: 180 });
    expect(at.x, 'the neighbour is off screen, so this proves nothing').toBeLessThan(box.width);
    expect(at.x).toBeGreaterThan(0);
    expect(await pixel(page, at.x, at.y)).toBe(rgbOf(theme.background));
  });

  test('the board cannot be edited or panned while it is being presented', async ({ page }) => {
    const ctx = await openBoard(page);
    await addFrame(ctx, { x: 60, y: 120 }, { x: 260, y: 270 }, 'One');
    const rect = await drawRect(ctx, { x: 100, y: 160 }, { x: 180, y: 230 });
    const shapesBefore = (await page.evaluate(() => (window as unknown as { __wb: { shapes: () => unknown[] } }).__wb.shapes())).length;

    await openSlidesPanel(page);
    await page.locator('[data-action="present-from-panel"]').click();
    await expect(page.getByTestId('presenter')).toBeVisible();
    const fitted = await camera(page);

    // A click and a drag over the middle of the slide: no selection, no move.
    await click(ctx, { x: ctx.width / 2, y: ctx.height / 2 });
    await drag(ctx, { x: ctx.width / 2, y: ctx.height / 2 }, { x: ctx.width / 2 + 120, y: ctx.height / 2 + 80 });
    await ctx.page.getByTestId('canvas').dispatchEvent('wheel', { deltaY: 240, deltaX: 0, deltaMode: 0, bubbles: true, cancelable: true });

    expect(await camera(page)).toEqual(fitted);
    expect(await page.evaluate(() => (window as unknown as { __wb: { selection: () => string[] } }).__wb.selection())).toEqual([]);
    const after = await page.evaluate(() => (window as unknown as { __wb: { shapes: () => { id: string; x?: number }[] } }).__wb.shapes());
    expect(after).toHaveLength(shapesBefore);
    expect(after.find((s) => s.id === rect.id)?.x).toBe(100);
  });

  test('a frame exports to a PDF page of its own size, with the board around it left out', async ({ page }) => {
    const ctx = await openBoard(page);
    const frameId = await addFrame(ctx, { x: 100, y: 150 }, { x: 500, y: 450 }, 'Slide one');
    await placeSticky(ctx, { x: 200, y: 250 });
    // Something well outside the frame, which must not reach the page.
    await drawRect(ctx, { x: 700, y: 150 }, { x: 900, y: 300 });
    // A frame is selected by its title bar; clicking its empty middle would
    // reach through to the board, as `frames.spec.ts` pins down.
    await page.getByTestId('canvas').click({ position: { x: 300, y: 140 } });
    expect(await page.evaluate(() => (window as unknown as { __wb: { selection: () => string[] } }).__wb.selection())).toEqual([frameId]);

    const downloadPromise = page.waitForEvent('download');
    await boardAction(page, 'export-frame-pdf');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Slide-one.pdf');
    const pdf = (await readFile((await download.path())!)).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toContain('/Count 1');
    // The frame was dragged 400x300, and a PDF point is a board unit.
    expect(pdf).toContain('/MediaBox [0 0 400 300]');
    expect(pdf).toContain('/Width 800 /Height 600');
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
  });

  test('a frame exports what it holds, not what merely overlaps it', async ({ page }) => {
    const ctx = await openBoard(page);
    const frameId = await addFrame(ctx, { x: 100, y: 150 }, { x: 500, y: 450 }, 'Slide one');
    // Centre inside, so the frame adopts it.
    await drawRect(ctx, { x: 150, y: 200 }, { x: 250, y: 300 });
    // Centre outside, so it stays on the board even though it crosses the edge.
    const straddling = await drawRect(ctx, { x: 450, y: 200 }, { x: 600, y: 250 });
    expect((await shapesOf(page, 'rect')).find((r) => r.id === straddling.id)?.parentId).toBeNull();

    // Count the ink in two strips of the exported frame: one over the shape it
    // holds, one over the part of the straddling shape that is inside its box.
    const ink = await page.evaluate((id) => {
      const editor = (window as unknown as { __wb: { editor: { exportFrameCanvas: (id: string, scale: number) => HTMLCanvasElement } } }).__wb.editor;
      const canvas = editor.exportFrameCanvas(id, 1);
      const c = canvas.getContext('2d')!;
      const dark = (x: number, y: number, w: number, h: number) => {
        const { data } = c.getImageData(x, y, w, h);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i] < 128 && data[i + 1] < 128) n++;
        return n;
      };
      // The frame's own box starts at world (100,150) and the export has no
      // padding, so world x - 100 is the pixel column. Both strips stop short
      // of the frame's own border, which is ink that belongs there.
      return { held: dark(45, 45, 160, 160), straddling: dark(345, 45, 45, 60) };
    }, frameId);
    expect(ink.held).toBeGreaterThan(100);
    expect(ink.straddling).toBe(0);
  });

  test('the whole deck exports as one PDF, one page per slide, in slide order', async ({ page }) => {
    const ctx = await openBoard(page);
    await addFrame(ctx, { x: 60, y: 120 }, { x: 260, y: 270 }, 'One');
    await addFrame(ctx, { x: 320, y: 120 }, { x: 620, y: 320 }, 'Two');
    await openSlidesPanel(page);
    await page.locator('[data-action="slide-down-0"]').click();
    expect(await panelTitles(page)).toEqual(['Two', 'One']);

    const downloadPromise = page.waitForEvent('download');
    await boardAction(page, 'export-slides-pdf');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('slides.pdf');
    const pdf = (await readFile((await download.path())!)).toString('latin1');
    expect(pdf).toContain('/Count 2');
    const boxes = [...pdf.matchAll(/\/MediaBox \[0 0 (\d+) (\d+)\]/g)].map((m) => `${m[1]}x${m[2]}`);
    // The reordered deck decides the page order, not the drawing order.
    expect(boxes).toEqual(['300x200', '200x150']);
  });

  test('a board with no frames offers nothing to present', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await openSlidesPanel(page);
    await expect(page.getByTestId('slides-empty')).toBeVisible();
    await expect(page.locator('[data-action="present-from-panel"]')).toBeDisabled();
    await openBoardMenu(page);
    await expect(page.locator('[data-action="export-slides-pdf"]')).toBeDisabled();
    await expect(page.locator('[data-action="export-frame-pdf"]')).toBeDisabled();
    expect(await presenting(page)).toBeNull();
  });
});
