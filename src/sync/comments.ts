import * as Y from 'yjs';
import { newId } from '../model/types';

export interface CommentMessage {
  id: string;
  author: string;
  color: string;
  text: string;
  at: number;
}

export interface CommentThread {
  id: string;
  /** Anchored shape, or null for a free-floating comment at (x, y). */
  shapeId: string | null;
  x: number;
  y: number;
  resolved: boolean;
  createdAt: number;
  messages: CommentMessage[];
}

/**
 * Comment threads stored in the shared document under `comments`, one nested
 * map per thread with a Y.Array of messages so concurrent replies never
 * clobber each other. Kept outside the undo manager's scope on purpose.
 */
export class CommentStore {
  private readonly threads: Y.Map<Y.Map<unknown>>;
  private listeners = new Set<() => void>();

  constructor(
    readonly doc: Y.Doc,
    private readonly origin: object,
  ) {
    this.threads = doc.getMap('comments');
    this.threads.observeDeep(() => {
      for (const fn of this.listeners) fn();
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(): CommentThread[] {
    const out: CommentThread[] = [];
    for (const [id, ymap] of this.threads) {
      const t = this.read(id, ymap);
      if (t) out.push(t);
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): CommentThread | null {
    const ymap = this.threads.get(id);
    return ymap ? this.read(id, ymap) : null;
  }

  get openCount(): number {
    return this.list().filter((t) => !t.resolved).length;
  }

  create(anchor: { shapeId: string | null; x: number; y: number }, first: Omit<CommentMessage, 'id' | 'at'>): string {
    const id = newId('thread');
    this.doc.transact(() => {
      const ymap = new Y.Map<unknown>();
      ymap.set('shapeId', anchor.shapeId);
      ymap.set('x', anchor.x);
      ymap.set('y', anchor.y);
      ymap.set('resolved', false);
      ymap.set('createdAt', Date.now());
      const messages = new Y.Array<CommentMessage>();
      messages.push([{ ...first, id: newId('msg'), at: Date.now() }]);
      ymap.set('messages', messages);
      this.threads.set(id, ymap);
    }, this.origin);
    return id;
  }

  reply(threadId: string, message: Omit<CommentMessage, 'id' | 'at'>): void {
    const ymap = this.threads.get(threadId);
    if (!ymap) return;
    this.doc.transact(() => {
      const messages = ymap.get('messages') as Y.Array<CommentMessage> | undefined;
      messages?.push([{ ...message, id: newId('msg'), at: Date.now() }]);
    }, this.origin);
  }

  setResolved(threadId: string, resolved: boolean): void {
    const ymap = this.threads.get(threadId);
    if (!ymap) return;
    this.doc.transact(() => ymap.set('resolved', resolved), this.origin);
  }

  remove(threadId: string): void {
    this.doc.transact(() => this.threads.delete(threadId), this.origin);
  }

  private read(id: string, ymap: Y.Map<unknown>): CommentThread | null {
    const messages = ymap.get('messages');
    const x = ymap.get('x');
    const y = ymap.get('y');
    if (!(messages instanceof Y.Array) || typeof x !== 'number' || typeof y !== 'number') return null;
    const shapeId = ymap.get('shapeId');
    return {
      id,
      shapeId: typeof shapeId === 'string' ? shapeId : null,
      x,
      y,
      resolved: ymap.get('resolved') === true,
      createdAt: typeof ymap.get('createdAt') === 'number' ? (ymap.get('createdAt') as number) : 0,
      messages: messages.toArray().filter((m): m is CommentMessage => typeof m === 'object' && m !== null && typeof (m as CommentMessage).text === 'string'),
    };
  }
}
