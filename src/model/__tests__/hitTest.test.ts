import { describe, expect, it } from 'vitest';
import { Scene } from '../scene';
import { hitTest, selectableAt, selectablesInBox } from '../hitTest';
import { connector, ellipse, frame, group, line, pen, rect, sticky } from './fixtures';

describe('hitTest', () => {
  it('hits rectangles and respects z-order', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 100));
    s.add(rect('b', 50, 50, 100, 100));
    expect(hitTest(s, { x: 10, y: 10 })?.id).toBe('a');
    expect(hitTest(s, { x: 75, y: 75 })?.id).toBe('b');
    expect(hitTest(s, { x: 500, y: 500 })).toBeNull();
  });

  it('hits rotated rectangles in their rotated footprint', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 200, 20, { rotation: Math.PI / 2 }));
    // Rotated 90deg around (100,10): occupies x in [90,110], y in [-90,110]
    expect(hitTest(s, { x: 100, y: -80 })?.id).toBe('a');
    expect(hitTest(s, { x: 10, y: 10 })).toBeNull();
  });

  it('hits ellipses only inside the ellipse', () => {
    const s = new Scene();
    s.add(ellipse('e', 0, 0, 100, 100));
    expect(hitTest(s, { x: 50, y: 50 })?.id).toBe('e');
    expect(hitTest(s, { x: 3, y: 3 }, 0)).toBeNull();
  });

  it('hits lines and pen strokes near the stroke', () => {
    const s = new Scene();
    s.add(line('l', 0, 0, 100, 100));
    s.add(pen('p', 200, 200, [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }]));
    expect(hitTest(s, { x: 50, y: 52 })?.id).toBe('l');
    expect(hitTest(s, { x: 50, y: 70 })).toBeNull();
    expect(hitTest(s, { x: 225, y: 201 })?.id).toBe('p');
    expect(hitTest(s, { x: 225, y: 225 })).toBeNull();
  });

  it('hits connectors along their resolved segment', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 100, 100));
    s.add(rect('b', 300, 0, 100, 100));
    s.add(connector('k', 'a', 'b'));
    expect(hitTest(s, { x: 200, y: 50 })?.id).toBe('k');
    expect(hitTest(s, { x: 200, y: 80 })).toBeNull();
  });

  it('hits frames on their border and title, not their interior', () => {
    const s = new Scene();
    s.add(frame('f', 0, 0, 400, 400));
    expect(hitTest(s, { x: 200, y: 200 })).toBeNull();
    expect(hitTest(s, { x: 200, y: 0 })?.id).toBe('f');
    expect(hitTest(s, { x: 200, y: -10 })?.id).toBe('f');
  });

  it('selectableAt returns the top group', () => {
    const s = new Scene();
    s.add(group('g'));
    s.add(sticky('a', 0, 0, 'hi'));
    s.setParent('a', 'g');
    expect(selectableAt(s, { x: 10, y: 10 })).toBe('g');
  });

  it('selectablesInBox returns fully contained items only', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 10, 10));
    s.add(rect('b', 100, 100, 10, 10));
    s.add(rect('c', 45, 45, 20, 20));
    expect(selectablesInBox(s, { x: -5, y: -5, w: 60, h: 60 })).toEqual(['a']);
    expect(selectablesInBox(s, { x: -5, y: -5, w: 200, h: 200 }).sort()).toEqual(['a', 'b', 'c']);
  });
});
