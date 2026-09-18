import { describe, expect, it } from 'vitest';
import { History } from '../history';
import { Scene } from '../scene';
import { rect } from './fixtures';

describe('History', () => {
  it('undoes and redoes in order', () => {
    const h = new History<number>();
    let state = 0;
    h.push(state);
    state = 1;
    h.push(state);
    state = 2;
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
    state = h.undo(state)!;
    expect(state).toBe(1);
    state = h.undo(state)!;
    expect(state).toBe(0);
    expect(h.undo(state)).toBeUndefined();
    state = h.redo(state)!;
    expect(state).toBe(1);
    state = h.redo(state)!;
    expect(state).toBe(2);
    expect(h.redo(state)).toBeUndefined();
  });

  it('clears redo on a new push', () => {
    const h = new History<number>();
    h.push(0);
    let state = 1;
    state = h.undo(state)!;
    expect(h.canRedo).toBe(true);
    h.push(state);
    expect(h.canRedo).toBe(false);
  });

  it('respects the limit', () => {
    const h = new History<number>(3);
    for (let i = 0; i < 10; i++) h.push(i);
    expect(h.undoDepth).toBe(3);
    expect(h.undo(99)).toBe(9);
    expect(h.undo(9)).toBe(8);
    expect(h.undo(8)).toBe(7);
    expect(h.undo(7)).toBeUndefined();
  });

  it('works with scene snapshots', () => {
    const scene = new Scene();
    const h = new History<ReturnType<Scene['snapshot']>>();
    h.push(scene.snapshot());
    scene.add(rect('a', 0, 0, 1, 1));
    h.push(scene.snapshot());
    scene.update('a', { x: 50 });
    const s1 = h.undo(scene.snapshot());
    scene.restore(s1!);
    expect(scene.get('a')).toMatchObject({ x: 0 });
    const s0 = h.undo(scene.snapshot());
    scene.restore(s0!);
    expect(scene.size).toBe(0);
    scene.restore(h.redo(scene.snapshot())!);
    scene.restore(h.redo(scene.snapshot())!);
    expect(scene.get('a')).toMatchObject({ x: 50 });
  });
});
