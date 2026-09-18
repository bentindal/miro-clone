import { describe, expect, it } from 'vitest';
import { alignDeltas, computeSnap, distributeDeltas, snapEdges } from '../snap';

const box = (x: number, y: number, w = 100, h = 50) => ({ x, y, w, h });

describe('computeSnap', () => {
  it('snaps a left edge to another left edge within the threshold', () => {
    const r = computeSnap(box(104, 300), [box(100, 100)], 6, null);
    expect(r.dx).toBe(-4);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([{ axis: 'x', value: 100, from: 100, to: 350 }]);
  });

  it('snaps centres and right edges too, choosing the closest', () => {
    // Moving right edge at 203 is 3 from the other's right edge at 200; centre 153 is 47 from 150.
    const r = computeSnap(box(103, 300), [box(100, 100)], 6, null);
    expect(r.dx).toBe(-3);
    // Centre to centre when that is the nearest match.
    const r2 = computeSnap(box(0, 300, 40, 40), [box(100, 100)], 6, null);
    expect(r2.dx).toBe(0);
    const r3 = computeSnap(box(133, 300, 40, 40), [box(100, 100)], 6, null);
    expect(r3.dx).toBe(-3); // moving centre 153 -> 150
  });

  it('ignores candidates outside the threshold', () => {
    const r = computeSnap(box(120, 300), [box(100, 100)], 6, null);
    expect(r).toEqual({ dx: 0, dy: 0, guides: [], spacing: [] });
  });

  it('snaps both axes independently and emits two guides', () => {
    const r = computeSnap(box(102, 153), [box(100, 100)], 6, null);
    expect(r.dx).toBe(-2);
    expect(r.dy).toBe(-3); // moving top 153 -> other bottom 150
    expect(r.guides.map((g) => g.axis)).toEqual(['x', 'y']);
    expect(r.guides[1]).toEqual({ axis: 'y', value: 150, from: 100, to: 200 });
  });

  it('falls back to the grid when no shape snap is found on an axis', () => {
    const r = computeSnap(box(113, 300), [box(100, 100)], 6, 20);
    // x: shape snap wins (113 -> ... no: 113 is 13 from 100, outside threshold) -> grid 120
    expect(r.dx).toBe(7);
    expect(r.dy).toBe(0); // 300 is already on the grid
    expect(r.guides).toEqual([]);
    expect(r.spacing).toEqual([]);
    const r2 = computeSnap(box(102, 311), [box(100, 100)], 6, 20);
    expect(r2.dx).toBe(-2); // shape snap beats grid
    expect(r2.dy).toBe(9); // 311 -> 320
  });
});

describe('even spacing', () => {
  // Two boxes in a row 40 apart: A at 0..100, B at 140..240, both at y 0..50.
  // The moving box sits at y 33..83: overlapping the row, but no y edge or centre within 6 of theirs.
  const row = [box(0, 0), box(140, 0)];

  it('snaps a third box to continue the row with the same gap', () => {
    const r = computeSnap(box(283, 33), row, 6, null);
    expect(r.dx).toBe(-3); // 283 -> 280 = B.right 240 + gap 40
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([]);
    expect(r.spacing).toEqual([{ axis: 'x', at: 41.5, gaps: [[100, 140], [240, 280]] }]);
  });

  it('snaps before the row too, and centred between two boxes', () => {
    const before = computeSnap(box(-143, 33), row, 6, null);
    expect(before.dx).toBe(3); // -143 -> -140 = A.left 0 - gap 40 - width 100
    const wide = [box(0, 0), box(300, 0)];
    const centred = computeSnap(box(153, 33), wide, 6, null);
    expect(centred.dx).toBe(-3); // gap 200, box 100 -> 50 each side -> x = 150
    expect(centred.spacing[0].gaps).toEqual([[100, 150], [250, 300]]);
  });

  it('ignores boxes that do not overlap on the cross axis', () => {
    const r = computeSnap(box(283, 500), row, 6, null);
    expect(r.dx).toBe(0);
    expect(r.spacing).toEqual([]);
  });

  it('edge snapping wins over spacing', () => {
    // An extra box with a left edge at 281, 2 away, beats the spacing target at 280.
    const r = computeSnap(box(283, 33), [...row, box(281, 200, 10, 10)], 6, null);
    expect(r.dx).toBe(-2);
    expect(r.guides).toHaveLength(1);
    expect(r.spacing).toEqual([]);
  });
});

describe('snapEdges', () => {
  it('snaps only the moving edges and reports their guides', () => {
    const r = snapEdges(box(0, 0, 104, 50), { right: true }, [box(100, 100, 50, 50)], 6, null);
    expect(r.right).toBe(100);
    expect(r.left).toBeUndefined();
    expect(r.guides).toEqual([{ axis: 'x', value: 100, from: 0, to: 150 }]);
  });

  it('snaps to centres and falls back to the grid', () => {
    const r = snapEdges(box(0, 0, 100, 53), { bottom: true, left: true }, [box(200, 40, 100, 20)], 6, 20);
    expect(r.bottom).toBe(50); // centre of the other box
    expect(r.left).toBe(0); // grid
    // 71 is beyond the other box's bottom edge (60) by more than the threshold, so the grid wins.
    const r2 = snapEdges(box(0, 0, 100, 71), { bottom: true }, [box(200, 40, 100, 20)], 6, 20);
    expect(r2.bottom).toBe(80);
    expect(r2.guides).toEqual([]);
  });
});

describe('alignDeltas', () => {
  const boxes = [box(0, 0, 100, 50), box(200, 100, 50, 50), box(400, 30, 100, 100)];

  it('aligns to left, right and horizontal centre', () => {
    expect(alignDeltas(boxes, 'left').map((d) => d.dx)).toEqual([0, -200, -400]);
    expect(alignDeltas(boxes, 'right').map((d) => d.dx)).toEqual([400, 250, 0]);
    expect(alignDeltas(boxes, 'centerX').map((d) => d.dx)).toEqual([200, 25, -200]);
    expect(alignDeltas(boxes, 'left').every((d) => d.dy === 0)).toBe(true);
  });

  it('aligns to top, bottom and vertical centre', () => {
    expect(alignDeltas(boxes, 'top').map((d) => d.dy)).toEqual([0, -100, -30]);
    // Bottoms are at 50, 150 and 130; the union spans y 0..150, centre 75.
    expect(alignDeltas(boxes, 'bottom').map((d) => d.dy)).toEqual([100, 0, 20]);
    expect(alignDeltas(boxes, 'centerY').map((d) => d.dy)).toEqual([50, -50, -5]);
  });
});

describe('distributeDeltas', () => {
  it('spaces the middle boxes evenly and keeps the outer ones fixed', () => {
    const boxes = [box(0, 0, 100, 50), box(120, 0, 50, 50), box(400, 0, 100, 50)];
    const d = distributeDeltas(boxes, 'x');
    // Span 0..500, widths total 250, two gaps of 125: middle box starts at 225.
    expect(d).toEqual([
      { dx: 0, dy: 0 },
      { dx: 105, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });

  it('works regardless of input order and on the y axis', () => {
    const boxes = [box(0, 400, 50, 100), box(0, 0, 50, 100), box(0, 110, 50, 50)];
    const d = distributeDeltas(boxes, 'y');
    // Sorted: y=0 (h100), y=110 (h50), y=400 (h100). Span 0..500, sizes 250, gaps 125 -> middle at 225.
    expect(d[2]).toEqual({ dx: 0, dy: 115 });
    expect(d[0]).toEqual({ dx: 0, dy: 0 });
    expect(d[1]).toEqual({ dx: 0, dy: 0 });
  });

  it('does nothing for fewer than three boxes', () => {
    expect(distributeDeltas([box(0, 0), box(300, 0)], 'x')).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });
});
