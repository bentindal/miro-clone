import { type CDPSession, type Page, expect, test } from '@playwright/test';
import { type BoardCtx, camera, openBoard, pagePt, shapeById, shapesOf, selectTool, toWorld, drawRect } from './helpers';

test.use({ hasTouch: true });

interface Finger {
  x: number;
  y: number;
  id: number;
}

/** Drive raw touch input through the DevTools protocol; Playwright's touchscreen only taps. */
class Touch {
  constructor(
    private readonly cdp: CDPSession,
    private readonly ctx: BoardCtx,
  ) {}

  private points(fingers: Finger[]) {
    return fingers.map((f) => ({ ...pagePt(this.ctx, f), id: f.id }));
  }

  async start(fingers: Finger[]) {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this.points(fingers) });
  }

  async move(fingers: Finger[]) {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.points(fingers) });
  }

  async end() {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /** Interpolate every finger from its start to its end position over `steps` moves. */
  async gesture(from: Finger[], to: Finger[], steps = 10) {
    await this.start(from);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.move(from.map((f, k) => ({ id: f.id, x: f.x + (to[k].x - f.x) * t, y: f.y + (to[k].y - f.y) * t })));
    }
    await this.end();
  }
}

async function setup(page: Page) {
  const ctx = await openBoard(page);
  const cdp = await page.context().newCDPSession(page);
  return { ctx, touch: new Touch(cdp, ctx) };
}

test.describe('touch input', () => {
  test('two fingers moving together pan the board', async ({ page }) => {
    const { touch } = await setup(page);
    await touch.gesture(
      [
        { id: 1, x: 300, y: 300 },
        { id: 2, x: 400, y: 300 },
      ],
      [
        { id: 1, x: 450, y: 380 },
        { id: 2, x: 550, y: 380 },
      ],
    );
    const cam = await camera(page);
    expect(cam.zoom).toBeCloseTo(1, 6);
    expect(cam.tx).toBeCloseTo(150, 3);
    expect(cam.ty).toBeCloseTo(80, 3);
  });

  test('spreading two fingers zooms in around their midpoint; pinching zooms out', async ({ page }) => {
    const { touch } = await setup(page);
    const mid = { x: 500, y: 350 };
    const worldUnder = await toWorld(page, mid);
    await touch.gesture(
      [
        { id: 1, x: 450, y: 350 },
        { id: 2, x: 550, y: 350 },
      ],
      [
        { id: 1, x: 350, y: 350 },
        { id: 2, x: 650, y: 350 },
      ],
    );
    let cam = await camera(page);
    expect(cam.zoom).toBeCloseTo(3, 6);
    const after = await toWorld(page, mid);
    expect(after.x).toBeCloseTo(worldUnder.x, 6);
    expect(after.y).toBeCloseTo(worldUnder.y, 6);

    await touch.gesture(
      [
        { id: 1, x: 350, y: 350 },
        { id: 2, x: 650, y: 350 },
      ],
      [
        { id: 1, x: 425, y: 350 },
        { id: 2, x: 575, y: 350 },
      ],
    );
    cam = await camera(page);
    expect(cam.zoom).toBeCloseTo(1.5, 6);
    await expect(page.getByTestId('zoom-level')).toHaveText('150%');
  });

  test('a single finger draws and drags like the mouse', async ({ page }) => {
    const { touch } = await setup(page);
    await selectTool(page, 'rect');
    await touch.gesture([{ id: 1, x: 100, y: 100 }], [{ id: 1, x: 300, y: 250 }]);
    const [r] = await shapesOf(page, 'rect');
    expect(r).toMatchObject({ x: 100, y: 100, w: 200, h: 150 });
    // Drag it with one finger (the select tool is active after drawing).
    await touch.gesture([{ id: 1, x: 200, y: 175 }], [{ id: 1, x: 500, y: 475 }]);
    expect(await shapeById(page, r.id)).toMatchObject({ x: 400, y: 400 });
  });

  test('a second finger landing mid-drag cancels the drag and turns it into a pan', async ({ page }) => {
    const { ctx, touch } = await setup(page);
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await selectTool(page, 'select');
    await touch.start([{ id: 1, x: 150, y: 150 }]);
    await touch.move([{ id: 1, x: 250, y: 250 }]);
    expect(await shapeById(page, r.id)).toMatchObject({ x: 200, y: 200 });
    await touch.start([
      { id: 1, x: 250, y: 250 },
      { id: 2, x: 350, y: 250 },
    ]);
    await touch.move([
      { id: 1, x: 300, y: 300 },
      { id: 2, x: 400, y: 300 },
    ]);
    await touch.end();
    // The rectangle is back where it started; the board panned instead.
    expect(await shapeById(page, r.id)).toMatchObject({ x: 100, y: 100 });
    const cam = await camera(page);
    expect(cam.tx).toBeCloseTo(50, 3);
    expect(cam.ty).toBeCloseTo(50, 3);
    expect(await page.evaluate(() => (window as unknown as { __wb: { history: () => { undo: number } } }).__wb.history().undo)).toBe(1);
  });
});
