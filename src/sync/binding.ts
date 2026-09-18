import * as Y from 'yjs';
import { Scene, type SceneSnapshot } from '../model/scene';
import { validateShape } from '../model/serialize';
import type { Id, Shape } from '../model/types';
import { assignKeys, compareKeyed, isValidKey } from './fractional';

/**
 * Keeps a Scene and a Y.Doc in step.
 *
 * Document layout:
 * - `shapes`: Y.Map<Y.Map>, one nested map per shape keyed by id, one entry per
 *   field plus `z`, a fractional index key that gives the z-order (ties by id)
 * - `order`:  legacy Y.Array<string> of ids, read only for boards written
 *   before `z` existed
 * - `meta`:   Y.Map with `title`
 *
 * Local edits are made to the Scene first (immutable records), then
 * `pushLocal` diffs the scene against the last synced snapshot and writes the
 * difference into the document under `origin`. Transactions from any other
 * origin (remote peers, the undo manager) are applied back onto the Scene.
 */
export class DocBinding {
  readonly shapes: Y.Map<Y.Map<unknown>>;
  /** Legacy order array; never written any more. */
  readonly order: Y.Array<string>;
  readonly meta: Y.Map<unknown>;
  /** Editors migrate legacy boards to `z` keys on adopt; viewers must not write. */
  writable = true;
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
        this.scene.setOrder(this.readOrder());
      } finally {
        this.applying = false;
      }
      this.markSynced();
      if (this.writable) this.migrateLegacyOrder();
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
    const newKeys = orderChanged || upserts.some((s) => !before.shapes.has(s.id)) ? assignKeys(after.order, this.currentKeys()) : new Map<Id, string>();
    if (upserts.length === 0 && deletes.length === 0 && newKeys.size === 0) return false;
    this.doc.transact(() => {
      for (const id of deletes) this.shapes.delete(id);
      for (const shape of upserts) this.writeShape(shape, before.shapes.get(shape.id));
      for (const [id, z] of newKeys) this.shapes.get(id)?.set('z', z);
    }, this.origin);
    return true;
  }

  /** Every shape's current `z` key from the document. */
  private currentKeys(): Map<Id, string> {
    const keys = new Map<Id, string>();
    for (const [id, ymap] of this.shapes) {
      const z = ymap.get('z');
      if (isValidKey(z)) keys.set(id, z);
    }
    return keys;
  }

  /**
   * Z-order from the document: shapes with keys sorted by (key, id). Shapes
   * without a key (boards from before keys existed) come first in the legacy
   * array's order, then any leftovers by id.
   */
  private readOrder(): Id[] {
    const keyed: { key: string; id: Id }[] = [];
    const unkeyed = new Set<Id>();
    for (const [id, ymap] of this.shapes) {
      const z = ymap.get('z');
      if (isValidKey(z)) keyed.push({ key: z, id });
      else unkeyed.add(id);
    }
    keyed.sort(compareKeyed);
    const legacy: Id[] = [];
    if (unkeyed.size) {
      for (const id of this.order.toArray()) if (unkeyed.delete(id)) legacy.push(id);
      legacy.push(...[...unkeyed].sort());
    }
    return [...legacy, ...keyed.map((k) => k.id)];
  }

  /** Give every keyless shape a key that preserves the order just read. */
  private migrateLegacyOrder(): void {
    const keys = this.currentKeys();
    if (keys.size === this.shapes.size) return;
    const newKeys = assignKeys(this.scene.ids(), keys);
    if (newKeys.size === 0) return;
    this.doc.transact(() => {
      for (const [id, z] of newKeys) this.shapes.get(id)?.set('z', z);
    }, this.origin);
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
      this.scene.setOrder(this.readOrder());
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
      if (key === 'id' || key === 'z') continue;
      const value = record[key];
      if (value === undefined) continue;
      if (prevRecord && deepEqual(prevRecord[key], value) && ymap.has(key)) continue;
      ymap.set(key, clone(value));
    }
    if (prevRecord) for (const key of Object.keys(prevRecord)) if (!(key in record) && ymap.has(key)) ymap.delete(key);
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
