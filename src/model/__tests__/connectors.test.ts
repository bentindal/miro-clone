import { describe, expect, it } from 'vitest';
import { Scene, elbowRoute, simplifyPolyline } from '../scene';
import { connector, ellipse, rect } from './fixtures';
import type { ConnectorShape } from '../types';

function withStyle(c: ConnectorShape, patch: Partial<ConnectorShape>): ConnectorShape {
  return { ...c, ...patch };
}

describe('connector anchors', () => {
  it('anchorPoint gives side midpoints and outward normals', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 50));
    const a = s.mustGet('a');
    expect(s.anchorPoint(a, 'top')).toEqual({ point: { x: 50, y: 0 }, normal: { x: 0, y: -1 } });
    expect(s.anchorPoint(a, 'right')).toEqual({ point: { x: 100, y: 25 }, normal: { x: 1, y: 0 } });
    expect(s.anchorPoint(a, 'bottom')).toEqual({ point: { x: 50, y: 50 }, normal: { x: 0, y: 1 } });
    expect(s.anchorPoint(a, 'left')).toEqual({ point: { x: 0, y: 25 }, normal: { x: -1, y: 0 } });
  });

  it('anchorPoint follows rotation', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 50, { rotation: Math.PI / 2 }));
    const { point, normal } = s.anchorPoint(s.mustGet('a'), 'right');
    // Rotated 90 degrees around (50, 25): the right side midpoint moves to the bottom.
    expect(point.x).toBeCloseTo(50);
    expect(point.y).toBeCloseTo(75);
    expect(normal.x).toBeCloseTo(0);
    expect(normal.y).toBeCloseTo(1);
  });

  it('nearestAnchor picks the closest side within tolerance', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 50));
    const a = s.mustGet('a');
    expect(s.nearestAnchor(a, { x: 52, y: 3 }, 10)).toBe('top');
    expect(s.nearestAnchor(a, { x: 97, y: 30 }, 10)).toBe('right');
    expect(s.nearestAnchor(a, { x: 50, y: 25 }, 10)).toBeNull();
  });

  it('fixed anchors override the auto edge point', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 100));
    s.add(rect('b', 300, 0, 100, 100));
    const k = connector('k', 'a', 'b');
    s.add(withStyle(k, { start: { ...k.start, anchor: 'bottom' }, end: { ...k.end, anchor: 'top' } }));
    const { a, b } = s.connectorPoints(s.mustGet('k') as ConnectorShape);
    expect(a).toEqual({ x: 50, y: 100 });
    expect(b).toEqual({ x: 350, y: 0 });
  });

  it('an auto end aims at the other end\'s fixed anchor', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 100));
    s.add(rect('b', 300, 300, 100, 100));
    const k = connector('k', 'a', 'b');
    s.add(withStyle(k, { end: { ...k.end, anchor: 'top' } }));
    const { a, b } = s.connectorPoints(s.mustGet('k') as ConnectorShape);
    expect(b).toEqual({ x: 350, y: 300 });
    // From (50,50) towards (350,300): leaves the right edge.
    expect(a.x).toBe(100);
    expect(a.y).toBeCloseTo(50 + (50 / 300) * 250);
  });
});

describe('elbow routing', () => {
  it('routes horizontally first when the exit direction is horizontal', () => {
    const pts = elbowRoute({ x: 0, y: 0 }, { x: 1, y: 0 }, false, { x: 100, y: 60 }, { x: -1, y: 0 }, false);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 60 },
      { x: 100, y: 60 },
    ]);
  });

  it('adds stubs for fixed anchors so the line leaves the shape perpendicular', () => {
    const pts = elbowRoute({ x: 50, y: 100 }, { x: 0, y: 1 }, true, { x: 350, y: 0 }, { x: 0, y: -1 }, true);
    expect(pts[0]).toEqual({ x: 50, y: 100 });
    expect(pts[1]).toEqual({ x: 50, y: 124 });
    expect(pts[pts.length - 2]).toEqual({ x: 350, y: -24 });
    expect(pts[pts.length - 1]).toEqual({ x: 350, y: 0 });
    // Every segment is axis aligned.
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true);
    }
  });

  it('collapses to a straight segment when the ends are aligned', () => {
    const pts = elbowRoute({ x: 0, y: 10 }, { x: 1, y: 0 }, false, { x: 100, y: 10 }, { x: -1, y: 0 }, false);
    expect(pts).toEqual([
      { x: 0, y: 10 },
      { x: 100, y: 10 },
    ]);
  });

  it('simplifyPolyline removes duplicates and collinear points', () => {
    expect(
      simplifyPolyline([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('scene geometry for elbow connectors between shapes is orthogonal and ends on the shapes', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 100));
    s.add(ellipse('b', 300, 200, 100, 100));
    s.add(withStyle(connector('k', 'a', 'b'), { style: 'elbow' }));
    const g = s.connectorGeometry(s.mustGet('k') as ConnectorShape);
    expect(g.points.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < g.points.length; i++) {
      const p = g.points[i - 1];
      const q = g.points[i];
      expect(Math.abs(p.x - q.x) < 1e-9 || Math.abs(p.y - q.y) < 1e-9).toBe(true);
    }
    expect(g.points[0].x).toBe(100);
    expect(s.bounds('k')).toMatchObject({ x: 100 });
  });
});

describe('curved routing', () => {
  it('samples a bezier whose ends are the resolved endpoints and whose bounds cover the samples', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 100));
    s.add(rect('b', 300, 300, 100, 100));
    s.add(withStyle(connector('k', 'a', 'b'), { style: 'curved' }));
    const k = s.mustGet('k') as ConnectorShape;
    const g = s.connectorGeometry(k);
    expect(g.curve).toBeDefined();
    expect(g.points).toHaveLength(25);
    const straight = s.connectorGeometry({ ...k, style: 'straight' });
    expect(g.points[0]).toEqual(straight.points[0]);
    expect(g.points[24]).toEqual(straight.points[1]);
    const b = s.bounds('k');
    for (const p of g.points) {
      expect(p.x).toBeGreaterThanOrEqual(b.x - 1e-9);
      expect(p.x).toBeLessThanOrEqual(b.x + b.w + 1e-9);
    }
  });
});
