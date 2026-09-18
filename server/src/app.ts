import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './room.js';
import type { BoardStore } from './store.js';

export interface AppOptions {
  store: BoardStore;
  /** Origin allowed to call the API from a browser, or '*' during development. */
  corsOrigin?: string;
}

export interface App {
  server: Server;
  rooms: RoomManager;
  close(): Promise<void>;
}

const MAX_BODY = 64 * 1024;

/** HTTP API plus the WebSocket sync endpoint on one port. */
export function createApp({ store, corsOrigin = '*' }: AppOptions): App {
  const rooms = new RoomManager(store);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return end(res, 204);
    try {
      if (url.pathname === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });
      if (url.pathname === '/api/boards' && req.method === 'POST') {
        const body = (await readJson(req)) as { title?: unknown } | null;
        const title = typeof body?.title === 'string' ? body.title.slice(0, 200) : '';
        const board = await store.createBoard(title);
        return json(res, 201, { id: board.id, title: board.title, editToken: board.editToken, viewToken: board.viewToken });
      }
      const boardMatch = url.pathname.match(/^\/api\/boards\/([A-Za-z0-9_-]+)$/);
      if (boardMatch && req.method === 'GET') {
        const board = await store.getBoard(boardMatch[1]);
        if (!board) return json(res, 404, { error: 'Board not found' });
        const role = store.roleFor(board, url.searchParams.get('token'));
        if (!role) return json(res, 403, { error: 'This link is not valid for this board' });
        return json(res, 200, {
          id: board.id,
          title: board.title,
          role,
          // Only editors learn the view token, so a view link cannot be upgraded.
          viewToken: role === 'edit' ? board.viewToken : undefined,
        });
      }
      return json(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error(err);
      return json(res, 500, { error: 'Internal error' });
    }
  });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = url.pathname.match(/^\/ws\/([A-Za-z0-9_-]+)$/);
    if (!match) return reject(socket, 404);
    try {
      const board = await store.getBoard(match[1]);
      const role = board ? store.roleFor(board, url.searchParams.get('token')) : null;
      if (!board || !role) return reject(socket, 403);
      const room = await rooms.get(board.id);
      wss.handleUpgrade(req, socket, head, (ws) => {
        room.addConnection(ws, role);
      });
    } catch (err) {
      console.error(err);
      reject(socket, 500);
    }
  });

  return {
    server,
    rooms,
    async close() {
      await rooms.closeAll();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function reject(socket: import('node:stream').Duplex, status: number): void {
  socket.write(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Not Found'}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function end(res: ServerResponse, status: number): void {
  res.statusCode = status;
  res.end();
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}
