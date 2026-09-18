import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { openDatabase } from './db.js';
import { BoardStore } from './store.js';

let store: BoardStore;
let close: () => Promise<void>;

beforeAll(async () => {
  const opened = await openDatabase(undefined);
  close = opened.close;
  store = new BoardStore(opened.db);
  await store.migrate();
  await store.migrate(); // idempotent
});

afterAll(async () => {
  await close();
});

describe('BoardStore', () => {
  it('creates boards with distinct unguessable tokens and resolves roles', async () => {
    const board = await store.createBoard('Plan');
    expect(board.id).toMatch(/^[a-f0-9]{20}$/);
    expect(board.editToken).not.toBe(board.viewToken);
    expect(board.editToken.length).toBeGreaterThanOrEqual(24);
    expect(store.roleFor(board, board.editToken)).toBe('edit');
    expect(store.roleFor(board, board.viewToken)).toBe('view');
    expect(store.roleFor(board, 'nope')).toBeNull();
    expect(store.roleFor(board, null)).toBeNull();
    const fetched = await store.getBoard(board.id);
    expect(fetched).toMatchObject({ id: board.id, title: 'Plan', editToken: board.editToken });
    expect(await store.getBoard('missing')).toBeNull();
  });

  it('round-trips a document through the update log and compaction', async () => {
    const board = await store.createBoard();
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));
    doc.getMap('shapes').set('a', 1);
    doc.getMap('shapes').set('b', 2);
    for (const u of updates) await store.appendUpdate(board.id, u);
    expect(await store.countUpdates(board.id)).toBe(2);

    let loaded = await store.loadDocument(board.id);
    expect(loaded.state).toBeNull();
    expect(loaded.updates).toHaveLength(2);
    const replay = new Y.Doc();
    for (const u of loaded.updates) Y.applyUpdate(replay, u);
    expect(replay.getMap('shapes').toJSON()).toEqual({ a: 1, b: 2 });

    await store.compact(board.id, Y.encodeStateAsUpdate(replay));
    expect(await store.countUpdates(board.id)).toBe(0);
    loaded = await store.loadDocument(board.id);
    expect(loaded.state).not.toBeNull();
    const fromState = new Y.Doc();
    Y.applyUpdate(fromState, loaded.state!);
    expect(fromState.getMap('shapes').toJSON()).toEqual({ a: 1, b: 2 });

    // Updates after compaction layer on top of the state.
    doc.getMap('shapes').set('c', 3);
    await store.appendUpdate(board.id, updates[updates.length - 1]);
    loaded = await store.loadDocument(board.id);
    const merged = new Y.Doc();
    Y.applyUpdate(merged, loaded.state!);
    for (const u of loaded.updates) Y.applyUpdate(merged, u);
    expect(merged.getMap('shapes').toJSON()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('rejects loading an unknown board', async () => {
    await expect(store.loadDocument('nope')).rejects.toThrow(/Unknown board/);
  });
});
