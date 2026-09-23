import type { Box, Vec } from '../model/geometry';
import type { Scene } from '../model/scene';
import type { CanvasTheme } from './theme';

/** Margin inside the minimap, so a shape at the very edge is still drawn. */
export const MINIMAP_PAD = 6;
/** Smallest a shape is drawn at, so a thin line does not vanish entirely. */
const MIN_MARK = 2;

export interface MinimapView {
  /** The world rectangle the minimap covers. */
  world: Box;
  /** Minimap pixels per world unit. */
  scale: number;
  /** Where world (0, 0) lands, in minimap pixels. */
  tx: number;
  ty: number;
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * How the minimap maps the world onto its own pixels.
 *
 * It covers the content *and* what the viewport can currently see, united.
 * Covering only the content would let the viewport rectangle wander off the
 * minimap as soon as someone panned past the last shape, which is exactly
 * when they most want to know where they are.
 *
 * One scale for both axes, so the picture is not stretched, and the shorter
 * axis is centred.
 */
export function minimapView(content: Box, visible: Box, w: number, h: number, pad = MINIMAP_PAD): MinimapView {
  const world = union(content, visible);
  const iw = Math.max(w - pad * 2, 1);
  const ih = Math.max(h - pad * 2, 1);
  const scale = Math.min(iw / Math.max(world.w, 1), ih / Math.max(world.h, 1));
  return {
    world,
    scale,
    tx: pad + (iw - world.w * scale) / 2 - world.x * scale,
    ty: pad + (ih - world.h * scale) / 2 - world.y * scale,
  };
}

export function toMinimap(view: MinimapView, p: Vec): Vec {
  return { x: p.x * view.scale + view.tx, y: p.y * view.scale + view.ty };
}

export function fromMinimap(view: MinimapView, p: Vec): Vec {
  return { x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale };
}

/** A world box in minimap pixels. */
export function boxToMinimap(view: MinimapView, b: Box): Box {
  const tl = toMinimap(view, b);
  return { x: tl.x, y: tl.y, w: b.w * view.scale, h: b.h * view.scale };
}

/**
 * The whole board at a glance: one filled mark per shape, and the viewport as
 * an outlined rectangle. Shapes are drawn as their bounding boxes rather than
 * rendered properly, because at this size the difference is invisible and the
 * cost is not: this redraws on every change.
 */
export function drawMinimap(ctx: CanvasRenderingContext2D, scene: Scene, view: MinimapView, visible: Box, w: number, h: number, theme: CanvasTheme): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = theme.textMuted;
  for (const s of scene.all()) {
    if (s.type === 'group') continue;
    const b = boxToMinimap(view, scene.boundsOfShape(s));
    ctx.fillRect(b.x, b.y, Math.max(b.w, MIN_MARK), Math.max(b.h, MIN_MARK));
  }

  const vp = boxToMinimap(view, visible);
  ctx.fillStyle = theme.accentSoft;
  ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(vp.x + 0.5, vp.y + 0.5, Math.max(vp.w - 1, 1), Math.max(vp.h - 1, 1));
}
