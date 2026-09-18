import type { Box } from './geometry';

/** A guide line drawn while snapping: vertical at x=value (axis 'x') or horizontal at y=value. */
export interface Guide {
  axis: 'x' | 'y';
  value: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

interface Candidate {
  value: number;
  /** Extent of the source box along the other axis, for drawing the guide. */
  lo: number;
  hi: number;
}

/**
 * Snap a moving box to the edges and centres of other boxes. Returns the
 * correction to add to the box position and the guides to draw. When no
 * shape snap is found on an axis and `grid` is set, the box's top-left
 * snaps to the grid instead.
 */
export function computeSnap(moving: Box, others: readonly Box[], threshold: number, grid: number | null): SnapResult {
  const xs: Candidate[] = [];
  const ys: Candidate[] = [];
  for (const b of others) {
    xs.push({ value: b.x, lo: b.y, hi: b.y + b.h }, { value: b.x + b.w / 2, lo: b.y, hi: b.y + b.h }, { value: b.x + b.w, lo: b.y, hi: b.y + b.h });
    ys.push({ value: b.y, lo: b.x, hi: b.x + b.w }, { value: b.y + b.h / 2, lo: b.x, hi: b.x + b.w }, { value: b.y + b.h, lo: b.x, hi: b.x + b.w });
  }
  const movingX = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const movingY = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const bestX = best(movingX, xs, threshold);
  const bestY = best(movingY, ys, threshold);
  const guides: Guide[] = [];
  let dx = 0;
  let dy = 0;
  if (bestX) {
    dx = bestX.delta;
    guides.push({ axis: 'x', value: bestX.candidate.value, from: Math.min(bestX.candidate.lo, moving.y + dy), to: Math.max(bestX.candidate.hi, moving.y + moving.h) });
  } else if (grid) {
    dx = Math.round(moving.x / grid) * grid - moving.x;
  }
  if (bestY) {
    dy = bestY.delta;
    guides.push({ axis: 'y', value: bestY.candidate.value, from: Math.min(bestY.candidate.lo, moving.x + dx), to: Math.max(bestY.candidate.hi, moving.x + dx + moving.w) });
  } else if (grid) {
    dy = Math.round(moving.y / grid) * grid - moving.y;
  }
  // Extend the vertical guide to cover the box's snapped vertical extent.
  if (bestX) {
    guides[0].from = Math.min(guides[0].from, moving.y + dy);
    guides[0].to = Math.max(guides[0].to, moving.y + dy + moving.h);
  }
  return { dx, dy, guides };
}

function best(movingEdges: number[], candidates: Candidate[], threshold: number): { delta: number; candidate: Candidate } | null {
  let result: { delta: number; candidate: Candidate } | null = null;
  // Strict comparison: on a tie the earlier edge (left/top) wins.
  let bestAbs = threshold + 1e-9;
  for (const edge of movingEdges) {
    for (const c of candidates) {
      const delta = c.value - edge;
      const abs = Math.abs(delta);
      if (abs < bestAbs) {
        bestAbs = abs;
        result = { delta, candidate: c };
      }
    }
  }
  return result;
}

export type AlignKind = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

/** Translation to apply to each box so they line up on the chosen edge of their union. */
export function alignDeltas(boxes: readonly Box[], kind: AlignKind): { dx: number; dy: number }[] {
  if (boxes.length === 0) return [];
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return boxes.map((b) => {
    switch (kind) {
      case 'left':
        return { dx: minX - b.x, dy: 0 };
      case 'centerX':
        return { dx: cx - (b.x + b.w / 2), dy: 0 };
      case 'right':
        return { dx: maxX - (b.x + b.w), dy: 0 };
      case 'top':
        return { dx: 0, dy: minY - b.y };
      case 'centerY':
        return { dx: 0, dy: cy - (b.y + b.h / 2) };
      case 'bottom':
        return { dx: 0, dy: maxY - (b.y + b.h) };
    }
  });
}

/**
 * Translation per box so the gaps between neighbours are equal along an
 * axis. The outermost boxes stay where they are.
 */
export function distributeDeltas(boxes: readonly Box[], axis: 'x' | 'y'): { dx: number; dy: number }[] {
  const n = boxes.length;
  const out = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (n < 3) return out;
  const pos = (b: Box) => (axis === 'x' ? b.x : b.y);
  const size = (b: Box) => (axis === 'x' ? b.w : b.h);
  const order = boxes.map((_, i) => i).sort((i, j) => pos(boxes[i]) - pos(boxes[j]));
  const first = boxes[order[0]];
  const last = boxes[order[n - 1]];
  const span = pos(last) + size(last) - pos(first);
  const total = order.reduce((acc, i) => acc + size(boxes[i]), 0);
  const gap = (span - total) / (n - 1);
  let cursor = pos(first) + size(first) + gap;
  for (let k = 1; k < n - 1; k++) {
    const i = order[k];
    const delta = cursor - pos(boxes[i]);
    out[i] = axis === 'x' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
    cursor += size(boxes[i]) + gap;
  }
  return out;
}
