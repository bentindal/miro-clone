import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export type Role = 'edit' | 'view';

// Message types shared with the y-websocket client.
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_QUERY_AWARENESS = 3;

// Sub-types inside a sync message (y-protocols/sync).
const SYNC_STEP1 = 0;

/** A connected peer, independent of the WebSocket implementation underneath. */
export interface Peer {
  role: Role;
  /** Awareness client ids this peer controls, cleared when it goes away. */
  clientIds: Set<number>;
  send(message: Uint8Array): void;
}

export interface RoomHooks {
  /** Called for every document update that must be persisted. */
  persist(update: Uint8Array): void;
}

/**
 * The transport-agnostic heart of a board room: a Y.Doc, its awareness, and
 * the y-websocket protocol handling for a set of peers. Updates from viewers
 * are dropped before they reach the document. The Node server and the
 * Cloudflare Worker both wrap this.
 */
export class RoomCore {
  readonly doc = new Y.Doc();
  readonly awareness: awarenessProtocol.Awareness;
  readonly peers = new Set<Peer>();
  private loaded = false;

  constructor(private readonly hooks: RoomHooks) {
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (!this.loaded) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      for (const p of this.peers) if (p !== origin) p.send(message);
      this.hooks.persist(update);
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = [...added, ...updated, ...removed];
      if (origin && typeof origin === 'object' && 'clientIds' in origin) {
        const peer = origin as Peer;
        for (const id of added) peer.clientIds.add(id);
        for (const id of removed) peer.clientIds.delete(id);
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
      const message = encoding.toUint8Array(encoder);
      for (const p of this.peers) p.send(message);
    });
  }

  /** Apply the stored state and update log, then start relaying. */
  load(state: Uint8Array | null, updates: Iterable<Uint8Array>): void {
    Y.transact(
      this.doc,
      () => {
        if (state) Y.applyUpdate(this.doc, state);
        for (const u of updates) Y.applyUpdate(this.doc, u);
      },
      'load',
    );
    this.loaded = true;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /** Register a peer and send it sync step 1 plus the current awareness. */
  addPeer(peer: Peer): void {
    this.peers.add(peer);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    peer.send(encoding.toUint8Array(encoder));
    const states = this.awareness.getStates();
    if (states.size > 0) {
      const aw = encoding.createEncoder();
      encoding.writeVarUint(aw, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(aw, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...states.keys()]));
      peer.send(encoding.toUint8Array(aw));
    }
  }

  removePeer(peer: Peer): void {
    if (!this.peers.delete(peer)) return;
    if (peer.clientIds.size) awarenessProtocol.removeAwarenessStates(this.awareness, [...peer.clientIds], null);
  }

  handleMessage(peer: Peer, data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const encoder = encoding.createEncoder();
    const type = decoding.readVarUint(decoder);
    switch (type) {
      case MESSAGE_SYNC: {
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const subType = decoding.peekVarUint(decoder);
        // Viewers may ask for state but never contribute to it.
        if (peer.role === 'view' && subType !== SYNC_STEP1) return;
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, peer);
        if (encoding.length(encoder) > 1) peer.send(encoding.toUint8Array(encoder));
        break;
      }
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), peer);
        break;
      case MESSAGE_QUERY_AWARENESS: {
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()]));
        peer.send(encoding.toUint8Array(encoder));
        break;
      }
      default:
        break;
    }
  }

  destroy(): void {
    this.awareness.destroy();
    this.doc.destroy();
  }
}

/** Constant-time string comparison for tokens. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
