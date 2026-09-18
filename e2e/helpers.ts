import { type Page, expect } from '@playwright/test';

export interface Pt {
  x: number;
  y: number;
}

export interface BoardCtx {
  page: Page;
  /** Top-left of the canvas in page coordinates. */
  origin: Pt;
  width: number;
  height: number;
}

/** Open the app and return the canvas geometry. */
export async function openBoard(page: Page): Promise<BoardCtx> {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => Boolean((window as unknown as { __wb?: unknown }).__wb));
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return { page, origin: { x: box.x, y: box.y }, width: box.width, height: box.height };
}

/** Convert a canvas-local point to page coordinates. */
export function pagePt(ctx: BoardCtx, p: Pt): Pt {
  return { x: ctx.origin.x + p.x, y: ctx.origin.y + p.y };
}

export async function selectTool(page: Page, tool: string): Promise<void> {
  await page.locator(`[data-tool="${tool}"]`).click();
  await expect(page.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed', 'true');
}

export async function drag(ctx: BoardCtx, from: Pt, to: Pt, opts: { steps?: number; shift?: boolean } = {}): Promise<void> {
  const { page } = ctx;
  const a = pagePt(ctx, from);
  const b = pagePt(ctx, to);
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: opts.steps ?? 8 });
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
}

export async function click(ctx: BoardCtx, p: Pt, opts: { shift?: boolean } = {}): Promise<void> {
  const q = pagePt(ctx, p);
  if (opts.shift) await ctx.page.keyboard.down('Shift');
  await ctx.page.mouse.click(q.x, q.y);
  if (opts.shift) await ctx.page.keyboard.up('Shift');
}

export async function dblclick(ctx: BoardCtx, p: Pt): Promise<void> {
  const q = pagePt(ctx, p);
  await ctx.page.mouse.dblclick(q.x, q.y);
}

// ---- state inspection via the test hook --------------------------------

export interface ShapeRecord {
  id: string;
  type: string;
  parentId: string | null;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
  text?: string;
  title?: string;
  points?: Pt[];
  start?: { shapeId: string | null; point: Pt };
  end?: { shapeId: string | null; point: Pt };
  [k: string]: unknown;
}

export async function shapes(page: Page): Promise<ShapeRecord[]> {
  return page.evaluate(() => (window as unknown as { __wb: { shapes: () => ShapeRecord[] } }).__wb.shapes());
}

export async function shapesOf(page: Page, type: string): Promise<ShapeRecord[]> {
  return (await shapes(page)).filter((s) => s.type === type);
}

export async function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __wb: { selection: () => string[] } }).__wb.selection());
}

export async function order(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __wb: { order: () => string[] } }).__wb.order());
}

export async function camera(page: Page): Promise<{ tx: number; ty: number; zoom: number }> {
  return page.evaluate(() => (window as unknown as { __wb: { camera: () => { tx: number; ty: number; zoom: number } } }).__wb.camera());
}

export async function bounds(page: Page, id: string): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate((id) => (window as unknown as { __wb: { bounds: (id: string) => { x: number; y: number; w: number; h: number } } }).__wb.bounds(id), id);
}

export async function connectorPoints(page: Page, id: string): Promise<{ a: Pt; b: Pt } | null> {
  return page.evaluate((id) => (window as unknown as { __wb: { connectorPoints: (id: string) => { a: Pt; b: Pt } | null } }).__wb.connectorPoints(id), id);
}

export async function historyDepth(page: Page): Promise<{ undo: number; redo: number }> {
  return page.evaluate(() => (window as unknown as { __wb: { history: () => { undo: number; redo: number } } }).__wb.history());
}

/** Convert a world point to canvas-local screen coordinates using the live camera. */
export async function toScreen(page: Page, p: Pt): Promise<Pt> {
  const cam = await camera(page);
  return { x: p.x * cam.zoom + cam.tx, y: p.y * cam.zoom + cam.ty };
}

export async function toWorld(page: Page, p: Pt): Promise<Pt> {
  const cam = await camera(page);
  return { x: (p.x - cam.tx) / cam.zoom, y: (p.y - cam.ty) / cam.zoom };
}

/** Create a rectangle by dragging and return its record. */
export async function drawRect(ctx: BoardCtx, from: Pt, to: Pt): Promise<ShapeRecord> {
  const before = new Set((await shapes(ctx.page)).map((s) => s.id));
  await selectTool(ctx.page, 'rect');
  await drag(ctx, from, to);
  const created = (await shapes(ctx.page)).filter((s) => !before.has(s.id));
  expect(created).toHaveLength(1);
  return created[0];
}

export function ctrl(page: Page): string {
  void page;
  return 'Control';
}

export async function press(page: Page, combo: string): Promise<void> {
  await page.keyboard.press(combo);
}
