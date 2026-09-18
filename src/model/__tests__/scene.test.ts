import { describe, expect, it } from 'vitest';
import { Scene } from '../scene';
import { connector, ellipse, frame, group, rect } from './fixtures';

describe('Scene CRUD', () => {
  it('adds, reads, updates and removes shapes', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 10, 10));
    expect(s.size).toBe(1);
    expect(s.get('a')?.type).toBe('rect');
    s.update('a', { x: 5 });
    expect(s.get('a')).toMatchObject({ x: 5, y: 0 });
    expect(s.remove(['a'])).toEqual(['a']);
    expect(s.size).toBe(0);
    expect(s.get('a')).toBeUndefined();
  });

  it('rejects duplicate ids', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 10, 10));
    expect(() => s.add(rect('a', 0, 0, 1, 1))).toThrow(/Duplicate/);
  });

  it('inserts at an index and keeps z-order', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 1, 1));
    s.add(rect('c', 0, 0, 1, 1));
    s.add(rect('b', 0, 0, 1, 1), 1);
    expect(s.ids()).toEqual(['a', 'b', 'c']);
  });

  it('removes descendants with their parent', () => {
    const s = new Scene();
    s.add(group('g'));
    s.add(rect('a', 0, 0, 1, 1, { parentId: 'g' }));
    s.add(rect('b', 0, 0, 1, 1, { parentId: 'g' }));
    s.add(rect('c', 0, 0, 1, 1));
    const removed = s.remove(['g']);
    expect(new Set(removed)).toEqual(new Set(['g', 'a', 'b']));
    expect(s.ids()).toEqual(['c']);
  });

  it('detaches connectors when an endpoint shape is removed', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 10, 10));
    s.add(rect('b', 100, 0, 10, 10));
    s.add(connector('k', 'a', 'b'));
    s.remove(['a']);
    const k = s.get('k');
    expect(k?.type).toBe('connector');
    if (k?.type !== 'connector') return;
    expect(k.start.shapeId).toBeNull();
    expect(k.start.point).toEqual({ x: 10, y: 5 });
    expect(k.end.shapeId).toBe('b');
  });

  it('snapshots and restores independently', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 1, 1));
    const snap = s.snapshot();
    s.add(rect('b', 0, 0, 1, 1));
    s.update('a', { x: 9 });
    expect(s.size).toBe(2);
    s.restore(snap);
    expect(s.size).toBe(1);
    expect(s.get('a')?.type === 'rect' && s.get('a')).toMatchObject({ x: 0 });
  });
});

describe('Scene hierarchy', () => {
  it('finds top group and normalises selections', () => {
    const s = new Scene();
    s.add(group('outer'));
    s.add(group('inner', 'outer'));
    s.add(rect('a', 0, 0, 1, 1, { parentId: 'inner' }));
    s.add(rect('b', 0, 0, 1, 1, { parentId: 'outer' }));
    s.add(rect('c', 0, 0, 1, 1));
    expect(s.topGroup('a')).toBe('outer');
    expect(s.topGroup('b')).toBe('outer');
    expect(s.topGroup('c')).toBe('c');
    expect(s.normalizeSelection(['a', 'b', 'c', 'c'])).toEqual(['outer', 'c']);
    expect(s.leaves('outer').sort()).toEqual(['a', 'b']);
  });

  it('frames are not groups for selection but are found as frameOf', () => {
    const s = new Scene();
    s.add(frame('f', 0, 0, 500, 500));
    s.add(group('g', 'f'));
    s.add(rect('a', 10, 10, 10, 10, { parentId: 'g' }));
    expect(s.topGroup('a')).toBe('g');
    expect(s.frameOf('a')).toBe('f');
    expect(s.frameOf('f')).toBeNull();
  });

  it('prevents cycles', () => {
    const s = new Scene();
    s.add(group('g'));
    s.add(group('h', 'g'));
    expect(() => s.setParent('g', 'h')).toThrow(/Cycle/);
    expect(() => s.setParent('g', 'g')).toThrow();
  });

  it('computes group bounds from leaves', () => {
    const s = new Scene();
    s.add(group('g'));
    s.add(rect('a', 0, 0, 10, 10, { parentId: 'g' }));
    s.add(rect('b', 50, 50, 10, 10, { parentId: 'g' }));
    expect(s.bounds('g')).toEqual({ x: 0, y: 0, w: 60, h: 60 });
  });
});

describe('Scene z-order', () => {
  function make() {
    const s = new Scene();
    for (const id of ['a', 'b', 'c', 'd']) s.add(rect(id, 0, 0, 1, 1));
    return s;
  }

  it('bringToFront / sendToBack', () => {
    const s = make();
    s.bringToFront(['b']);
    expect(s.ids()).toEqual(['a', 'c', 'd', 'b']);
    s.sendToBack(['d']);
    expect(s.ids()).toEqual(['d', 'a', 'c', 'b']);
  });

  it('bringForward / sendBackward move one step', () => {
    const s = make();
    s.bringForward(['a']);
    expect(s.ids()).toEqual(['b', 'a', 'c', 'd']);
    s.sendBackward(['d']);
    expect(s.ids()).toEqual(['b', 'a', 'd', 'c']);
    s.bringForward(['c']);
    expect(s.ids()).toEqual(['b', 'a', 'd', 'c']);
  });

  it('keeps group members contiguous when a group moves', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 1, 1));
    s.add(group('g'));
    s.add(rect('b', 0, 0, 1, 1, { parentId: 'g' }));
    s.add(rect('c', 0, 0, 1, 1, { parentId: 'g' }));
    s.add(rect('d', 0, 0, 1, 1));
    s.bringToFront(['g']);
    expect(s.ids()).toEqual(['a', 'd', 'g', 'b', 'c']);
    s.sendToBack(['g']);
    expect(s.ids()).toEqual(['g', 'b', 'c', 'a', 'd']);
  });
});

describe('Connectors', () => {
  it('resolves attached endpoints to shape edges', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 100));
    s.add(rect('b', 300, 0, 100, 100));
    s.add(connector('k', 'a', 'b'));
    const k = s.get('k');
    if (k?.type !== 'connector') throw new Error();
    const { a, b } = s.connectorPoints(k);
    expect(a).toEqual({ x: 100, y: 50 });
    expect(b).toEqual({ x: 300, y: 50 });
  });

  it('follows shapes when they move', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 100));
    s.add(ellipse('b', 300, 0, 100, 100));
    s.add(connector('k', 'a', 'b'));
    s.translate(['b'], 0, 300);
    const k = s.get('k');
    if (k?.type !== 'connector') throw new Error();
    const { a, b } = s.connectorPoints(k);
    // a leaves the rect on its bottom-right region, b enters the ellipse on its edge
    expect(a.x).toBeGreaterThan(50);
    expect(a.y).toBe(100);
    const bc = { x: 350, y: 350 };
    const d = Math.hypot(b.x - bc.x, b.y - bc.y);
    expect(d).toBeCloseTo(50, 5);
  });

  it('free endpoints translate with the connector', () => {
    const s = new Scene();
    s.add(connector('k', null, null, { x: 0, y: 0 }, { x: 10, y: 10 }));
    s.translate(['k'], 5, 5);
    const k = s.get('k');
    if (k?.type !== 'connector') throw new Error();
    expect(k.start.point).toEqual({ x: 5, y: 5 });
    expect(k.end.point).toEqual({ x: 15, y: 15 });
    expect(s.bounds('k')).toEqual({ x: 5, y: 5, w: 10, h: 10 });
  });
});
