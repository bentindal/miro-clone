import { describe, expect, it } from 'vitest';
import { Scene } from '../scene';
import { nextSlideKey, reorderSlides, slideIndex, slideOf, slides } from '../slides';
import { frame, rect } from './fixtures';

/** A scene of frames added the way the editor adds them: below everything else. */
function deck(...keys: string[]): Scene {
  const s = new Scene();
  keys.forEach((slide, i) => s.add(frame(`f${i}`, i * 500, 0, 400, 300, { slide }), 0));
  return s;
}

/** Apply what `reorderSlides` asked for, as the editor does. */
function applyMove(s: Scene, id: string, to: number): string[] {
  for (const [frameId, slide] of reorderSlides(s, id, to)) s.update(frameId, { slide });
  return slides(s).map((f) => f.id);
}

describe('slide order', () => {
  it('is the slide keys, not the z-order', () => {
    const s = deck('a1', 'a2', 'a3');
    // Frames go to the bottom of the z-order as they are created, so the two
    // orders are opposites here. The slide keys win.
    expect(s.ids()).toEqual(['f2', 'f1', 'f0']);
    expect(slides(s).map((f) => f.id)).toEqual(['f0', 'f1', 'f2']);
  });

  it('puts frames written before slide keys existed first, in creation order', () => {
    const s = deck('', '', 'a5');
    expect(slides(s).map((f) => f.id)).toEqual(['f0', 'f1', 'f2']);
    expect(slideIndex(s, 'f1')).toBe(1);
    expect(slideIndex(s, 'nothing')).toBe(-1);
  });

  it('gives a new frame a key that lands it last', () => {
    const s = deck('a1', 'a2');
    const key = nextSlideKey(s);
    s.add(frame('new', 0, 0, 400, 300, { slide: key }), 0);
    expect(slides(s).map((f) => f.id)).toEqual(['f0', 'f1', 'new']);
  });

  it('gives the first frame on a board a key, and one after unkeyed frames', () => {
    expect(nextSlideKey(new Scene())).toBe('a0');
    const legacy = deck('', '');
    const key = nextSlideKey(legacy);
    legacy.add(frame('new', 0, 0, 400, 300, { slide: key }), 0);
    expect(slides(legacy).map((f) => f.id)).toEqual(['f0', 'f1', 'new']);
  });

  it('moves a slide to any position', () => {
    expect(applyMove(deck('a1', 'a2', 'a3', 'a4'), 'f3', 0)).toEqual(['f3', 'f0', 'f1', 'f2']);
    expect(applyMove(deck('a1', 'a2', 'a3', 'a4'), 'f0', 3)).toEqual(['f1', 'f2', 'f3', 'f0']);
    expect(applyMove(deck('a1', 'a2', 'a3', 'a4'), 'f1', 2)).toEqual(['f0', 'f2', 'f1', 'f3']);
  });

  it('clamps a move past either end and does nothing when nothing changes', () => {
    expect(applyMove(deck('a1', 'a2', 'a3'), 'f1', 99)).toEqual(['f0', 'f2', 'f1']);
    expect(applyMove(deck('a1', 'a2', 'a3'), 'f1', -5)).toEqual(['f1', 'f0', 'f2']);
    const s = deck('a1', 'a2', 'a3');
    expect(reorderSlides(s, 'f1', 1).size).toBe(0);
    expect(reorderSlides(s, 'not-a-frame', 0).size).toBe(0);
  });

  it('writes one key per move once the deck is keyed', () => {
    const s = deck('a1', 'a2', 'a3');
    expect([...reorderSlides(s, 'f2', 0).keys()]).toEqual(['f2']);
  });

  it('gives every frame a key the first time an unkeyed deck is reordered', () => {
    const s = deck('', '', '');
    const writes = reorderSlides(s, 'f2', 0);
    expect(writes.size).toBe(3);
    for (const [id, slide] of writes) s.update(id, { slide });
    expect(slides(s).map((f) => f.id)).toEqual(['f2', 'f0', 'f1']);
    // And from then on a move is one write again.
    expect([...reorderSlides(s, 'f0', 2).keys()]).toEqual(['f0']);
  });

  it('keeps a partly keyed deck in the order it already presented in', () => {
    const s = deck('', 'a2', '');
    expect(slides(s).map((f) => f.id)).toEqual(['f0', 'f2', 'f1']);
    const writes = reorderSlides(s, 'f1', 0);
    for (const [id, slide] of writes) s.update(id, { slide });
    expect(slides(s).map((f) => f.id)).toEqual(['f1', 'f0', 'f2']);
  });

  it('survives many moves without keys colliding', () => {
    const s = deck('a1', 'a2', 'a3', 'a4', 'a5');
    for (let i = 0; i < 40; i++) applyMove(s, `f${i % 5}`, (i * 3) % 5);
    const keys = slides(s).map((f) => f.slide);
    expect(new Set(keys).size).toBe(5);
    expect([...keys].sort()).toEqual(keys);
  });

  it('finds the slide a shape sits on', () => {
    const s = deck('a1');
    s.add(rect('r', 10, 10, 20, 20, { parentId: 'f0' }));
    s.add(rect('loose', 900, 900, 20, 20));
    expect(slideOf(s, 'r')?.id).toBe('f0');
    expect(slideOf(s, 'f0')?.id).toBe('f0');
    expect(slideOf(s, 'loose')).toBeNull();
    expect(slideOf(s, 'gone')).toBeNull();
  });
});
