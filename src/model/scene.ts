import {
  type Box,
  type Vec,
  add,
  boxCenter,
  boundsOfPoints,
  dist,
  rotatePoint,
  rotatedBounds,
  scale,
  sub,
  unionBoxes,
} from './geometry';
import { type Anchor, type BoxedShape, type ConnectorEnd, type ConnectorShape, type Id, type Shape, isBoxed } from './types';

export interface SceneSnapshot {
  shapes: Map<Id, Shape>;
  order: Id[];
}

export const FRAME_TITLE_HEIGHT = 24;

/** Shape records are immutable, so their bounds can be cached by identity. */
const boundsCache = new WeakMap<Shape, Box>();

/**
 * The scene graph: a flat map of immutable shape records plus a z-order list.
 * Hierarchy (groups and frames) is expressed through `parentId`; positions are
 * always absolute world coordinates so moving a parent moves its descendants
 * explicitly via `translate`.
 */
export class Scene {
  private shapes = new Map<Id, Shape>();
  /** Bottom to top. */
  private order: Id[] = [];
  /** Cached result of `all()`; cleared by every mutation. */
  private allCache: Shape[] | null = null;

  // ---- basic CRUD --------------------------------------------------------

  get size(): number {
    return this.shapes.size;
  }

  has(id: Id): boolean {
    return this.shapes.has(id);
  }

  get(id: Id): Shape | undefined {
    return this.shapes.get(id);
  }

  mustGet(id: Id): Shape {
    const s = this.shapes.get(id);
    if (!s) throw new Error(`Unknown shape ${id}`);
    return s;
  }

  /** All shapes in z-order (bottom first). The array is shared; do not mutate it. */
  all(): Shape[] {
    if (this.allCache) return this.allCache;
    const out: Shape[] = [];
    for (const id of this.order) {
      const s = this.shapes.get(id);
      if (s) out.push(s);
    }
    this.allCache = out;
    return out;
  }

  private touch(): void {
    this.allCache = null;
  }

  ids(): Id[] {
    return [...this.order];
  }

  indexOf(id: Id): number {
    return this.order.indexOf(id);
  }

  add(shape: Shape, index?: number): Shape {
    if (this.shapes.has(shape.id)) throw new Error(`Duplicate shape id ${shape.id}`);
    this.touch();
    this.shapes.set(shape.id, shape);
    if (index === undefined || index < 0 || index >= this.order.length) this.order.push(shape.id);
    else this.order.splice(index, 0, shape.id);
    return shape;
  }

  /** Replace a shape record with a patched copy. */
  update<T extends Shape>(id: Id, patch: Partial<Omit<T, 'id' | 'type'>>): T {
    const cur = this.mustGet(id) as T;
    const next = { ...cur, ...patch, id: cur.id, type: cur.type } as T;
    this.touch();
    this.shapes.set(id, next);
    return next;
  }

  /**
   * Remove shapes and their descendants. Connectors attached to a removed
   * shape become free at their last resolved position.
   */
  remove(ids: Iterable<Id>): Id[] {
    this.touch();
    const toRemove = new Set<Id>();
    for (const id of ids) {
      if (!this.shapes.has(id)) continue;
      toRemove.add(id);
      for (const d of this.descendants(id)) toRemove.add(d);
    }
    // Detach connectors that reference removed shapes.
    for (const s of this.shapes.values()) {
      if (s.type !== 'connector' || toRemove.has(s.id)) continue;
      const startGone = s.start.shapeId !== null && toRemove.has(s.start.shapeId);
      const endGone = s.end.shapeId !== null && toRemove.has(s.end.shapeId);
      if (!startGone && !endGone) continue;
      const pts = this.connectorPoints(s);
      this.shapes.set(s.id, {
        ...s,
        start: startGone ? { shapeId: null, point: pts.a, anchor: 'auto' } : s.start,
        end: endGone ? { shapeId: null, point: pts.b, anchor: 'auto' } : s.end,
      });
    }
    for (const id of toRemove) this.shapes.delete(id);
    this.order = this.order.filter((id) => !toRemove.has(id));
    return [...toRemove];
  }

  clear(): void {
    this.touch();
    this.shapes.clear();
    this.order = [];
  }

  // ---- hierarchy ---------------------------------------------------------

  children(id: Id | null): Shape[] {
    const out: Shape[] = [];
    for (const cid of this.order) {
      const s = this.shapes.get(cid);
      if (s && s.parentId === id) out.push(s);
    }
    return out;
  }

  /** Ids of all descendants, depth first, in z-order. */
  descendants(id: Id): Id[] {
    const out: Id[] = [];
    const walk = (pid: Id) => {
      for (const c of this.children(pid)) {
        out.push(c.id);
        walk(c.id);
      }
    };
    walk(id);
    return out;
  }

  /** Leaf (non-group) descendants including the shape itself when it is a leaf. */
  leaves(id: Id): Id[] {
    const s = this.mustGet(id);
    if (s.type !== 'group') return [id];
    return this.descendants(id).filter((d) => this.mustGet(d).type !== 'group');
  }

  /** The outermost group containing `id`, or `id` itself when not grouped. */
  topGroup(id: Id): Id {
    let cur = this.mustGet(id);
    let top = cur.id;
    while (cur.parentId !== null) {
      const p = this.shapes.get(cur.parentId);
      if (!p || p.type !== 'group') break;
      top = p.id;
      cur = p;
    }
    return top;
  }

  /** Nearest frame ancestor, if any. */
  frameOf(id: Id): Id | null {
    let cur: Shape | undefined = this.mustGet(id);
    while (cur && cur.parentId !== null) {
      const p: Shape | undefined = this.shapes.get(cur.parentId);
      if (!p) return null;
      if (p.type === 'frame') return p.id;
      cur = p;
    }
    return null;
  }

  setParent(id: Id, parentId: Id | null): void {
    if (parentId !== null) {
      if (parentId === id) throw new Error('A shape cannot be its own parent');
      if (this.descendants(id).includes(parentId)) throw new Error('Cycle in scene hierarchy');
    }
    this.update(id, { parentId });
  }

  /**
   * Reduce a set of ids to the outermost selectable items: descendants of
   * groups are replaced by their top group, duplicates removed.
   */
  normalizeSelection(ids: Iterable<Id>): Id[] {
    const out: Id[] = [];
    const seen = new Set<Id>();
    for (const id of ids) {
      if (!this.shapes.has(id)) continue;
      const top = this.topGroup(id);
      if (seen.has(top)) continue;
      seen.add(top);
      out.push(top);
    }
    return out;
  }

  // ---- bounds ------------------------------------------------------------

  /** Axis-aligned world bounds of a shape (including rotation). */
  bounds(id: Id): Box {
    const s = this.mustGet(id);
    return this.boundsOfShape(s);
  }

  boundsOfShape(s: Shape): Box {
    switch (s.type) {
      case 'group': {
        const leaves = this.leaves(s.id);
        if (leaves.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
        return unionBoxes(leaves.map((l) => this.bounds(l)));
      }
      case 'connector':
        return boundsOfPoints(this.connectorGeometry(s).points);
      default: {
        const cached = boundsCache.get(s);
        if (cached) return cached;
        const b = rotatedBounds(s, s.rotation);
        boundsCache.set(s, b);
        return b;
      }
    }
  }

  boundsOfMany(ids: Iterable<Id>): Box {
    const boxes: Box[] = [];
    for (const id of ids) if (this.shapes.has(id)) boxes.push(this.bounds(id));
    return unionBoxes(boxes);
  }

  // ---- connectors --------------------------------------------------------

  /** Resolve a connector's two endpoints to world positions. */
  connectorPoints(c: ConnectorShape): { a: Vec; b: Vec } {
    const g = this.connectorGeometry(c);
    return { a: g.points[0], b: g.points[g.points.length - 1] };
  }

  /**
   * Full routed geometry of a connector: the polyline to draw and hit-test
   * (for curved connectors, a sampled approximation) plus the bezier control
   * points when the style is curved.
   */
  connectorGeometry(c: ConnectorShape): ConnectorGeometry {
    const startShape = c.start.shapeId ? this.shapes.get(c.start.shapeId) : undefined;
    const endShape = c.end.shapeId ? this.shapes.get(c.end.shapeId) : undefined;
    const startCenter = startShape ? boxCenter(this.boundsOfShape(startShape)) : c.start.point;
    const endCenter = endShape ? boxCenter(this.boundsOfShape(endShape)) : c.end.point;
    // Fixed anchors resolve independently; auto anchors aim at the other end.
    const startFixed = startShape && c.start.anchor !== 'auto' ? this.anchorPoint(startShape, c.start.anchor) : null;
    const endFixed = endShape && c.end.anchor !== 'auto' ? this.anchorPoint(endShape, c.end.anchor) : null;
    const aTarget = endFixed ? endFixed.point : endCenter;
    const bTarget = startFixed ? startFixed.point : startCenter;
    const a = startFixed ? startFixed.point : startShape ? this.edgePoint(startShape, aTarget) : c.start.point;
    const b = endFixed ? endFixed.point : endShape ? this.edgePoint(endShape, bTarget) : c.end.point;
    const dirA = startFixed ? startFixed.normal : startShape ? unit(sub(a, startCenter)) : unit(sub(b, a));
    const dirB = endFixed ? endFixed.normal : endShape ? unit(sub(b, endCenter)) : unit(sub(a, b));
    switch (c.style) {
      case 'straight':
        return { points: [a, b] };
      case 'elbow':
        return { points: elbowRoute(a, dirA, startFixed !== null, b, dirB, endFixed !== null) };
      case 'curved': {
        const d = Math.max(40, dist(a, b) / 3);
        const c1 = add(a, scale(dirA, d));
        const c2 = add(b, scale(dirB, d));
        const points: Vec[] = [];
        const n = 24;
        for (let i = 0; i <= n; i++) points.push(bezierPoint(a, c1, c2, b, i / n));
        return { points, curve: { c1, c2 } };
      }
    }
  }

  /** Midpoint of a shape's side plus its outward normal, honouring rotation. */
  anchorPoint(s: Shape, anchor: Exclude<Anchor, 'auto'>): { point: Vec; normal: Vec } {
    const box = isBoxed(s) ? s : this.boundsOfShape(s);
    const rotation = isBoxed(s) ? s.rotation : 0;
    const c = boxCenter(box);
    let local: Vec;
    let normal: Vec;
    switch (anchor) {
      case 'top':
        local = { x: c.x, y: box.y };
        normal = { x: 0, y: -1 };
        break;
      case 'bottom':
        local = { x: c.x, y: box.y + box.h };
        normal = { x: 0, y: 1 };
        break;
      case 'left':
        local = { x: box.x, y: c.y };
        normal = { x: -1, y: 0 };
        break;
      case 'right':
        local = { x: box.x + box.w, y: c.y };
        normal = { x: 1, y: 0 };
        break;
    }
    return { point: rotatePoint(local, c, rotation), normal: rotatePoint(normal, { x: 0, y: 0 }, rotation) };
  }

  /** The fixed anchor whose point lies within `tolerance` of `p`, or null. */
  nearestAnchor(s: Shape, p: Vec, tolerance: number): Exclude<Anchor, 'auto'> | null {
    let best: Exclude<Anchor, 'auto'> | null = null;
    let bestD = tolerance;
    for (const anchor of ['top', 'right', 'bottom', 'left'] as const) {
      const d = dist(this.anchorPoint(s, anchor).point, p);
      if (d <= bestD) {
        bestD = d;
        best = anchor;
      }
    }
    return best;
  }

  /** Point where a ray from the shape centre towards `target` leaves the shape. */
  edgePoint(s: Shape, target: Vec): Vec {
    if (!isBoxed(s)) {
      const b = this.boundsOfShape(s);
      return rectEdgePoint(b, 0, target);
    }
    if (s.type === 'ellipse') return ellipseEdgePoint(s, target);
    return rectEdgePoint(s, s.rotation, target);
  }

  connectorsAttachedTo(id: Id): ConnectorShape[] {
    const out: ConnectorShape[] = [];
    for (const s of this.shapes.values()) {
      if (s.type === 'connector' && (s.start.shapeId === id || s.end.shapeId === id)) out.push(s);
    }
    return out;
  }

  // ---- transforms --------------------------------------------------------

  /** Move shapes (and their descendants) by a delta. */
  translate(ids: Iterable<Id>, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.touch();
    const targets = this.expandToLeaves(ids);
    for (const id of targets) {
      const s = this.mustGet(id);
      if (s.type === 'connector') {
        this.shapes.set(id, {
          ...s,
          start: s.start.shapeId ? s.start : freeEnd({ x: s.start.point.x + dx, y: s.start.point.y + dy }),
          end: s.end.shapeId ? s.end : freeEnd({ x: s.end.point.x + dx, y: s.end.point.y + dy }),
        });
      } else if (isBoxed(s)) {
        this.shapes.set(id, { ...s, x: s.x + dx, y: s.y + dy });
      }
    }
  }

  /** Rotate shapes around a pivot by `angle` radians. */
  rotate(ids: Iterable<Id>, pivot: Vec, angle: number): void {
    if (angle === 0) return;
    this.touch();
    for (const id of this.expandToLeaves(ids)) {
      const s = this.mustGet(id);
      if (s.type === 'connector') {
        this.shapes.set(id, {
          ...s,
          start: s.start.shapeId ? s.start : freeEnd(rotatePoint(s.start.point, pivot, angle)),
          end: s.end.shapeId ? s.end : freeEnd(rotatePoint(s.end.point, pivot, angle)),
        });
      } else if (isBoxed(s)) {
        const c = rotatePoint(boxCenter(s), pivot, angle);
        this.shapes.set(id, { ...s, x: c.x - s.w / 2, y: c.y - s.h / 2, rotation: normalizeAngle(s.rotation + angle) });
      }
    }
  }

  /** Replace the box of a boxed shape, scaling internal geometry (pen and line points). */
  setBox(id: Id, box: Box): void {
    const s = this.mustGet(id);
    if (!isBoxed(s)) return;
    this.touch();
    this.shapes.set(id, resizeBoxed(s, box));
  }

  /**
   * Scale shapes so that the union of their bounds `from` maps onto `to`.
   * Used for multi-selection resize. Rotations are preserved.
   */
  scaleShapes(ids: Iterable<Id>, from: Box, to: Box): void {
    const sx = from.w === 0 ? 1 : to.w / from.w;
    const sy = from.h === 0 ? 1 : to.h / from.h;
    const map = (p: Vec): Vec => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy });
    this.touch();
    for (const id of this.expandToLeaves(ids)) {
      const s = this.mustGet(id);
      if (s.type === 'connector') {
        this.shapes.set(id, {
          ...s,
          start: s.start.shapeId ? s.start : freeEnd(map(s.start.point)),
          end: s.end.shapeId ? s.end : freeEnd(map(s.end.point)),
        });
      } else if (isBoxed(s)) {
        const c = map(boxCenter(s));
        const w = Math.max(1, s.w * Math.abs(sx));
        const h = Math.max(1, s.h * Math.abs(sy));
        this.shapes.set(id, resizeBoxed(s, { x: c.x - w / 2, y: c.y - h / 2, w, h }));
      }
    }
  }

  private expandToLeaves(ids: Iterable<Id>): Set<Id> {
    const out = new Set<Id>();
    for (const id of ids) {
      if (!this.shapes.has(id)) continue;
      const s = this.mustGet(id);
      if (s.type !== 'group') out.add(id);
      for (const d of this.descendants(id)) out.add(d);
    }
    return out;
  }

  // ---- z-order -----------------------------------------------------------

  /** Ids in z-order that belong to the selection, including descendants. */
  private orderedBlock(ids: Iterable<Id>): Set<Id> {
    const set = new Set<Id>();
    for (const id of ids) {
      if (!this.shapes.has(id)) continue;
      set.add(id);
      for (const d of this.descendants(id)) set.add(d);
    }
    return set;
  }

  bringToFront(ids: Iterable<Id>): void {
    this.touch();
    const block = this.orderedBlock(ids);
    const moved = this.order.filter((id) => block.has(id));
    this.order = [...this.order.filter((id) => !block.has(id)), ...moved];
  }

  sendToBack(ids: Iterable<Id>): void {
    this.touch();
    const block = this.orderedBlock(ids);
    const moved = this.order.filter((id) => block.has(id));
    this.order = [...moved, ...this.order.filter((id) => !block.has(id))];
  }

  bringForward(ids: Iterable<Id>): void {
    this.touch();
    const block = this.orderedBlock(ids);
    const order = this.order;
    for (let i = order.length - 2; i >= 0; i--) {
      if (block.has(order[i]) && !block.has(order[i + 1])) {
        [order[i], order[i + 1]] = [order[i + 1], order[i]];
      }
    }
  }

  sendBackward(ids: Iterable<Id>): void {
    this.touch();
    const block = this.orderedBlock(ids);
    const order = this.order;
    for (let i = 1; i < order.length; i++) {
      if (block.has(order[i]) && !block.has(order[i - 1])) {
        [order[i], order[i - 1]] = [order[i - 1], order[i]];
      }
    }
  }

  // ---- snapshots ---------------------------------------------------------

  snapshot(): SceneSnapshot {
    return { shapes: new Map(this.shapes), order: [...this.order] };
  }

  restore(snap: SceneSnapshot): void {
    this.touch();
    this.shapes = new Map(snap.shapes);
    this.order = [...snap.order];
  }

  clone(): Scene {
    const s = new Scene();
    s.restore(this.snapshot());
    return s;
  }
}

export interface ConnectorGeometry {
  /** Polyline from start to end. */
  points: Vec[];
  /** Bezier control points, present for curved connectors. */
  curve?: { c1: Vec; c2: Vec };
}

export function freeEnd(point: Vec): ConnectorEnd {
  return { shapeId: null, point, anchor: 'auto' };
}

function unit(v: Vec): Vec {
  const l = Math.hypot(v.x, v.y);
  return l === 0 ? { x: 1, y: 0 } : { x: v.x / l, y: v.y / l };
}

/** Snap a direction to the axis it mostly points along. */
function axisOf(v: Vec): Vec {
  if (Math.abs(v.x) >= Math.abs(v.y)) return { x: v.x >= 0 ? 1 : -1, y: 0 };
  return { x: 0, y: v.y >= 0 ? 1 : -1 };
}

const ELBOW_STUB = 24;

/**
 * Orthogonal route from a to b. Each end leaves along its exit direction:
 * fixed anchors always get a short stub in their normal direction, auto
 * anchors go straight into the mid-route. The mid-route bends at the midpoint
 * of the axis the first segment runs along.
 */
export function elbowRoute(a: Vec, dirA: Vec, stubA: boolean, b: Vec, dirB: Vec, stubB: boolean): Vec[] {
  const ea = axisOf(dirA);
  const eb = axisOf(dirB);
  const pa = stubA ? add(a, scale(ea, ELBOW_STUB)) : a;
  const pb = stubB ? add(b, scale(eb, ELBOW_STUB)) : b;
  const horizontalFirst = ea.x !== 0;
  const mid: Vec[] = [];
  if (horizontalFirst) {
    const midX = (pa.x + pb.x) / 2;
    mid.push({ x: midX, y: pa.y }, { x: midX, y: pb.y });
  } else {
    const midY = (pa.y + pb.y) / 2;
    mid.push({ x: pa.x, y: midY }, { x: pb.x, y: midY });
  }
  return simplifyPolyline([a, pa, ...mid, pb, b]);
}

/** Drop repeated and collinear points. */
export function simplifyPolyline(points: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue;
    out.push(p);
  }
  for (let i = 1; i < out.length - 1; ) {
    const p0 = out[i - 1];
    const p1 = out[i];
    const p2 = out[i + 1];
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    const sameDir = (p1.x - p0.x) * (p2.x - p1.x) + (p1.y - p0.y) * (p2.y - p1.y) >= 0;
    if (Math.abs(cross) < 1e-9 && sameDir) out.splice(i, 1);
    else i++;
  }
  return out;
}

export function bezierPoint(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r < 0) r += twoPi;
  return r;
}

/** Produce a copy of a boxed shape fitted to `box`, scaling stroke geometry. */
export function resizeBoxed<T extends BoxedShape>(s: T, box: Box): T {
  const w = Math.max(box.w, 0);
  const h = Math.max(box.h, 0);
  if (s.type === 'pen' || s.type === 'line') {
    const sx = s.w === 0 ? 0 : w / s.w;
    const sy = s.h === 0 ? 0 : h / s.h;
    const points = s.points.map((p) => ({ x: p.x * sx, y: p.y * sy }));
    return { ...s, x: box.x, y: box.y, w, h, points } as T;
  }
  return { ...s, x: box.x, y: box.y, w, h } as T;
}

/** Intersection of the ray centre→target with the rotated rectangle edge. */
export function rectEdgePoint(box: Box, rotation: number, target: Vec): Vec {
  const c = boxCenter(box);
  const local = rotatePoint(target, c, -rotation);
  const dx = local.x - c.x;
  const dy = local.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = box.w / 2;
  const hh = box.h / 2;
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  const p = { x: c.x + dx * t, y: c.y + dy * t };
  return rotatePoint(p, c, rotation);
}

export function ellipseEdgePoint(box: Box & { rotation: number }, target: Vec): Vec {
  const c = boxCenter(box);
  const local = rotatePoint(target, c, -box.rotation);
  const dx = local.x - c.x;
  const dy = local.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const rx = box.w / 2;
  const ry = box.h / 2;
  if (rx === 0 || ry === 0) return c;
  const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  return rotatePoint({ x: c.x + dx * t, y: c.y + dy * t }, c, box.rotation);
}
