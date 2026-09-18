import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { WebSocket } from 'ws';
import type { BoardStore, Role } from './store.js';

// Message types shared with the y-websocket client.
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;

// Sub-types inside a sync message (y-protocols/sync).
const SYNC_STEP1 = 0;

export interface Connection {
  socket: WebSocket;
  role: Role;
  /** Awareness client ids this socket controls, cleared when it goes away. */
  clientIds: Set<number>;
}

/** Number of logged updates after which the document is compacted on unload. */
const COMPACT_AFTER = 200;

/**
 * One live board: the Y.Doc, its awareness, the sockets attached to it and
 * persistence to the store. Updates from viewers are dropped before they
 * reach the document.
 */
export class Room {
  readonly doc = new Y.Doc();
  readonly awareness: awarenessProtocol.Awareness;
  readonly connections = new Set<Connection>();
  private persistQueue: Promise<void> = Promise.resolve();
  private loaded = false;

  constructor(
    readonly boardId: string,
    private readonly store: BoardStore,
    private readonly onEmpty: (room: Room) => void,
  ) {
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (!this.loaded) return;
      // Fan out to everyone except the sender, then persist.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      for (const c of this.connections) if (c !== origin) send(c.socket, message);
      this.persistQueue = this.persistQueue.then(() => this.store.appendUpdate(this.boardId, update)).catch((err) => console.error('persist failed', err));
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = [...added, ...updated, ...removed];
      if (origin && typeof origin === 'object' && 'clientIds' in origin) {
        const conn = origin as Connection;
        for (const id of added) conn.clientIds.add(id);
        for (const id of removed) conn.clientIds.delete(id);
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
      const message = encoding.toUint8Array(encoder);
      for (const c of this.connections) send(c.socket, message);
    });
  }

  async load(): Promise<void> {
    const { state, updates } = await this.store.loadDocument(this.boardId);
    Y.transact(
      this.doc,
      () => {
        if (state) Y.applyUpdate(this.doc, state);
        for (const u of updates) Y.applyUpdate(this.doc, u);
      },
      'load',
    );
    this.loaded = true;
    if (updates.length >= COMPACT_AFTER) await this.compact();
  }

  async compact(): Promise<void> {
    await this.persistQueue;
    await this.store.compact(this.boardId, Y.encodeStateAsUpdate(this.doc));
  }

  addConnection(socket: WebSocket, role: Role): Connection {
    const conn: Connection = { socket, role, clientIds: new Set() };
    this.connections.add(conn);
    socket.binaryType = 'arraybuffer';
    socket.on('message', (data: ArrayBuffer | Buffer | Buffer[]) => {
      try {
        this.handleMessage(conn, toUint8(data));
      } catch (err) {
        console.error('bad message', err);
      }
    });
    const close = () => this.removeConnection(conn);
    socket.on('close', close);
    socket.on('error', close);

    // Sync step 1 and current awareness go out immediately.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    send(socket, encoding.toUint8Array(encoder));
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const aw = encoding.createEncoder();
      encoding.writeVarUint(aw, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(aw, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...states.keys()]));
      send(socket, encoding.toUint8Array(aw));
    }
    return conn;
  }

  removeConnection(conn: Connection): void {
    if (!this.connections.delete(conn)) return;
    if (conn.clientIds.size) awarenessProtocol.removeAwarenessStates(this.awareness, [...conn.clientIds], null);
    if (this.connections.size === 0) this.onEmpty(this);
  }

  private handleMessage(conn: Connection, data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const encoder = encoding.createEncoder();
    const type = decoding.readVarUint(decoder);
    switch (type) {
      case MESSAGE_SYNC: {
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const subType = decoding.peekVarUint(decoder);
        if (conn.role === 'view' && subType !== SYNC_STEP1) {
          // Viewers may ask for state but never contribute to it.
          return;
        }
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, conn);
        if (encoding.length(encoder) > 1) send(conn.socket, encoding.toUint8Array(encoder));
        break;
      }
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), conn);
        break;
      case MESSAGE_QUERY_AWARENESS: {
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()]));
        send(conn.socket, encoding.toUint8Array(encoder));
        break;
      }
      default:
        break;
    }
  }

  /** Flush pending persistence, drop everything. */
  async destroy(): Promise<void> {
    await this.persistQueue;
    this.awareness.destroy();
    this.doc.destroy();
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
