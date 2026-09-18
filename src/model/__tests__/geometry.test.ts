import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  boxFromPoints,
  distToSegment,
  fitCamera,
  normalizeBox,
  panCamera,
  rotatePoint,
  rotatedBounds,
  screenToWorld,
  unionBoxes,
  visibleWorldBox,
  worldToScreen,
  zoomCameraAt,
  zoomCameraBy,
} from '../geometry';
import { Scene, normalizeAngle, rectEdgePoint, resizeBoxed } from '../scene';
import { pen, rect } from './fixtures';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('camera transforms', () => {
  it('world/screen round trip', () => {
    const cam = { tx: 120, ty: -40, zoom: 1.75 };
    const p = { x: 33.3, y: -12.5 };
    close(screenToWorld(cam, worldToScreen(cam, p)), p);
  });

  it('pan shifts screen position but not world coordinates', () => {
    const cam = { tx: 0, ty: 0, zoom: 2 };
    const p = { x: 10, y: 10 };
    const before = worldToScreen(cam, p);
    const after = worldToScreen(panCamera(cam, 30, -10), p);
    expect(after).toEqual({ x: before.x + 30, y: before.y - 10 });
  });

  it('zoom keeps the point under the cursor fixed', () => {
    const cam = { tx: 100, ty: 50, zoom: 1 };
    const cursor = { x: 400, y: 300 };
    const worldUnder = screenToWorld(cam, cursor);
    const zoomed = zoomCameraBy(cam, 2, cursor);
    expect(zoomed.zoom).toBe(2);
    close(worldToScreen(zoomed, worldUnder), cursor);
    const zoomedOut = zoomCameraAt(zoomed, 0.5, cursor);
    close(worldToScreen(zoomedOut, worldUnder), cursor);
  });

  it('clamps zoom', () => {
    const cam = { tx: 0, ty: 0, zoom: 1 };
    expect(zoomCameraBy(cam, 1000, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(zoomCameraBy(cam, 0.00001, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
  });

  it('visible box and fit camera agree', () => {
    const box = { x: 100, y: 100, w: 800, h: 400 };
    const cam = fitCamera(box, 1000, 1000, 0);
    const vis = visibleWorldBox(cam, 1000, 1000);
    expect(vis.x).toBeLessThanOrEqual(box.x + 1e-6);
    expect(vis.y).toBeLessThanOrEqual(box.y + 1e-6);
    expect(vis.x + vis.w).toBeGreaterThanOrEqual(box.x + box.w - 1e-6);
    expect(vis.y + vis.h).toBeGreaterThanOrEqual(box.y + box.h - 1e-6);
    expect(cam.zoom).toBeCloseTo(1.25, 6);
  });
});

describe('rotation maths', () => {
  it('rotates points around a pivot', () => {
    close(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2), { x: 0, y: 1 });
    close(rotatePoint({ x: 2, y: 1 }, { x: 1, y: 1 }, Math.PI), { x: 0, y: 1 });
  });

  it('rotated bounds enclose the rotated box', () => {
    const b = rotatedBounds({ x: 0, y: 0, w: 100, h: 0 }, Math.PI / 2);
    expect(b.x).toBeCloseTo(50);
    expect(b.y).toBeCloseTo(-50);
    expect(b.w).toBeCloseTo(0);
    expect(b.h).toBeCloseTo(100);
  });

  it('normalises angles into [0, 2pi)', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeAngle(Math.PI * 4)).toBeCloseTo(0);
  });

  it('Scene.rotate rotates shapes around a shared pivot', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 10, 10));
    s.add(rect('b', 100, 0, 10, 10));
    s.rotate(['a', 'b'], { x: 55, y: 5 }, Math.PI);
    const a = s.get('a');
    const b = s.get('b');
    if (a?.type !== 'rect' || b?.type !== 'rect') throw new Error();
    expect(a.x).toBeCloseTo(100);
    expect(b.x).toBeCloseTo(0);
    expect(a.rotation).toBeCloseTo(Math.PI);
  });
});

describe('box maths', () => {
  it('normalises negative boxes', () => {
    expect(normalizeBox({ x: 10, y: 10, w: -5, h: -5 })).toEqual({ x: 5, y: 5, w: 5, h: 5 });
    expect(boxFromPoints({ x: 10, y: 0 }, { x: 0, y: 10 })).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it('unions boxes', () => {
    expect(unionBoxes([{ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 }])).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });

  it('distance to segment', () => {
    expect(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
  });

  it('rect edge point from centre towards a target', () => {
    close(rectEdgePoint({ x: 0, y: 0, w: 100, h: 50 }, 0, { x: 500, y: 25 }), { x: 100, y: 25 });
    close(rectEdgePoint({ x: 0, y: 0, w: 100, h: 50 }, 0, { x: 50, y: -100 }), { x: 50, y: 0 });
  });
});

describe('resize maths', () => {
  it('scales pen points with the box', () => {
    const p = pen('p', 0, 0, [{ x: 0, y: 0 }, { x: 100, y: 50 }]);
    const r = resizeBoxed(p, { x: 10, y: 10, w: 50, h: 100 });
    expect(r).toMatchObject({ x: 10, y: 10, w: 50, h: 100 });
    expect(r.points[1]).toEqual({ x: 50, y: 100 });
  });

  it('Scene.setBox and scaleShapes keep relative layout', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 10, 10));
    s.add(rect('b', 90, 90, 10, 10));
    s.scaleShapes(['a', 'b'], { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 200 });
    expect(s.get('a')).toMatchObject({ x: 0, y: 0, w: 20, h: 20 });
    expect(s.get('b')).toMatchObject({ x: 180, y: 180, w: 20, h: 20 });
    s.setBox('a', { x: 1, y: 2, w: 3, h: 4 });
    expect(s.get('a')).toMatchObject({ x: 1, y: 2, w: 3, h: 4 });
  });
});
