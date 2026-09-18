import type { WebSocket } from 'ws';
import { type Peer, RoomCore, type Role } from './protocol.js';
import type { BoardStore } from './store.js';

/** Number of logged updates after which the document is compacted on unload. */
const COMPACT_AFTER = 200;

interface Connection extends Peer {
  socket: WebSocket;
}

/**
 * One live board on the Node server: a RoomCore wired to `ws` sockets and
 * persisted through the BoardStore.
 */
export class Room {
  readonly core: RoomCore;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(
    readonly boardId: string,
    private readonly store: BoardStore,
    private readonly onEmpty: (room: Room) => void,
  ) {
    this.core = new RoomCore({
      persist: (update) => {
        this.persistQueue = this.persistQueue.then(() => this.store.appendUpdate(this.boardId, update)).catch((err) => console.error('persist failed', err));
      },
    });
  }

  get doc() {
    return this.core.doc;
  }

  get awareness() {
    return this.core.awareness;
  }

  get connections(): Set<Connection> {
    return this.core.peers as Set<Connection>;
  }

  async load(): Promise<void> {
    const { state, updates } = await this.store.loadDocument(this.boardId);
    this.core.load(state, updates);
    if (updates.length >= COMPACT_AFTER) await this.compact();
  }

  async compact(): Promise<void> {
    await this.persistQueue;
    await this.store.compact(this.boardId, this.core.encodeState());
  }

  addConnection(socket: WebSocket, role: Role): Connection {
    const conn: Connection = {
      socket,
      role,
      clientIds: new Set(),
      send: (message) => send(socket, message),
    };
    socket.binaryType = 'arraybuffer';
    socket.on('message', (data: ArrayBuffer | Buffer | Buffer[]) => {
      try {
        this.core.handleMessage(conn, toUint8(data));
      } catch (err) {
        console.error('bad message', err);
      }
    });
    const close = () => this.removeConnection(conn);
    socket.on('close', close);
    socket.on('error', close);
    this.core.addPeer(conn);
    return conn;
  }

  removeConnection(conn: Connection): void {
    if (!this.core.peers.has(conn)) return;
    this.core.removePeer(conn);
    if (this.core.peers.size === 0) this.onEmpty(this);
  }

  /** Flush pending persistence, drop everything. */
  async destroy(): Promise<void> {
    await this.persistQueue;
    this.core.destroy();
  }
}

/** Lazily loads rooms and unloads them when their last socket leaves. */
export class RoomManager {
  private rooms = new Map<string, Promise<Room>>();

  constructor(private readonly store: BoardStore) {}

  get(boardId: string): Promise<Room> {
    let room = this.rooms.get(boardId);
    if (!room) {
      const created = new Room(boardId, this.store, (r) => void this.unload(r));
      room = created.load().then(() => created);
      room.catch(() => this.rooms.delete(boardId));
      this.rooms.set(boardId, room);
    }
    return room;
  }

  get size(): number {
    return this.rooms.size;
  }

  private async unload(room: Room): Promise<void> {
    const current = this.rooms.get(room.boardId);
    if (!current) return;
    this.rooms.delete(room.boardId);
    try {
      await room.compact();
    } catch (err) {
      console.error('compact failed', err);
    }
    await room.destroy();
  }

  async closeAll(): Promise<void> {
    const rooms = await Promise.all([...this.rooms.values()]);
    this.rooms.clear();
    for (const room of rooms) {
      for (const c of [...room.connections]) {
        room.connections.delete(c);
        c.socket.close();
      }
      await room.compact();
      await room.destroy();
    }
  }
}

function send(socket: WebSocket, message: Uint8Array): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(message, (err) => {
    if (err) socket.close();
  });
}

function toUint8(data: ArrayBuffer | Buffer | Buffer[]): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
