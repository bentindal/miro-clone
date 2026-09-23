import { describe, expect, it } from 'vitest';
import type { Box } from '../../model/geometry';
import { MINIMAP_PAD, boxToMinimap, fromMinimap, minimapView, toMinimap } from '../minimap';

const W = 180;
const H = 120;

/** Every corner of `b`, in minimap pixels. */
function corners(view: ReturnType<typeof minimapView>, b: Box) {
  return [
    toMinimap(view, { x: b.x, y: b.y }),
    toMinimap(view, { x: b.x + b.w, y: b.y + b.h }),
  ];
}

const inside = (p: { x: number; y: number }) => p.x >= -0.01 && p.y >= -0.01 && p.x <= W + 0.01 && p.y <= H + 0.01;

describe('the minimap view', () => {
  it('maps the world onto its pixels and back again', () => {
    const view = minimapView({ x: -500, y: 200, w: 3000, h: 1000 }, { x: 0, y: 0, w: 800, h: 600 }, W, H);
    for (const p of [
      { x: 0, y: 0 },
      { x: -500, y: 200 },
      { x: 2500, y: 1200 },
      { x: 123.5, y: -77.25 },
    ]) {
      const back = fromMinimap(view, toMinimap(view, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('fits the content inside, with the padding kept clear', () => {
    const content = { x: 100, y: 100, w: 2000, h: 400 };
    const view = minimapView(content, content, W, H);
    for (const c of corners(view, content)) {
      expect(inside(c)).toBe(true);
      expect(c.x).toBeGreaterThanOrEqual(MINIMAP_PAD - 0.01);
      expect(c.y).toBeGreaterThanOrEqual(MINIMAP_PAD - 0.01);
    }
  });

  // A stretched minimap would put a square shape on screen as a rectangle,
  // and dragging it would move the camera further one way than the other.
  it('uses one scale for both axes, so nothing is stretched', () => {
    const view = minimapView({ x: 0, y: 0, w: 4000, h: 200 }, { x: 0, y: 0, w: 4000, h: 200 }, W, H);
    const square = boxToMinimap(view, { x: 0, y: 0, w: 100, h: 100 });
    expect(square.w).toBeCloseTo(square.h, 6);
  });

  // Covering only the content would let the viewport rectangle wander off the
  // minimap the moment someone panned past the last shape.
  it('covers the viewport too, even when it has left the content behind', () => {
    const content = { x: 0, y: 0, w: 500, h: 500 };
    const away = { x: 9000, y: -4000, w: 800, h: 600 };
    const view = minimapView(content, away, W, H);
    for (const c of [...corners(view, content), ...corners(view, away)]) expect(inside(c)).toBe(true);
  });

  it('still works when the board is a single point', () => {
    const dot = { x: 42, y: 42, w: 0, h: 0 };
    const view = minimapView(dot, dot, W, H);
    expect(Number.isFinite(view.scale)).toBe(true);
    expect(inside(toMinimap(view, dot))).toBe(true);
  });

  // Clicking the middle of the minimap has to mean the middle of what it
  // shows, or the camera lands somewhere the person did not point at.
  it('reads its own centre as the centre of what it covers', () => {
    const view = minimapView({ x: -100, y: -100, w: 1200, h: 800 }, { x: 0, y: 0, w: 800, h: 600 }, W, H);
    const mid = fromMinimap(view, { x: W / 2, y: H / 2 });
    expect(mid.x).toBeCloseTo(view.world.x + view.world.w / 2, 6);
    expect(mid.y).toBeCloseTo(view.world.y + view.world.h / 2, 6);
  });
});
