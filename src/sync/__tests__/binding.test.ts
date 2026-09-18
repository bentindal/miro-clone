import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Editor } from '../../editor/Editor';
import { Scene } from '../../model/scene';
import type { RectShape } from '../../model/types';
import { DocBinding } from '../binding';

function rect(id: string, x = 0, y = 0): RectShape {
  return { type: 'rect', id, parentId: null, x, y, w: 100, h: 50, rotation: 0, fill: '#fff', stroke: '#000', strokeWidth: 2 };
}

/** Two documents kept in sync by relaying updates both ways, like a server would. */
function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'relay') Y.applyUpdate(b, u, 'relay');
  });
  b.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'relay') Y.applyUpdate(a, u, 'relay');
  });
  return { a, b };
}

describe('DocBinding', () => {
  it('pushes local scene changes into the document and back out on a peer', () => {
    const { a, b } = pair();
    const sceneA = new Scene();
    const sceneB = new Scene();
    let remoteCalls = 0;
    const bindA = new DocBinding(a, sceneA, { a: true }, () => undefined);
    new DocBinding(b, sceneB, { b: true }, () => remoteCalls++);
    sceneA.add(rect('r1', 10, 20));
    sceneA.add(rect('r2', 30, 40));
    expect(bindA.pushLocal()).toBe(true);
    expect(bindA.pushLocal()).toBe(false);
    expect(sceneB.all()).toEqual(sceneA.all());
    expect(sceneB.ids()).toEqual(['r1', 'r2']);
    expect(remoteCalls).toBe(1);

    sceneA.update('r1', { x: 99 });
    sceneA.remove(['r2']);
    bindA.pushLocal();
    expect(sceneB.get('r1')).toMatchObject({ x: 99 });
    expect(sceneB.has('r2')).toBe(false);
  });

  it('writes only changed fields so concurrent edits to different fields merge', () => {
    const { a, b } = pair();
    const sceneA = new Scene();
    const sceneB = new Scene();
    const bindA = new DocBinding(a, sceneA, { a: true }, () => undefined);
    const bindB = new DocBinding(b, sceneB, { b: true }, () => undefined);
    sceneA.add(rect('r', 0, 0));
    bindA.pushLocal();
    // Detach the relay so both edit "offline", then reconnect by exchanging state.
    const stateA = Y.encodeStateAsUpdate(a);
    const stateB = Y.encodeStateAsUpdate(b);
    const offA = new Y.Doc();
    const offB = new Y.Doc();
    Y.applyUpdate(offA, stateA);
    Y.applyUpdate(offB, stateB);
    const sA = new Scene();
    const sB = new Scene();
    const oA = new DocBinding(offA, sA, { a: true }, () => undefined);
    const oB = new DocBinding(offB, sB, { b: true }, () => undefined);
    oA.adoptDocument();
    oB.adoptDocument();
    sA.update('r', { x: 500 });
    oA.pushLocal();
    sB.update<RectShape>('r', { fill: '#f00' });
    oB.pushLocal();
    Y.applyUpdate(offA, Y.encodeStateAsUpdate(offB));
    Y.applyUpdate(offB, Y.encodeStateAsUpdate(offA));
    expect(sA.get('r')).toMatchObject({ x: 500, fill: '#f00' });
    expect(sB.get('r')).toMatchObject({ x: 500, fill: '#f00' });
    void bindB;
  });

  it('syncs z-order through per-shape keys and converges after concurrent reorders', () => {
    const { a, b } = pair();
    const sceneA = new Scene();
    const sceneB = new Scene();
    const bindA = new DocBinding(a, sceneA, { a: true }, () => undefined);
    const bindB = new DocBinding(b, sceneB, { b: true }, () => undefined);
    for (const id of ['a', 'b', 'c', 'd']) sceneA.add(rect(id));
    bindA.pushLocal();
    sceneA.bringToFront(['b']);
    bindA.pushLocal();
    expect(sceneB.ids()).toEqual(['a', 'c', 'd', 'b']);
    // Only the moved shape got a new key.
    const keysBefore = new Map([...bindA.shapes].map(([id, m]) => [id, m.get('z')]));
    sceneA.sendToBack(['d']);
    bindA.pushLocal();
    const keysAfter = new Map([...bindA.shapes].map(([id, m]) => [id, m.get('z')]));
    expect([...keysAfter].filter(([id, z]) => keysBefore.get(id) !== z).map(([id]) => id)).toEqual(['d']);
    expect(sceneB.ids()).toEqual(['d', 'a', 'c', 'b']);

    // Two people reorder at the same time while disconnected; after merging both see the same
    // order with every shape exactly once.
    const offA = new Y.Doc();
    const offB = new Y.Doc();
    Y.applyUpdate(offA, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(offB, Y.encodeStateAsUpdate(b));
    const sA = new Scene();
    const sB = new Scene();
    const oA = new DocBinding(offA, sA, { a: true }, () => undefined);
    const oB = new DocBinding(offB, sB, { b: true }, () => undefined);
    oA.adoptDocument();
    oB.adoptDocument();
    sA.bringToFront(['a']);
    oA.pushLocal();
    sB.bringToFront(['c']);
    oB.pushLocal();
    Y.applyUpdate(offA, Y.encodeStateAsUpdate(offB));
    Y.applyUpdate(offB, Y.encodeStateAsUpdate(offA));
    expect(sA.ids()).toEqual(sB.ids());
    expect(new Set(sA.ids()).size).toBe(4);
    expect(sA.ids().slice(-2).sort()).toEqual(['a', 'c']);
    void bindB;
  });

  it('reads boards written before keys existed and migrates them when writable', () => {
    const legacy = new Y.Doc();
    const shapes = legacy.getMap<Y.Map<unknown>>('shapes');
    const order = legacy.getArray<string>('order');
    legacy.transact(() => {
      for (const id of ['x', 'y', 'z']) {
        const m = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(rect(id))) if (k !== 'id') m.set(k, v);
        shapes.set(id, m);
      }
      order.push(['z', 'x', 'y']);
    });
    const viewerScene = new Scene();
    const viewer = new DocBinding(legacy, viewerScene, { v: true }, () => undefined);
    viewer.writable = false;
    viewer.adoptDocument();
    expect(viewerScene.ids()).toEqual(['z', 'x', 'y']);
    expect([...shapes.values()].every((m) => !m.has('z'))).toBe(true);

    const editorScene = new Scene();
    const editor = new DocBinding(legacy, editorScene, { e: true }, () => undefined);
    editor.adoptDocument();
    expect(editorScene.ids()).toEqual(['z', 'x', 'y']);
    expect([...shapes.values()].every((m) => typeof m.get('z') === 'string')).toBe(true);
    // The viewer sees the migration and keeps the same order.
    expect(viewerScene.ids()).toEqual(['z', 'x', 'y']);
  });

  it('adoptDocument loads an existing document or seeds an empty one', () => {
    const doc = new Y.Doc();
    const seed = new Scene();
    seed.add(rect('x', 1, 2));
    const seedBinding = new DocBinding(doc, seed, { s: true }, () => undefined);
    seedBinding.adoptDocument();
    expect(seedBinding.shapes.size).toBe(1);

    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    const scene = new Scene();
    scene.add(rect('stale'));
    const binding = new DocBinding(copy, scene, { c: true }, () => undefined);
    binding.adoptDocument();
    expect(scene.ids()).toEqual(['x']);
    expect(scene.get('x')).toMatchObject({ x: 1, y: 2 });
  });

  it('ignores malformed remote shapes instead of crashing', () => {
    const { a, b } = pair();
    const sceneB = new Scene();
    new DocBinding(b, sceneB, { b: true }, () => undefined);
    const shapes = a.getMap<Y.Map<unknown>>('shapes');
    a.transact(() => {
      const bad = new Y.Map<unknown>();
      bad.set('type', 'rect');
      bad.set('x', 'not a number');
      shapes.set('bad', bad);
    });
    expect(sceneB.size).toBe(0);
  });
});

describe('Editor undo with a shared document', () => {
  function connectedEditors() {
    const { a, b } = pair();
    const ea = new Editor(a);
    const eb = new Editor(b);
    ea.adoptDocument();
    eb.adoptDocument();
    return { ea, eb };
  }

  it('undo only reverts the local user\'s own steps', () => {
    const { ea, eb } = connectedEditors();
    ea.transact(() => ea.scene.add(rect('fromA', 0, 0)));
    eb.transact(() => eb.scene.add(rect('fromB', 200, 0)));
    expect(ea.scene.ids().sort()).toEqual(['fromA', 'fromB']);
    expect(eb.scene.ids().sort()).toEqual(['fromA', 'fromB']);
    expect(eb.canUndo).toBe(true);
    eb.undo();
    expect(eb.scene.ids()).toEqual(['fromA']);
    expect(ea.scene.ids()).toEqual(['fromA']);
    // A's undo removes A's rect, not anything of B's.
    eb.redo();
    ea.undo();
    expect(ea.scene.ids()).toEqual(['fromB']);
    expect(eb.scene.ids()).toEqual(['fromB']);
    expect(ea.canUndo).toBe(false);
  });

  it('each transact is one undo step even when it touches many shapes', () => {
    const { ea } = connectedEditors();
    ea.transact(() => {
      for (let i = 0; i < 5; i++) ea.scene.add(rect(`r${i}`, i * 10, 0));
    });
    ea.transact(() => ea.scene.translate(['r0', 'r1'], 5, 5));
    expect(ea.undoManager.undoStack).toHaveLength(2);
    ea.undo();
    expect(ea.scene.get('r0')).toMatchObject({ x: 0 });
    ea.undo();
    expect(ea.scene.size).toBe(0);
    ea.redo();
    ea.redo();
    expect(ea.scene.get('r1')).toMatchObject({ x: 15, y: 5 });
  });

  it('read-only editors cannot change the document', () => {
    const { ea, eb } = connectedEditors();
    eb.setReadOnly(true);
    ea.transact(() => ea.scene.add(rect('r')));
    eb.select(['r']);
    eb.deleteSelection();
    eb.setStyle({ fill: '#f00' });
    expect(eb.scene.get('r')).toMatchObject({ fill: '#fff' });
    expect(ea.scene.has('r')).toBe(true);
    expect(eb.canUndo).toBe(false);
  });

  it('title lives in the document and undoes like any other change', () => {
    const { ea, eb } = connectedEditors();
    ea.setTitle('Sprint 1');
    expect(eb.title).toBe('Sprint 1');
    ea.undo();
    expect(eb.title).toBe('');
  });
});
