import { DurableObject } from 'cloudflare:workers';
import { type Peer, RoomCore, type Role, safeEqual } from '../../server/src/protocol.ts';

export interface Env {
  BOARD_ROOM: DurableObjectNamespace<BoardRoom>;
  CORS_ORIGIN?: string;
}

interface BoardMeta {
  title: string;
  editToken: string;
  viewToken: string;
  createdAt: string;
}

/** Number of logged updates after which the log is folded into the state blob. */
const COMPACT_AFTER = 200;

// ---- Worker: routing, CORS, board creation ----------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(env.CORS_ORIGIN ?? '*');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/healthz') return json({ ok: true }, 200, cors);

    if (url.pathname === '/api/boards' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
      const title = typeof body?.title === 'string' ? body.title.slice(0, 200) : '';
      const id = newBoardId();
      const meta: BoardMeta = { title, editToken: newToken(), viewToken: newToken(), createdAt: new Date().toISOString() };
      const stub = env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(id));
      await stub.init(meta);
      return json({ id, title, editToken: meta.editToken, viewToken: meta.viewToken }, 201, cors);
    }

    const boardMatch = url.pathname.match(/^\/api\/boards\/([A-Za-z0-9_-]+)$/);
    if (boardMatch && request.method === 'GET') {
      const stub = env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(boardMatch[1]));
      const info = await stub.describe(url.searchParams.get('token'));
      if (info === 'missing') return json({ error: 'Board not found' }, 404, cors);
      if (info === 'forbidden') return json({ error: 'This link is not valid for this board' }, 403, cors);
      return json({ id: boardMatch[1], ...info }, 200, cors);
    }

    const wsMatch = url.pathname.match(/^\/ws\/([A-Za-z0-9_-]+)$/);
    if (wsMatch) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Expected a WebSocket' }, 426, cors);
      const stub = env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(wsMatch[1]));
      return stub.fetch(request);
    }

    return json({ error: 'Not found' }, 404, cors);
  },
} satisfies ExportedHandler<Env>;

// ---- Durable Object: one board ---------------------------------------------

interface Attachment {
  role: Role;
  clientIds: number[];
}

/**
 * One board: metadata, the Yjs document persisted in the object's own SQLite
 * database, and the live WebSockets. Sockets use the hibernation API, so an
 * idle board costs nothing; on wake the document is reloaded from storage and
 * peers are rebuilt from the surviving sockets.
 */
export class BoardRoom extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private peers = new Map<WebSocket, Peer>();
  private updateCount = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL);
    `);
  }

  // ---- RPC used by the Worker ----

  async init(meta: BoardMeta): Promise<void> {
    if (this.meta()) throw new Error('Board already exists');
    this.ctx.storage.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?)', 'board', JSON.stringify(meta));
  }

  async describe(token: string | null): Promise<'missing' | 'forbidden' | { title: string; role: Role; viewToken?: string }> {
    const meta = this.meta();
    if (!meta) return 'missing';
    const role = roleFor(meta, token);
    if (!role) return 'forbidden';
    return { title: meta.title, role, viewToken: role === 'edit' ? meta.viewToken : undefined };
  }

  // ---- WebSocket lifecycle ----

  async fetch(request: Request): Promise<Response> {
    const meta = this.meta();
    const role = meta ? roleFor(meta, new URL(request.url).searchParams.get('token')) : null;
    if (!meta || !role) return new Response('Forbidden', { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.serializeAttachment({ role, clientIds: [] } satisfies Attachment);
    this.ctx.acceptWebSocket(server);
    this.room().addPeer(this.peerFor(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message === 'string') return;
    try {
      this.room().handleMessage(this.peerFor(ws), new Uint8Array(message));
    } catch (err) {
      console.error('bad message', err);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  // ---- internals ----

  private meta(): BoardMeta | null {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'board').toArray()[0];
    return row ? (JSON.parse(row.value) as BoardMeta) : null;
  }

  /** The in-memory room, rebuilt from storage after a cold start or hibernation. */
  private room(): RoomCore {
    if (this.core) return this.core;
    const core = new RoomCore({
      persist: (update) => {
        this.ctx.storage.sql.exec('INSERT INTO updates (data) VALUES (?)', update);
        this.updateCount++;
        if (this.updateCount >= COMPACT_AFTER) this.compact(core);
      },
    });
    const stateRow = this.ctx.storage.sql.exec<{ data: ArrayBuffer }>('SELECT data FROM state WHERE id = 1').toArray()[0];
    const updates = this.ctx.storage.sql.exec<{ data: ArrayBuffer }>('SELECT data FROM updates ORDER BY id').toArray();
    core.load(stateRow ? new Uint8Array(stateRow.data) : null, updates.map((u) => new Uint8Array(u.data)));
    this.updateCount = updates.length;
    if (this.updateCount >= COMPACT_AFTER) this.compact(core);
    this.core = core;
    // Sockets that survived hibernation are re-registered silently (they are already synced).
    for (const ws of this.ctx.getWebSockets()) if (!this.peers.has(ws)) core.peers.add(this.peerFor(ws));
    return core;
  }

  private compact(core: RoomCore): void {
    const state = core.encodeState();
    this.ctx.storage.sql.exec('INSERT INTO state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', state);
    this.ctx.storage.sql.exec('DELETE FROM updates');
    this.updateCount = 0;
  }

  private peerFor(ws: WebSocket): Peer {
    let peer = this.peers.get(ws);
    if (peer) return peer;
    const attachment = (ws.deserializeAttachment() as Attachment | null) ?? { role: 'view' as Role, clientIds: [] };
    const clientIds = new Set(attachment.clientIds);
    peer = {
      role: attachment.role,
      clientIds: new IdSet(clientIds, () => ws.serializeAttachment({ role: attachment.role, clientIds: [...clientIds] } satisfies Attachment)),
      send: (message) => {
        try {
          ws.send(message);
        } catch {
          this.drop(ws);
        }
      },
    };
    this.peers.set(ws, peer);
    return peer;
  }

  private drop(ws: WebSocket): void {
    const peer = this.peers.get(ws);
    this.peers.delete(ws);
    if (peer) this.room().removePeer(peer);
    try {
      ws.close(1000, 'bye');
    } catch {
      // Already closed.
    }
  }
}

/** A Set that mirrors its contents into the socket attachment so they survive hibernation. */
class IdSet extends Set<number> {
  constructor(
    initial: Iterable<number>,
    private readonly onChange: () => void,
  ) {
    super(initial);
  }

  override add(value: number): this {
    if (!super.has(value)) {
      super.add(value);
      this.onChange();
    }
    return this;
  }

  override delete(value: number): boolean {
    const had = super.delete(value);
    if (had) this.onChange();
    return had;
  }
}

function roleFor(meta: BoardMeta, token: string | null): Role | null {
  if (!token) return null;
  if (safeEqual(token, meta.editToken)) return 'edit';
  if (safeEqual(token, meta.viewToken)) return 'view';
  return null;
}

function newBoardId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

function newToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
