import type { Box } from './geometry';

/** A guide line drawn while snapping: vertical at x=value (axis 'x') or horizontal at y=value. */
export interface Guide {
  axis: 'x' | 'y';
  value: number;
  from: number;
  to: number;
}

/** A pair of equal gaps shown while snapping to even spacing. */
export interface SpacingGuide {
  axis: 'x' | 'y';
  /** Cross-axis position the gap markers are drawn at. */
  at: number;
  /** Each gap as a [from, to] span along the axis. */
  gaps: [number, number][];
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
  spacing: SpacingGuide[];
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
  const spacing: SpacingGuide[] = [];
  let dx = 0;
  let dy = 0;
  if (bestX) {
    dx = bestX.delta;
    guides.push({ axis: 'x', value: bestX.candidate.value, from: Math.min(bestX.candidate.lo, moving.y + dy), to: Math.max(bestX.candidate.hi, moving.y + moving.h) });
  } else {
    const even = evenSpacing(moving, others, 'x', threshold);
    if (even) {
      dx = even.delta;
      spacing.push(even.guide);
    } else if (grid) dx = Math.round(moving.x / grid) * grid - moving.x;
  }
  if (bestY) {
    dy = bestY.delta;
    guides.push({ axis: 'y', value: bestY.candidate.value, from: Math.min(bestY.candidate.lo, moving.x + dx), to: Math.max(bestY.candidate.hi, moving.x + dx + moving.w) });
  } else {
    const even = evenSpacing(moving, others, 'y', threshold);
    if (even) {
      dy = even.delta;
      spacing.push(even.guide);
    } else if (grid) dy = Math.round(moving.y / grid) * grid - moving.y;
  }
  // Extend the vertical guide to cover the box's snapped vertical extent.
  if (bestX) {
    guides[0].from = Math.min(guides[0].from, moving.y + dy);
    guides[0].to = Math.max(guides[0].to, moving.y + dy + moving.h);
  }
  return { dx, dy, guides, spacing };
}

/** Which edges of a box a resize handle moves. */
export interface MovingEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

export interface EdgeSnapResult {
  /** Snapped edge positions; absent when that edge did not snap. */
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  guides: Guide[];
}

/**
 * Snap the edges being dragged during a resize to the edges and centres of
 * other boxes. Only the moving edges are considered, so the anchored side of
 * the box never shifts.
 */
export function snapEdges(box: Box, edges: MovingEdges, others: readonly Box[], threshold: number, grid: number | null): EdgeSnapResult {
  const xs: Candidate[] = [];
  const ys: Candidate[] = [];
  for (const b of others) {
    xs.push({ value: b.x, lo: b.y, hi: b.y + b.h }, { value: b.x + b.w / 2, lo: b.y, hi: b.y + b.h }, { value: b.x + b.w, lo: b.y, hi: b.y + b.h });
    ys.push({ value: b.y, lo: b.x, hi: b.x + b.w }, { value: b.y + b.h / 2, lo: b.x, hi: b.x + b.w }, { value: b.y + b.h, lo: b.x, hi: b.x + b.w });
  }
  const out: EdgeSnapResult = { guides: [] };
  const snapOne = (value: number, cands: Candidate[], axis: 'x' | 'y', lo: number, hi: number): number | undefined => {
    const hit = best([value], cands, threshold);
    if (hit) {
      out.guides.push({ axis, value: hit.candidate.value, from: Math.min(hit.candidate.lo, lo), to: Math.max(hit.candidate.hi, hi) });
      return hit.candidate.value;
    }
    if (grid) return Math.round(value / grid) * grid;
    return undefined;
  };
  if (edges.left) out.left = snapOne(box.x, xs, 'x', box.y, box.y + box.h);
  if (edges.right) out.right = snapOne(box.x + box.w, xs, 'x', box.y, box.y + box.h);
  if (edges.top) out.top = snapOne(box.y, ys, 'y', box.x, box.x + box.w);
  if (edges.bottom) out.bottom = snapOne(box.y + box.h, ys, 'y', box.x, box.x + box.w);
  return out;
}

/**
 * Snap so the gap between the moving box and its neighbour equals the gap
 * between that neighbour and the next box along the axis (or so the moving
 * box sits centred between two boxes). Only boxes whose cross-axis extent
 * overlaps the moving box count as neighbours.
 */
function evenSpacing(moving: Box, others: readonly Box[], axis: 'x' | 'y', threshold: number): { delta: number; guide: SpacingGuide } | null {
  const lo = (b: Box) => (axis === 'x' ? b.x : b.y);
  const hi = (b: Box) => (axis === 'x' ? b.x + b.w : b.y + b.h);
  const clo = (b: Box) => (axis === 'x' ? b.y : b.x);
  const chi = (b: Box) => (axis === 'x' ? b.y + b.h : b.x + b.w);
  const size = axis === 'x' ? moving.w : moving.h;
  const row = others.filter((b) => clo(b) < chi(moving) && chi(b) > clo(moving)).sort((a, b) => lo(a) - lo(b));
  if (row.length < 2) return null;
  const at = (Math.max(clo(moving), ...row.map(clo)) + Math.min(chi(moving), ...row.map(chi))) / 2;
  let bestMatch: { delta: number; guide: SpacingGuide } | null = null;
  const consider = (target: number, gaps: [number, number][]) => {
    const delta = target - lo(moving);
    if (Math.abs(delta) <= threshold && (!bestMatch || Math.abs(delta) < Math.abs(bestMatch.delta))) bestMatch = { delta, guide: { axis, at, gaps } };
  };
  for (let i = 0; i + 1 < row.length; i++) {
    const a = row[i];
    const b = row[i + 1];
    const gap = lo(b) - hi(a);
    if (gap < 0) continue;
    // After b, with the same gap.
    consider(hi(b) + gap, [
      [hi(a), lo(b)],
      [hi(b), hi(b) + gap],
    ]);
    // Before a, with the same gap.
    consider(lo(a) - gap - size, [
      [lo(a) - gap, lo(a)],
      [hi(a), lo(b)],
    ]);
    // Centred between a and b.
    if (gap >= size) {
      const side = (gap - size) / 2;
      consider(hi(a) + side, [
        [hi(a), hi(a) + side],
        [lo(b) - side, lo(b)],
      ]);
    }
  }
  return bestMatch;
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
