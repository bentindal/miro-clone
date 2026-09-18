import * as Y from 'yjs';
import { Scene, type SceneSnapshot } from '../model/scene';
import { validateShape } from '../model/serialize';
import type { Id, Shape } from '../model/types';

/**
 * Keeps a Scene and a Y.Doc in step.
 *
 * Document layout:
 * - `shapes`: Y.Map<Y.Map>, one nested map per shape keyed by id, one entry per field
 * - `order`:  Y.Array<string> of shape ids, bottom to top
 * - `meta`:   Y.Map with `title`
 *
 * Local edits are made to the Scene first (immutable records), then
 * `pushLocal` diffs the scene against the last synced snapshot and writes the
 * difference into the document under `origin`. Transactions from any other
 * origin (remote peers, the undo manager) are applied back onto the Scene.
 */
export class DocBinding {
  readonly shapes: Y.Map<Y.Map<unknown>>;
  readonly order: Y.Array<string>;
  readonly meta: Y.Map<unknown>;
  private lastSynced: SceneSnapshot;
  private lastVersion = -1;
  private pendingShapes = new Set<Id>();
  private pendingOrder = false;
  private pendingMeta = false;
  private applying = false;

  constructor(
    readonly doc: Y.Doc,
    readonly scene: Scene,
    /** Origin tag for local transactions; the undo manager tracks exactly this. */
    readonly origin: object,
    private readonly onRemote: (change: { shapes: boolean; meta: boolean }) => void,
  ) {
    this.shapes = doc.getMap('shapes');
    this.order = doc.getArray('order');
    this.meta = doc.getMap('meta');
    this.lastSynced = scene.snapshot();
    this.shapes.observeDeep((events, txn) => {
      if (txn.origin === this.origin) return;
      for (const e of events) {
        if (e.target === this.shapes) for (const key of e.changes.keys.keys()) this.pendingShapes.add(key);
        else if (typeof e.path[0] === 'string') this.pendingShapes.add(e.path[0]);
      }
    });
    this.order.observe((_e, txn) => {
      if (txn.origin === this.origin) return;
      this.pendingOrder = true;
    });
    this.meta.observe((_e, txn) => {
      if (txn.origin === this.origin) return;
      this.pendingMeta = true;
    });
    doc.on('afterTransaction', (txn: Y.Transaction) => {
      if (txn.origin === this.origin) return;
      this.flushRemote();
    });
  }

  /** Whether the document already holds a board. */
  get hasContent(): boolean {
    return this.shapes.size > 0;
  }

  /**
   * Populate the scene from a non-empty document, or seed an empty document
   * from the scene. Call once after the initial sync.
   */
  adoptDocument(): void {
    if (this.hasContent) {
      this.applying = true;
      try {
        this.scene.clear();
        for (const [id, ymap] of this.shapes) {
          const shape = this.readShape(id, ymap);
          if (shape) this.scene.put(shape);
        }
        this.scene.setOrder(this.order.toArray());
      } finally {
        this.applying = false;
      }
      this.markSynced();
      this.onRemote({ shapes: true, meta: true });
    } else {
      this.lastSynced = { shapes: new Map(), order: [] };
      this.lastVersion = -1;
      this.pushLocal();
    }
  }

  get title(): string {
    const t = this.meta.get('title');
    return typeof t === 'string' ? t : '';
  }

  setTitle(title: string): void {
    if (this.title === title) return;
    this.doc.transact(() => this.meta.set('title', title), this.origin);
  }

  /** Write scene changes since the last sync into the document. Returns true if anything was written. */
  pushLocal(): boolean {
    if (this.applying || this.scene.version === this.lastVersion) return false;
    const before = this.lastSynced;
    const after = this.scene.snapshot();
    const upserts: Shape[] = [];
    for (const [id, shape] of after.shapes) if (before.shapes.get(id) !== shape) upserts.push(shape);
    const deletes: Id[] = [];
    for (const id of before.shapes.keys()) if (!after.shapes.has(id)) deletes.push(id);
    const orderChanged = !sameArray(before.order, after.order);
    this.lastSynced = after;
    this.lastVersion = this.scene.version;
    if (upserts.length === 0 && deletes.length === 0 && !orderChanged) return false;
    this.doc.transact(() => {
      for (const id of deletes) this.shapes.delete(id);
      for (const shape of upserts) this.writeShape(shape, before.shapes.get(shape.id));
      if (orderChanged) this.writeOrder(after.order);
    }, this.origin);
    return true;
  }

  private markSynced(): void {
    this.lastSynced = this.scene.snapshot();
    this.lastVersion = this.scene.version;
  }

  private flushRemote(): void {
    if (this.pendingShapes.size === 0 && !this.pendingOrder && !this.pendingMeta) return;
    const shapesChanged = this.pendingShapes.size > 0 || this.pendingOrder;
    const metaChanged = this.pendingMeta;
    this.applying = true;
    try {
      const deletes: Id[] = [];
      for (const id of this.pendingShapes) {
        const ymap = this.shapes.get(id);
        if (!ymap) {
          deletes.push(id);
          continue;
        }
        const shape = this.readShape(id, ymap);
        if (shape) this.scene.put(shape);
        else deletes.push(id);
      }
      if (deletes.length) this.scene.deleteRaw(deletes);
      if (this.pendingOrder || deletes.length) this.scene.setOrder(this.order.toArray());
    } finally {
      this.applying = false;
      this.pendingShapes.clear();
      this.pendingOrder = false;
      this.pendingMeta = false;
    }
    this.markSynced();
    this.onRemote({ shapes: shapesChanged, meta: metaChanged });
  }

  private readShape(id: Id, ymap: Y.Map<unknown>): Shape | null {
    try {
      const shape = validateShape({ ...ymap.toJSON(), id });
      return shape;
    } catch {
      return null;
    }
  }

  private writeShape(shape: Shape, prev: Shape | undefined): void {
    let ymap = this.shapes.get(shape.id);
    if (!ymap) {
      ymap = new Y.Map<unknown>();
      this.shapes.set(shape.id, ymap);
      prev = undefined;
    }
    const record = shape as unknown as Record<string, unknown>;
    const prevRecord = prev as unknown as Record<string, unknown> | undefined;
    for (const key of Object.keys(record)) {
      if (key === 'id') continue;
      const value = record[key];
      if (value === undefined) continue;
      if (prevRecord && deepEqual(prevRecord[key], value) && ymap.has(key)) continue;
      ymap.set(key, clone(value));
    }
    if (prevRecord) for (const key of Object.keys(prevRecord)) if (!(key in record) && ymap.has(key)) ymap.delete(key);
  }

  /** Replace only the differing middle of the order array. */
  private writeOrder(next: readonly Id[]): void {
    const cur = this.order.toArray();
    let start = 0;
    while (start < cur.length && start < next.length && cur[start] === next[start]) start++;
    let endCur = cur.length;
    let endNext = next.length;
    while (endCur > start && endNext > start && cur[endCur - 1] === next[endNext - 1]) {
      endCur--;
      endNext--;
    }
    if (endCur > start) this.order.delete(start, endCur - start);
    if (endNext > start) this.order.insert(start, next.slice(start, endNext));
  }
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

function clone<T>(v: T): T {
  return typeof v === 'object' && v !== null ? (JSON.parse(JSON.stringify(v)) as T) : v;
}
