import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import { type App, createApp } from './app.js';
import { openDatabase } from './db.js';
import { BoardStore } from './store.js';

let app: App;
let store: BoardStore;
let baseUrl: string;
let wsUrl: string;
let closeDb: () => Promise<void>;

beforeAll(async () => {
  const opened = await openDatabase(undefined);
  closeDb = opened.close;
  store = new BoardStore(opened.db);
  await store.migrate();
  app = createApp({ store });
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

async function createBoard(): Promise<{ id: string; editToken: string; viewToken: string }> {
  const res = await fetch(`${baseUrl}/api/boards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'T' }) });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; editToken: string; viewToken: string };
}

function connect(boardId: string, token: string): { doc: Y.Doc; provider: WebsocketProvider; synced: Promise<void> } {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(wsUrl, boardId, doc, { params: { token }, WebSocketPolyfill: WebSocket as never, disableBc: true });
  const synced = new Promise<void>((resolve) => provider.once('sync', () => resolve()));
  return { doc, provider, synced };
}

function until(check: () => boolean, ms = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - start > ms) return reject(new Error('timed out waiting'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('HTTP API', () => {
  it('creates boards and resolves links to roles', async () => {
    const board = await createBoard();
    const asEditor = await (await fetch(`${baseUrl}/api/boards/${board.id}?token=${board.editToken}`)).json();
    expect(asEditor).toMatchObject({ id: board.id, title: 'T', role: 'edit', viewToken: board.viewToken });
    const asViewer = await (await fetch(`${baseUrl}/api/boards/${board.id}?token=${board.viewToken}`)).json();
    expect(asViewer).toMatchObject({ id: board.id, role: 'view' });
    expect((asViewer as { viewToken?: string }).viewToken).toBeUndefined();
    expect((await fetch(`${baseUrl}/api/boards/${board.id}?token=wrong`)).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/boards/${board.id}`)).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/boards/doesnotexist?token=x`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(200);
  });
});

describe('sync rooms', () => {
  it('relays edits between two editors and persists them for a later visitor', async () => {
    const board = await createBoard();
    const a = connect(board.id, board.editToken);
    const b = connect(board.id, board.editToken);
    await Promise.all([a.synced, b.synced]);
    a.doc.getMap('shapes').set('r1', { x: 1 });
    await until(() => b.doc.getMap('shapes').has('r1'));
    b.doc.getMap('shapes').set('r2', { x: 2 });
    await until(() => a.doc.getMap('shapes').has('r2'));

    a.provider.destroy();
    b.provider.destroy();
    await until(() => app.rooms.size === 0);
    // The room unloaded and compacted; a fresh client gets the full state from the store.
    expect(await store.countUpdates(board.id)).toBe(0);
    const c = connect(board.id, board.editToken);
    await c.synced;
    expect(c.doc.getMap('shapes').toJSON()).toEqual({ r1: { x: 1 }, r2: { x: 2 } });
    c.provider.destroy();
  });

  it('drops document updates from view-only links but still shares their presence', async () => {
    const board = await createBoard();
    const editor = connect(board.id, board.editToken);
    const viewer = connect(board.id, board.viewToken);
    await Promise.all([editor.synced, viewer.synced]);
    editor.doc.getMap('shapes').set('from-editor', 1);
    await until(() => viewer.doc.getMap('shapes').has('from-editor'));

    viewer.doc.getMap('shapes').set('from-viewer', 1);
    viewer.provider.awareness.setLocalStateField('user', { name: 'Viewer' });
    await until(() => [...editor.provider.awareness.getStates().values()].some((s) => (s as { user?: { name: string } }).user?.name === 'Viewer'));
    // Presence arrived; the write never did.
    expect(editor.doc.getMap('shapes').has('from-viewer')).toBe(false);
    // Another editor joining later sees the editor's data only.
    const late = connect(board.id, board.editToken);
    await late.synced;
    expect(late.doc.getMap('shapes').toJSON()).toEqual({ 'from-editor': 1 });
    editor.provider.destroy();
    viewer.provider.destroy();
    late.provider.destroy();
    await until(() => app.rooms.size === 0);
  });

  it('refuses sockets with a bad token or unknown board', async () => {
    const board = await createBoard();
    const attempt = (path: string) =>
      new Promise<number>((resolve) => {
        const ws = new WebSocket(`${wsUrl.replace('/ws', '')}${path}`);
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
        ws.on('open', () => resolve(101));
        ws.on('error', () => undefined);
      });
    expect(await attempt(`/ws/${board.id}?token=bad`)).toBe(403);
    expect(await attempt(`/ws/nope?token=x`)).toBe(403);
    expect(await attempt(`/nope`)).toBe(404);
  });
});
