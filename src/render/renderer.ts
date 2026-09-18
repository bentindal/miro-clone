import {
  type Box,
  type Camera,
  type Vec,
  boxCenter,
  boxesIntersect,
  rotatePoint,
  visibleWorldBox,
  worldToScreen,
} from '../model/geometry';
import { FRAME_TITLE_HEIGHT, Scene } from '../model/scene';
import type { Guide } from '../model/snap';
import { PIN_RADIUS, type Peer, type Pin } from '../editor/Editor';
import type { Id, Shape, StickyShape, TextShape } from '../model/types';

export const HANDLE_SIZE = 8;
/** Below this zoom, same-style shapes are merged into shared paths. */
export const BATCH_ZOOM = 0.3;
/** Largest number of shapes merged into one path; very large paths rasterise slowly. */
export const BATCH_LIMIT = 24;
export const ROTATE_HANDLE_OFFSET = 28;
export const SELECTION_COLOR = '#2f6fed';

export type HandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export interface SelectionFrame {
  /** Unrotated box in world coordinates. */
  box: Box;
  rotation: number;
  /** Handle positions in screen coordinates. */
  handles: Record<HandleName, Vec>;
}

export interface Overlay {
  selection: Id[];
  hoverId: Id | null;
  marquee: Box | null;
  /** Shape being drawn but not yet committed. */
  preview: Shape | null;
  /** Shape whose side anchors are shown while dragging a connector. */
  anchorTargetId: Id | null;
  /** Snap guides to draw while moving. */
  guides: Guide[];
  /** Collaborators' cursors and selections. */
  peers: Peer[];
  /** Comment pins. */
  pins: Pin[];
  /** World position of a comment being composed. */
  pendingPin: Vec | null;
  editingId: Id | null;
}

export interface RenderStats {
  drawn: number;
  culled: number;
}

const wrapCache = new WeakMap<Shape, { width: number; font: string; lines: string[] }>();

export function fontFor(s: StickyShape | TextShape): { size: number; font: string } {
  const size = s.type === 'text' ? s.fontSize : 16;
  return { size, font: `${size}px system-ui, sans-serif` };
}

function wrappedLines(ctx: CanvasRenderingContext2D, s: StickyShape | TextShape, width: number, font: string): string[] {
  const cached = wrapCache.get(s);
  if (cached && cached.width === width && cached.font === font) return cached.lines;
  ctx.font = font;
  const lines: string[] = [];
  for (const para of s.text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  wrapCache.set(s, { width, font, lines });
  return lines;
}

/** Compute the selection frame for the current selection, in world + screen units. */
export function selectionFrame(scene: Scene, selection: Id[], cam: Camera): SelectionFrame | null {
  const ids = selection.filter((id) => scene.has(id));
  if (ids.length === 0) return null;
  let box: Box;
  let rotation = 0;
  if (ids.length === 1) {
    const s = scene.mustGet(ids[0]);
    if (s.type === 'group' || s.type === 'connector') box = scene.bounds(s.id);
    else {
      box = { x: s.x, y: s.y, w: s.w, h: s.h };
      rotation = s.rotation;
    }
  } else {
    box = scene.boundsOfMany(ids);
  }
  const c = boxCenter(box);
  const pt = (x: number, y: number): Vec => worldToScreen(cam, rotatePoint({ x, y }, c, rotation));
  const top = pt(box.x + box.w / 2, box.y);
  const centerScreen = worldToScreen(cam, c);
  // Rotate handle sits above the top edge along the rotated up-vector.
  const upX = top.x - centerScreen.x;
  const upY = top.y - centerScreen.y;
  const upLen = Math.hypot(upX, upY) || 1;
  const handles: Record<HandleName, Vec> = {
    nw: pt(box.x, box.y),
    n: top,
    ne: pt(box.x + box.w, box.y),
    e: pt(box.x + box.w, box.y + box.h / 2),
    se: pt(box.x + box.w, box.y + box.h),
    s: pt(box.x + box.w / 2, box.y + box.h),
    sw: pt(box.x, box.y + box.h),
    w: pt(box.x, box.y + box.h / 2),
    rotate: { x: top.x + (upX / upLen) * ROTATE_HANDLE_OFFSET, y: top.y + (upY / upLen) * ROTATE_HANDLE_OFFSET },
  };
  return { box, rotation, handles };
}

/** Render the board into a 2D context already scaled for device pixels. */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  cam: Camera,
  width: number,
  height: number,
  overlay: Overlay,
): RenderStats {
  ctx.save();
  ctx.fillStyle = '#f4f5f7';
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, cam, width, height);

  const visible = visibleWorldBox(cam, width, height);
  const stats: RenderStats = { drawn: 0, culled: 0 };

  ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([cam.zoom, 0, 0, cam.zoom, cam.tx, cam.ty])));
  const base = matrixOf(ctx);
  const all = scene.all();
  // Frames form a background layer.
  for (const s of all) {
    if (s.type !== 'frame') continue;
    if (!boxesIntersect(visible, scene.boundsOfShape(s))) {
      stats.culled++;
      continue;
    }
    drawShape(ctx, scene, s, cam.zoom, base);
    stats.drawn++;
  }
  if (cam.zoom < BATCH_ZOOM) {
    const batch = new Batch(ctx, cam.zoom);
    for (const s of all) {
      if (s.type === 'frame' || s.type === 'group') continue;
      if (overlay.editingId === s.id) continue;
      if (!boxesIntersect(visible, scene.boundsOfShape(s))) {
        stats.culled++;
        continue;
      }
      if (!batch.add(s)) {
        batch.flush();
        drawShape(ctx, scene, s, cam.zoom, base);
      }
      stats.drawn++;
    }
    batch.flush();
  } else {
    for (const s of all) {
      if (s.type === 'frame' || s.type === 'group') continue;
      if (overlay.editingId === s.id) continue;
      if (!boxesIntersect(visible, scene.boundsOfShape(s))) {
        stats.culled++;
        continue;
      }
      drawShape(ctx, scene, s, cam.zoom, base);
      stats.drawn++;
    }
  }
  if (overlay.preview) drawShape(ctx, scene, overlay.preview, cam.zoom, base);
  ctx.restore();

  // Screen-space overlays.
  ctx.save();
  if (overlay.anchorTargetId && scene.has(overlay.anchorTargetId)) {
    const target = scene.mustGet(overlay.anchorTargetId);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.5;
    for (const anchor of ['top', 'right', 'bottom', 'left'] as const) {
      const p = worldToScreen(cam, scene.anchorPoint(target, anchor).point);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  if (overlay.hoverId && !overlay.selection.includes(overlay.hoverId) && scene.has(overlay.hoverId)) {
    drawBoundsOutline(ctx, scene.bounds(overlay.hoverId), cam, 'rgba(47,111,237,0.5)', 1);
  }
  if (overlay.guides.length) {
    ctx.strokeStyle = '#e91e63';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const g of overlay.guides) {
      ctx.beginPath();
      if (g.axis === 'x') {
        const x = Math.round(g.value * cam.zoom + cam.tx) + 0.5;
        ctx.moveTo(x, g.from * cam.zoom + cam.ty);
        ctx.lineTo(x, g.to * cam.zoom + cam.ty);
      } else {
        const y = Math.round(g.value * cam.zoom + cam.ty) + 0.5;
        ctx.moveTo(g.from * cam.zoom + cam.tx, y);
        ctx.lineTo(g.to * cam.zoom + cam.tx, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  for (const peer of overlay.peers) {
    const ids = peer.selection.filter((id) => scene.has(id));
    if (ids.length) {
      const b = scene.boundsOfMany(ids);
      drawBoundsOutline(ctx, b, cam, peer.color, 1.5);
    }
  }
  const frame = selectionFrame(scene, overlay.selection, cam);
  if (frame) drawSelectionFrame(ctx, frame);
  for (const pin of overlay.pins) drawPin(ctx, worldToScreen(cam, pin), pin.count, pin.resolved, pin.active);
  if (overlay.pendingPin) drawPin(ctx, worldToScreen(cam, overlay.pendingPin), 0, false, true);
  for (const peer of overlay.peers) if (peer.cursor) drawPeerCursor(ctx, worldToScreen(cam, peer.cursor), peer);
  if (overlay.marquee) {
    const tl = worldToScreen(cam, { x: overlay.marquee.x, y: overlay.marquee.y });
    ctx.fillStyle = 'rgba(47,111,237,0.12)';
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1;
    ctx.fillRect(tl.x, tl.y, overlay.marquee.w * cam.zoom, overlay.marquee.h * cam.zoom);
    ctx.strokeRect(tl.x, tl.y, overlay.marquee.w * cam.zoom, overlay.marquee.h * cam.zoom);
  }
  ctx.restore();
  return stats;
}

function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, width: number, height: number): void {
  let step = 100 * cam.zoom;
  while (step < 24) step *= 4;
  while (step > 200) step /= 4;
  ctx.fillStyle = '#d5d8de';
  const ox = ((cam.tx % step) + step) % step;
  const oy = ((cam.ty % step) + step) % step;
  for (let x = ox; x < width; x += step) {
    for (let y = oy; y < height; y += step) {
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}

function drawBoundsOutline(ctx: CanvasRenderingContext2D, b: Box, cam: Camera, color: string, width: number): void {
  const tl = worldToScreen(cam, { x: b.x, y: b.y });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(tl.x, tl.y, b.w * cam.zoom, b.h * cam.zoom);
}

function drawPin(ctx: CanvasRenderingContext2D, p: Vec, count: number, resolved: boolean, active: boolean): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = resolved ? '#9aa0a6' : '#f9a825';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  // Teardrop: a round body up and to the right of the spot, with a tip pointing at it.
  const cx = PIN_RADIUS * 0.6;
  const cy = -PIN_RADIUS * 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, PIN_RADIUS, Math.PI * 0.75 + 0.6, Math.PI * 0.75 - 0.6 + Math.PI * 2);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (active) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(PIN_RADIUS * 0.6, -PIN_RADIUS * 0.6, PIN_RADIUS + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count > 0 ? String(count) : '+', PIN_RADIUS * 0.6, -PIN_RADIUS * 0.6);
  ctx.restore();
}

function drawPeerCursor(ctx: CanvasRenderingContext2D, p: Vec, peer: Peer): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = peer.color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 16);
  ctx.lineTo(4.5, 12);
  ctx.lineTo(8, 18);
  ctx.lineTo(10.5, 16.5);
  ctx.lineTo(7, 11);
  ctx.lineTo(12, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(peer.name).width + 10;
  ctx.fillStyle = peer.color;
  ctx.beginPath();
  ctx.roundRect(12, 16, w, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(peer.name, 17, 25);
  ctx.restore();
}

function drawSelectionFrame(ctx: CanvasRenderingContext2D, f: SelectionFrame): void {
  const h = f.handles;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(h.nw.x, h.nw.y);
  ctx.lineTo(h.ne.x, h.ne.y);
  ctx.lineTo(h.se.x, h.se.y);
  ctx.lineTo(h.sw.x, h.sw.y);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(h.n.x, h.n.y);
  ctx.lineTo(h.rotate.x, h.rotate.y);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const name of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
    const p = h[name];
    ctx.fillRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  }
  ctx.beginPath();
  ctx.arc(h.rotate.x, h.rotate.y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Accumulates consecutive shapes that share fill, stroke and line width into
 * one path so the whole run costs a single fill and a single stroke call.
 * Used when zoomed out far enough that per-shape drawing order within a run
 * cannot be told apart.
 */
class Batch {
  private fill: string | null = null;
  private stroke: string | null = null;
  private lineWidth = 0;
  private count = 0;
  /** Minimum world-space distance between pen points worth drawing. */
  private readonly minStep: number;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    zoom: number,
  ) {
    this.minStep = 0.75 / zoom;
  }

  /** Returns false when the shape cannot be batched and must be drawn directly. */
  add(s: Shape): boolean {
    let fill: string | null;
    let stroke: string | null;
    let lineWidth: number;
    switch (s.type) {
      case 'rect':
      case 'ellipse':
        fill = s.fill;
        stroke = s.strokeWidth > 0 ? s.stroke : null;
        lineWidth = s.strokeWidth;
        break;
      case 'sticky':
        fill = s.fill;
        stroke = null;
        lineWidth = 0;
        break;
      case 'line':
        fill = null;
        stroke = s.stroke;
        lineWidth = s.strokeWidth;
        break;
      case 'pen':
        fill = null;
        stroke = s.stroke;
        lineWidth = s.strokeWidth;
        break;
      default:
        return false;
    }
    if (this.count > 0 && (this.count >= BATCH_LIMIT || fill !== this.fill || stroke !== this.stroke || lineWidth !== this.lineWidth)) this.flush();
    if (this.count === 0) {
      this.fill = fill;
      this.stroke = stroke;
      this.lineWidth = lineWidth;
      this.ctx.beginPath();
    }
    this.count++;
    const ctx = this.ctx;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    // Local point (relative to the shape origin) to world, applying rotation about the centre.
    const px = (lx: number, ly: number) => cx + (s.x + lx - cx) * cos - (s.y + ly - cy) * sin;
    const py = (lx: number, ly: number) => cy + (s.x + lx - cx) * sin + (s.y + ly - cy) * cos;
    switch (s.type) {
      case 'rect':
      case 'sticky':
        if (s.rotation === 0) ctx.rect(s.x, s.y, s.w, s.h);
        else {
          ctx.moveTo(px(0, 0), py(0, 0));
          ctx.lineTo(px(s.w, 0), py(s.w, 0));
          ctx.lineTo(px(s.w, s.h), py(s.w, s.h));
          ctx.lineTo(px(0, s.h), py(0, s.h));
          ctx.closePath();
        }
        break;
      case 'ellipse':
        ctx.moveTo(px(s.w, s.h / 2), py(s.w, s.h / 2));
        ctx.ellipse(cx, cy, Math.max(s.w / 2, 0), Math.max(s.h / 2, 0), s.rotation, 0, Math.PI * 2);
        break;
      case 'line':
        ctx.moveTo(px(s.points[0].x, s.points[0].y), py(s.points[0].x, s.points[0].y));
        ctx.lineTo(px(s.points[1].x, s.points[1].y), py(s.points[1].x, s.points[1].y));
        break;
      case 'pen': {
        const pts = s.points;
        let last = pts[0];
        ctx.moveTo(px(last.x, last.y), py(last.x, last.y));
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          if (i < pts.length - 1 && Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < this.minStep) continue;
          ctx.lineTo(px(p.x, p.y), py(p.x, p.y));
          last = p;
        }
        if (pts.length === 1) ctx.lineTo(px(last.x, last.y) + 0.01, py(last.x, last.y));
        break;
      }
    }
    return true;
  }

  flush(): void {
    if (this.count === 0) return;
    const ctx = this.ctx;
    if (this.fill !== null) {
      ctx.fillStyle = this.fill;
      ctx.fill();
    }
    if (this.stroke !== null) {
      ctx.strokeStyle = this.stroke;
      ctx.lineWidth = this.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    this.count = 0;
  }
}

/**
 * Draw one shape in world coordinates. `base` is the context transform to
 * restore after drawing a rotated shape; it avoids save/restore per shape.
 */
export function drawShape(ctx: CanvasRenderingContext2D, scene: Scene, s: Shape, zoom: number, base?: Matrix): void {
  switch (s.type) {
    case 'group':
      return;
    case 'connector': {
      const g = scene.connectorGeometry(s);
      const pts = g.points;
      const a = pts[0];
      const b = pts[pts.length - 1];
      const beforeB = pts[pts.length - 2] ?? a;
      ctx.strokeStyle = s.stroke;
      ctx.fillStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (g.curve) ctx.bezierCurveTo(g.curve.c1.x, g.curve.c1.y, g.curve.c2.x, g.curve.c2.y, b.x, b.y);
      else for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      const ang = Math.atan2(b.y - beforeB.y, b.x - beforeB.x);
      const size = 8 + s.strokeWidth;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - size * Math.cos(ang - 0.4), b.y - size * Math.sin(ang - 0.4));
      ctx.lineTo(b.x - size * Math.cos(ang + 0.4), b.y - size * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
      return;
    }
    default:
      break;
  }
  const rotated = s.rotation !== 0;
  const restore = base ?? (rotated ? matrixOf(ctx) : undefined);
  if (rotated && restore) {
    // base * translate(c) * rotate(r) * translate(-c), composed by hand.
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    const [a, b, c, d, e, f] = restore;
    const ra = a * cos + c * sin;
    const rb = b * cos + d * sin;
    const rc = -a * sin + c * cos;
    const rd = -b * sin + d * cos;
    const tx = cx - ra * cx - rc * cy;
    const ty = cy - rb * cx - rd * cy;
    ctx.setTransform(ra, rb, rc, rd, a * tx + c * ty + e, b * tx + d * ty + f);
  }
  switch (s.type) {
    case 'rect':
      ctx.fillStyle = s.fill;
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      if (s.strokeWidth > 0) ctx.stroke();
      break;
    case 'ellipse':
      ctx.fillStyle = s.fill;
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.beginPath();
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.max(s.w / 2, 0), Math.max(s.h / 2, 0), 0, 0, Math.PI * 2);
      ctx.fill();
      if (s.strokeWidth > 0) ctx.stroke();
      break;
    case 'line':
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x + s.points[0].x, s.y + s.points[0].y);
      ctx.lineTo(s.x + s.points[1].x, s.y + s.points[1].y);
      ctx.stroke();
      break;
    case 'pen':
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (s.points.length === 1) {
        ctx.arc(s.x + s.points[0].x, s.y + s.points[0].y, s.strokeWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = s.stroke;
        ctx.fill();
        break;
      }
      ctx.moveTo(s.x + s.points[0].x, s.y + s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.x + s.points[i].x, s.y + s.points[i].y);
      ctx.stroke();
      break;
    case 'sticky': {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(s.x + 3, s.y + 4, s.w, s.h);
      ctx.fillStyle = s.fill;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      drawText(ctx, s, zoom, 10);
      break;
    }
    case 'text':
      drawText(ctx, s, zoom, 0);
      break;
    case 'frame': {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#9aa0a6';
      ctx.lineWidth = 1.5;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      if (zoom * 14 >= 4) {
        ctx.fillStyle = '#5f6368';
        ctx.font = '14px system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(s.title, s.x + 4, s.y - 4, s.w);
      }
      break;
    }
  }
  if (rotated && restore) ctx.setTransform(restore[0], restore[1], restore[2], restore[3], restore[4], restore[5]);
}

/** [a, b, c, d, e, f] of the current context transform. */
export type Matrix = [number, number, number, number, number, number];

function matrixOf(ctx: CanvasRenderingContext2D): Matrix {
  const m = ctx.getTransform();
  return [m.a, m.b, m.c, m.d, m.e, m.f];
}

function drawText(ctx: CanvasRenderingContext2D, s: StickyShape | TextShape, zoom: number, pad: number): void {
  const { size, font } = fontFor(s);
  if (size * zoom < 5) return; // too small to read; skip for speed
  if (!s.text) return;
  const width = Math.max(s.w - pad * 2, 1);
  const lines = wrappedLines(ctx, s, width, font);
  ctx.font = font;
  ctx.fillStyle = s.type === 'text' ? s.color : '#222222';
  ctx.textBaseline = 'top';
  const lineHeight = size * 1.25;
  const maxLines = Math.max(1, Math.floor((s.h - pad * 2 + lineHeight * 0.25) / lineHeight));
  const n = Math.min(lines.length, maxLines);
  for (let i = 0; i < n; i++) {
    ctx.fillText(lines[i], s.x + pad, s.y + pad + i * lineHeight, width);
  }
}

/** Render the whole board (or a region) to an offscreen canvas, e.g. for PNG export. */
export function renderToCanvas(scene: Scene, region: Box, scale = 1, padding = 20): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = Math.max(1, Math.ceil((region.w + padding * 2) * scale));
  const h = Math.max(1, Math.ceil((region.h + padding * 2) * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, (padding - region.x) * scale, (padding - region.y) * scale);
  const base = matrixOf(ctx);
  const all = scene.all();
  for (const s of all) if (s.type === 'frame') drawShape(ctx, scene, s, scale, base);
  for (const s of all) if (s.type !== 'frame') drawShape(ctx, scene, s, scale, base);
  return canvas;
}

export function boardBounds(scene: Scene): Box {
  const ids = scene.all().filter((s) => s.type !== 'group').map((s) => s.id);
  if (ids.length === 0) return { x: 0, y: 0, w: 800, h: 600 };
  const b = scene.boundsOfMany(ids);
  // Include frame titles.
  return { x: b.x, y: b.y - FRAME_TITLE_HEIGHT, w: b.w, h: b.h + FRAME_TITLE_HEIGHT };
}
