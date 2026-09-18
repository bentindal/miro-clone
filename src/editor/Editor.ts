import {
  type Box,
  type Camera,
  type Vec,
  boxCenter,
  boxFromPoints,
  boundsOfPoints,
  dist,
  fitCamera,
  normalizeBox,
  panCamera,
  pointInBox,
  rotatePoint,
  screenToWorld,
  zoomCameraAt,
  zoomCameraBy,
} from '../model/geometry';
import { hitTest, selectableAt, selectablesInBox } from '../model/hitTest';
import { History } from '../model/history';
import { Scene, type SceneSnapshot } from '../model/scene';
import { type BoardFile, deserializeScene, serializeScene } from '../model/serialize';
import {
  type BoxedShape,
  type FrameShape,
  type Id,
  type Shape,
  type StickyShape,
  type TextShape,
  hasText,
  isBoxed,
  newId,
} from '../model/types';
import {
  HANDLE_SIZE,
  type HandleName,
  type Overlay,
  type RenderStats,
  type SelectionFrame,
  boardBounds,
  renderBoard,
  renderToCanvas,
  selectionFrame,
} from '../render/renderer';
import { collectForCopy, pasteShapes } from './clipboard';

export type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'line' | 'sticky' | 'text' | 'pen' | 'connector' | 'frame';

export const TOOLS: Tool[] = ['select', 'hand', 'rect', 'ellipse', 'line', 'sticky', 'text', 'pen', 'connector', 'frame'];

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

const NONE: Modifiers = { shift: false, ctrl: false, alt: false };

type Drag =
  | { kind: 'pan'; last: Vec }
  | { kind: 'marquee'; start: Vec; current: Vec; base: Id[]; additive: boolean; moved: boolean }
  | { kind: 'move'; start: Vec; ids: Id[]; moved: boolean; target: Id; snap: SceneSnapshot; shift: boolean; wasSelected: boolean }
  | { kind: 'resize'; handle: HandleName; frame: SelectionFrame; ids: Id[]; snap: SceneSnapshot; single: BoxedShape | null }
  | { kind: 'rotate'; center: Vec; startAngle: number; ids: Id[]; snap: SceneSnapshot; startRotation: number }
  | { kind: 'create'; type: 'rect' | 'ellipse' | 'frame' | 'line'; start: Vec; current: Vec }
  | { kind: 'pen'; points: Vec[] }
  | { kind: 'connector'; startId: Id | null; start: Vec; current: Vec; endId: Id | null };

export interface EditingState {
  id: Id;
  snap: SceneSnapshot;
  /** Whether the shape was created by this edit (removed again if left empty). */
  fresh: boolean;
}

const DRAG_THRESHOLD = 3;
const STICKY_SIZE = 120;
const STICKY_COLORS = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#f48fb1'];
const SHAPE_FILL = '#ffffff';
const SHAPE_STROKE = '#222222';

export class Editor {
  readonly scene = new Scene();
  readonly history = new History<SceneSnapshot>(500);
  camera: Camera = { tx: 0, ty: 0, zoom: 1 };
  selection: Id[] = [];
  tool: Tool = 'select';
  hoverId: Id | null = null;
  editing: EditingState | null = null;
  viewport = { w: 1, h: 1 };
  spaceHeld = false;
  clipboard: Shape[] | null = null;
  lastRenderStats: RenderStats = { drawn: 0, culled: 0 };
  lastRenderMs = 0;
  private drag: Drag | null = null;
  private txSnap: SceneSnapshot | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private canvas: HTMLCanvasElement | null = null;
  private renderScheduled = false;
  private stickyColorIndex = 0;

  // ---- subscriptions -----------------------------------------------------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getVersion(): number {
    return this.version;
  }

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
    this.requestRender();
  }

  // ---- rendering ---------------------------------------------------------

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    this.requestRender();
  }

  setViewport(w: number, h: number): void {
    if (this.viewport.w === w && this.viewport.h === h) return;
    this.viewport = { w, h };
    this.notify();
  }

  requestRender(): void {
    if (this.renderScheduled || typeof requestAnimationFrame !== 'function') return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.renderNow();
    });
  }

  /** Synchronously draw the board; returns the time spent in milliseconds. */
  renderNow(): number {
    const canvas = this.canvas;
    if (!canvas) return 0;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const t0 = performance.now();
    const dpr = window.devicePixelRatio || 1;
    const w = this.viewport.w;
    const h = this.viewport.h;
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.lastRenderStats = renderBoard(ctx, this.scene, this.camera, w, h, this.overlay());
    this.lastRenderMs = performance.now() - t0;
    return this.lastRenderMs;
  }

  overlay(): Overlay {
    const d = this.drag;
    return {
      selection: this.selection,
      hoverId: this.hoverId,
      marquee: d?.kind === 'marquee' && d.moved ? boxFromPoints(d.start, d.current) : null,
      preview: d?.kind === 'create' ? this.previewShape(d) : d?.kind === 'pen' ? this.penShape(d.points, 'preview') : null,
      previewLine: d?.kind === 'connector' ? this.connectorPreview(d) : null,
      editingId: this.editing?.id ?? null,
    };
  }

  // ---- history -----------------------------------------------------------

  /** Run `fn` as one undoable step. */
  transact<T>(fn: () => T): T {
    const before = this.scene.snapshot();
    const result = fn();
    if (sceneChanged(before, this.scene.snapshot())) this.history.push(before);
    this.afterChange();
    return result;
  }

  private beginTx(): SceneSnapshot {
    this.txSnap = this.scene.snapshot();
    return this.txSnap;
  }

  private endTx(): void {
    if (this.txSnap && sceneChanged(this.txSnap, this.scene.snapshot())) this.history.push(this.txSnap);
    this.txSnap = null;
    this.afterChange();
  }

  private afterChange(): void {
    this.selection = this.selection.filter((id) => this.scene.has(id));
    if (this.hoverId && !this.scene.has(this.hoverId)) this.hoverId = null;
    this.notify();
  }

  undo(): boolean {
    if (this.editing) this.finishEditing();
    const prev = this.history.undo(this.scene.snapshot());
    if (!prev) return false;
    this.scene.restore(prev);
    this.afterChange();
    return true;
  }

  redo(): boolean {
    if (this.editing) this.finishEditing();
    const next = this.history.redo(this.scene.snapshot());
    if (!next) return false;
    this.scene.restore(next);
    this.afterChange();
    return true;
  }

  // ---- camera ------------------------------------------------------------

  setCamera(cam: Camera): void {
    this.camera = { ...cam };
    this.notify();
  }

  panBy(dx: number, dy: number): void {
    this.setCamera(panCamera(this.camera, dx, dy));
  }

  zoomBy(factor: number, at?: Vec): void {
    const p = at ?? { x: this.viewport.w / 2, y: this.viewport.h / 2 };
    this.setCamera(zoomCameraBy(this.camera, factor, p));
  }

  zoomTo(zoom: number, at?: Vec): void {
    const p = at ?? { x: this.viewport.w / 2, y: this.viewport.h / 2 };
    this.setCamera(zoomCameraAt(this.camera, zoom, p));
  }

  resetCamera(): void {
    this.setCamera({ tx: 0, ty: 0, zoom: 1 });
  }

  zoomToFit(): void {
    if (this.scene.size === 0) return this.resetCamera();
    this.setCamera(fitCamera(boardBounds(this.scene), this.viewport.w, this.viewport.h));
  }

  /** Wheel input: plain scroll pans, ctrl (trackpad pinch) zooms around the cursor. */
  onWheel(dx: number, dy: number, ctrl: boolean, at: Vec): void {
    if (ctrl) {
      const factor = Math.exp(-dy * 0.01);
      this.setCamera(zoomCameraBy(this.camera, factor, at));
    } else {
      this.setCamera(panCamera(this.camera, -dx, -dy));
    }
  }

  toWorld(p: Vec): Vec {
    return screenToWorld(this.camera, p);
  }

  // ---- selection & tools -------------------------------------------------

  setTool(tool: Tool): void {
    if (this.editing) this.finishEditing();
    this.tool = tool;
    this.drag = null;
    this.notify();
  }

  select(ids: Id[]): void {
    this.selection = this.scene.normalizeSelection(ids);
    this.notify();
  }

  selectAll(): void {
    this.select(this.scene.all().filter((s) => s.type !== 'group').map((s) => s.id));
  }

  clearSelection(): void {
    this.selection = [];
    this.notify();
  }

  get selectionFrame(): SelectionFrame | null {
    return selectionFrame(this.scene, this.selection, this.camera);
  }

  handleAt(screen: Vec): HandleName | null {
    if (this.tool !== 'select') return null;
    const frame = this.selectionFrame;
    if (!frame) return null;
    const r = HANDLE_SIZE / 2 + 3;
    for (const name of Object.keys(frame.handles) as HandleName[]) {
      if (dist(frame.handles[name], screen) <= r) return name;
    }
    return null;
  }

  cursorAt(screen: Vec): string {
    if (this.drag?.kind === 'pan' || this.tool === 'hand' || this.spaceHeld) return this.drag ? 'grabbing' : 'grab';
    if (this.drag?.kind === 'move') return 'move';
    const h = this.handleAt(screen);
    if (h === 'rotate') return 'crosshair';
    if (h) {
      const map: Record<string, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
      return map[h];
    }
    if (this.tool !== 'select') return 'crosshair';
    return this.hoverId ? 'move' : 'default';
  }

  // ---- pointer input -----------------------------------------------------

  onPointerDown(screen: Vec, button: number, mods: Modifiers = NONE): void {
    if (this.editing) this.finishEditing();
    const world = this.toWorld(screen);
    if (button === 1 || this.tool === 'hand' || this.spaceHeld) {
      this.drag = { kind: 'pan', last: screen };
      this.notify();
      return;
    }
    if (button !== 0) return;
    switch (this.tool) {
      case 'select':
        this.selectPointerDown(screen, world, mods);
        break;
      case 'rect':
      case 'ellipse':
      case 'frame':
      case 'line':
        this.drag = { kind: 'create', type: this.tool, start: world, current: world };
        break;
      case 'pen':
        this.drag = { kind: 'pen', points: [world] };
        break;
      case 'connector': {
        const hit = hitTest(this.scene, world, 4 / this.camera.zoom);
        const startId = hit && hit.type !== 'connector' ? hit.id : null;
        this.drag = { kind: 'connector', startId, start: world, current: world, endId: null };
        break;
      }
      case 'sticky':
        this.placeSticky(world);
        break;
      case 'text':
        this.placeText(world);
        break;
    }
    this.notify();
  }

  private selectPointerDown(screen: Vec, world: Vec, mods: Modifiers): void {
    const handle = this.handleAt(screen);
    const frame = this.selectionFrame;
    if (handle && frame) {
      const ids = [...this.selection];
      const snap = this.beginTx();
      if (handle === 'rotate') {
        const center = boxCenter(frame.box);
        const startAngle = Math.atan2(world.y - center.y, world.x - center.x);
        this.drag = { kind: 'rotate', center, startAngle, ids, snap, startRotation: frame.rotation };
      } else {
        const single = ids.length === 1 ? this.scene.mustGet(ids[0]) : null;
        this.drag = { kind: 'resize', handle, frame, ids, snap, single: single && isBoxed(single) ? single : null };
      }
      return;
    }
    const target = selectableAt(this.scene, world, 4 / this.camera.zoom);
    if (target) {
      const wasSelected = this.selection.includes(target);
      if (mods.shift) {
        this.selection = wasSelected ? this.selection.filter((id) => id !== target) : [...this.selection, target];
      } else if (!wasSelected) {
        this.selection = [target];
      }
      if (this.selection.includes(target)) {
        this.drag = { kind: 'move', start: world, ids: [...this.selection], moved: false, target, snap: this.beginTx(), shift: mods.shift, wasSelected };
      }
      return;
    }
    this.drag = { kind: 'marquee', start: world, current: world, base: mods.shift ? [...this.selection] : [], additive: mods.shift, moved: false };
    if (!mods.shift) this.selection = [];
  }

  onPointerMove(screen: Vec, mods: Modifiers = NONE): void {
    const d = this.drag;
    const world = this.toWorld(screen);
    if (!d) {
      const hover = this.tool === 'select' ? selectableAt(this.scene, world, 4 / this.camera.zoom) : null;
      if (hover !== this.hoverId) {
        this.hoverId = hover;
        this.notify();
      }
      return;
    }
    switch (d.kind) {
      case 'pan':
        this.camera = panCamera(this.camera, screen.x - d.last.x, screen.y - d.last.y);
        d.last = screen;
        break;
      case 'marquee':
        d.current = world;
        if (!d.moved && dist(d.start, world) * this.camera.zoom > DRAG_THRESHOLD) d.moved = true;
        if (d.moved) {
          const inside = selectablesInBox(this.scene, boxFromPoints(d.start, d.current));
          this.selection = d.additive ? this.scene.normalizeSelection([...d.base, ...inside]) : inside;
        }
        break;
      case 'move': {
        if (!d.moved && dist(d.start, world) * this.camera.zoom > DRAG_THRESHOLD) d.moved = true;
        if (!d.moved) break;
        this.scene.restore(d.snap);
        let dx = world.x - d.start.x;
        let dy = world.y - d.start.y;
        if (mods.shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        this.scene.translate(d.ids, dx, dy);
        break;
      }
      case 'resize':
        this.scene.restore(d.snap);
        this.applyResize(d, world, mods.shift);
        break;
      case 'rotate': {
        this.scene.restore(d.snap);
        let angle = Math.atan2(world.y - d.center.y, world.x - d.center.x) - d.startAngle;
        if (mods.shift) {
          const step = Math.PI / 12;
          angle = Math.round((d.startRotation + angle) / step) * step - d.startRotation;
        }
        this.scene.rotate(d.ids, d.center, angle);
        break;
      }
      case 'create':
        d.current = world;
        break;
      case 'pen': {
        const last = d.points[d.points.length - 1];
        if (dist(last, world) * this.camera.zoom >= 1) d.points.push(world);
        break;
      }
      case 'connector': {
        d.current = world;
        const hit = hitTest(this.scene, world, 4 / this.camera.zoom);
        d.endId = hit && hit.type !== 'connector' && hit.id !== d.startId ? hit.id : null;
        break;
      }
    }
    this.notify();
  }

  onPointerUp(screen: Vec, mods: Modifiers = NONE): void {
    const d = this.drag;
    if (!d) return;
    const world = this.toWorld(screen);
    this.drag = null;
    switch (d.kind) {
      case 'pan':
        break;
      case 'marquee':
        if (!d.moved && !d.additive) this.selection = [];
        break;
      case 'move':
        if (d.moved) {
          this.assignFrames(d.ids);
          this.endTx();
        } else {
          this.txSnap = null;
          // Plain click on an already-selected item narrows the selection to it.
          if (!d.shift && d.wasSelected) this.selection = [d.target];
        }
        break;
      case 'resize':
      case 'rotate':
        this.endTx();
        break;
      case 'create':
        this.commitCreate(d, world, mods);
        break;
      case 'pen':
        this.transact(() => {
          const s = this.penShape(d.points, newId('pen'));
          this.scene.add(s);
          this.assignFrames([s.id]);
          this.selection = [s.id];
        });
        this.tool = 'select';
        break;
      case 'connector':
        this.commitConnector(d, world);
        break;
    }
    this.notify();
  }

  onDoubleClick(screen: Vec): void {
    if (this.tool !== 'select') return;
    const world = this.toWorld(screen);
    const hit = hitTest(this.scene, world, 4 / this.camera.zoom);
    if (hit && hasText(hit)) this.startEditing(hit.id, false);
    else if (hit && hit.type === 'frame') this.startEditing(hit.id, false);
  }

  cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    if ((d.kind === 'move' || d.kind === 'resize' || d.kind === 'rotate') && d.snap) this.scene.restore(d.snap);
    this.txSnap = null;
    this.drag = null;
    this.notify();
  }

  // ---- creation helpers --------------------------------------------------

  private previewShape(d: Extract<Drag, { kind: 'create' }>): Shape | null {
    const box = boxFromPoints(d.start, d.current);
    if (box.w < 1 && box.h < 1) return null;
    return this.makeBoxed(d.type, box, d.start, d.current, 'preview');
  }

  private makeBoxed(type: 'rect' | 'ellipse' | 'frame' | 'line', box: Box, a: Vec, b: Vec, id: Id): Shape {
    const base = { id, parentId: null, x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0 };
    switch (type) {
      case 'rect':
        return { type, ...base, fill: SHAPE_FILL, stroke: SHAPE_STROKE };
      case 'ellipse':
        return { type, ...base, fill: SHAPE_FILL, stroke: SHAPE_STROKE };
      case 'frame':
        return { type, ...base, title: 'Frame' };
      case 'line':
        return { type, ...base, stroke: SHAPE_STROKE, points: [{ x: a.x - box.x, y: a.y - box.y }, { x: b.x - box.x, y: b.y - box.y }] };
    }
  }

  private commitCreate(d: Extract<Drag, { kind: 'create' }>, world: Vec, mods: Modifiers): void {
    let a = d.start;
    let b = world;
    if (mods.shift && d.type !== 'line') {
      const size = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      b = { x: a.x + Math.sign(b.x - a.x || 1) * size, y: a.y + Math.sign(b.y - a.y || 1) * size };
    }
    let box = boxFromPoints(a, b);
    if (box.w < 2 && box.h < 2) {
      if (d.type === 'line') return;
      const size = d.type === 'frame' ? { w: 400, h: 300 } : { w: 100, h: 100 };
      box = { x: a.x - size.w / 2, y: a.y - size.h / 2, ...size };
      a = { x: box.x, y: box.y };
      b = { x: box.x + box.w, y: box.y + box.h };
    }
    this.transact(() => {
      const shape = this.makeBoxed(d.type, box, a, b, newId(d.type));
      if (shape.type === 'frame') {
        this.scene.add(shape, 0);
        this.adoptIntoFrame(shape);
      } else {
        this.scene.add(shape);
        this.assignFrames([shape.id]);
      }
      this.selection = [shape.id];
    });
    this.tool = 'select';
  }

  private penShape(points: Vec[], id: Id): Shape {
    const b = boundsOfPoints(points);
    return {
      type: 'pen',
      id,
      parentId: null,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rotation: 0,
      stroke: SHAPE_STROKE,
      strokeWidth: 3,
      points: points.map((p) => ({ x: p.x - b.x, y: p.y - b.y })),
    };
  }

  private connectorPreview(d: Extract<Drag, { kind: 'connector' }>): { a: Vec; b: Vec } | null {
    if (dist(d.start, d.current) * this.camera.zoom < DRAG_THRESHOLD) return null;
    const startShape = d.startId ? this.scene.get(d.startId) : undefined;
    const endShape = d.endId ? this.scene.get(d.endId) : undefined;
    const endTarget = endShape ? boxCenter(this.scene.boundsOfShape(endShape)) : d.current;
    const a = startShape ? this.scene.edgePoint(startShape, endTarget) : d.start;
    const b = endShape ? this.scene.edgePoint(endShape, startShape ? boxCenter(this.scene.boundsOfShape(startShape)) : d.start) : d.current;
    return { a, b };
  }

  private commitConnector(d: Extract<Drag, { kind: 'connector' }>, world: Vec): void {
    if (dist(d.start, world) * this.camera.zoom < DRAG_THRESHOLD) return;
    this.transact(() => {
      const id = newId('connector');
      this.scene.add({
        type: 'connector',
        id,
        parentId: null,
        stroke: SHAPE_STROKE,
        start: { shapeId: d.startId, point: d.start },
        end: { shapeId: d.endId, point: world },
      });
      this.selection = [id];
    });
    this.tool = 'select';
  }

  private placeSticky(world: Vec): void {
    const fill = STICKY_COLORS[this.stickyColorIndex++ % STICKY_COLORS.length];
    this.transact(() => {
      const s: StickyShape = {
        type: 'sticky',
        id: newId('sticky'),
        parentId: null,
        x: world.x - STICKY_SIZE / 2,
        y: world.y - STICKY_SIZE / 2,
        w: STICKY_SIZE,
        h: STICKY_SIZE,
        rotation: 0,
        text: '',
        fill,
      };
      this.scene.add(s);
      this.assignFrames([s.id]);
      this.selection = [s.id];
    });
    this.tool = 'select';
  }

  private placeText(world: Vec): void {
    const s: TextShape = {
      type: 'text',
      id: newId('text'),
      parentId: null,
      x: world.x,
      y: world.y - 12,
      w: 240,
      h: 30,
      rotation: 0,
      text: '',
      fontSize: 18,
      color: SHAPE_STROKE,
    };
    const snap = this.scene.snapshot();
    this.scene.add(s);
    this.assignFrames([s.id]);
    this.selection = [s.id];
    this.tool = 'select';
    this.editing = { id: s.id, snap, fresh: true };
  }

  // ---- text editing ------------------------------------------------------

  startEditing(id: Id, fresh: boolean): void {
    const s = this.scene.get(id);
    if (!s || !(hasText(s) || s.type === 'frame')) return;
    if (this.editing) this.finishEditing();
    this.editing = { id, snap: this.scene.snapshot(), fresh };
    this.selection = [this.scene.topGroup(id)];
    this.notify();
  }

  editingText(): string {
    if (!this.editing) return '';
    const s = this.scene.get(this.editing.id);
    if (!s) return '';
    if (s.type === 'frame') return s.title;
    return hasText(s) ? s.text : '';
  }

  setEditingText(text: string): void {
    if (!this.editing) return;
    const s = this.scene.get(this.editing.id);
    if (!s) return;
    if (s.type === 'frame') this.scene.update<FrameShape>(s.id, { title: text });
    else if (hasText(s)) this.scene.update<StickyShape | TextShape>(s.id, { text });
    this.notify();
  }

  finishEditing(): void {
    const e = this.editing;
    if (!e) return;
    this.editing = null;
    const s = this.scene.get(e.id);
    if (s && s.type === 'text' && s.text.trim() === '') {
      this.scene.remove([s.id]);
    }
    if (sceneChanged(e.snap, this.scene.snapshot())) this.history.push(e.snap);
    this.afterChange();
  }

  // ---- editing commands --------------------------------------------------

  deleteSelection(): void {
    if (this.selection.length === 0) return;
    this.transact(() => {
      this.scene.remove(this.selection);
      this.selection = [];
    });
  }

  groupSelection(): Id | null {
    const ids = this.scene.normalizeSelection(this.selection);
    if (ids.length < 2) return null;
    return this.transact(() => {
      const parents = new Set(ids.map((id) => this.scene.mustGet(id).parentId));
      const parentId = parents.size === 1 ? [...parents][0] : null;
      const groupId = newId('group');
      const lowest = Math.min(...ids.map((id) => this.scene.indexOf(id)));
      this.scene.add({ type: 'group', id: groupId, parentId }, lowest);
      for (const id of ids) this.scene.setParent(id, groupId);
      this.selection = [groupId];
      return groupId;
    });
  }

  ungroupSelection(): void {
    const groups = this.selection.filter((id) => this.scene.get(id)?.type === 'group');
    if (groups.length === 0) return;
    this.transact(() => {
      const next: Id[] = this.selection.filter((id) => !groups.includes(id));
      for (const gid of groups) {
        const g = this.scene.mustGet(gid);
        for (const child of this.scene.children(gid)) {
          this.scene.setParent(child.id, g.parentId);
          next.push(child.id);
        }
        this.scene.remove([gid]);
      }
      this.selection = next;
    });
  }

  copy(): void {
    if (this.selection.length === 0) return;
    this.clipboard = collectForCopy(this.scene, this.selection);
    const text = JSON.stringify({ format: 'whiteboard-clip', shapes: this.clipboard });
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => undefined);
    }
    this.notify();
  }

  cut(): void {
    this.copy();
    this.deleteSelection();
  }

  paste(offset = 20): Id[] {
    const shapes = this.clipboard;
    if (!shapes || shapes.length === 0) return [];
    const d = offset / this.camera.zoom;
    return this.transact(() => {
      const source = new Scene();
      for (const s of shapes) source.add(s);
      const ids = pasteShapes(this.scene, source, shapes, d, d);
      this.assignFrames(ids);
      this.selection = ids;
      return ids;
    });
  }

  duplicate(): void {
    const keep = this.clipboard;
    this.copy();
    this.paste();
    this.clipboard = keep;
  }

  bringToFront(): void {
    this.transact(() => this.scene.bringToFront(this.selection));
  }

  sendToBack(): void {
    this.transact(() => this.scene.sendToBack(this.selection));
  }

  bringForward(): void {
    this.transact(() => this.scene.bringForward(this.selection));
  }

  sendBackward(): void {
    this.transact(() => this.scene.sendBackward(this.selection));
  }

  /** Re-parent moved top-level shapes into whichever frame now contains their centre. */
  assignFrames(ids: Iterable<Id>): void {
    const frames = this.scene.all().filter((s): s is FrameShape => s.type === 'frame');
    for (const id of ids) {
      const s = this.scene.get(id);
      if (!s || s.type === 'frame') continue;
      const top = this.scene.topGroup(id);
      const topShape = this.scene.mustGet(top);
      const parent = topShape.parentId === null ? null : this.scene.get(topShape.parentId);
      if (parent && parent.type !== 'frame') continue;
      const c = boxCenter(this.scene.bounds(top));
      let target: Id | null = null;
      for (let i = frames.length - 1; i >= 0; i--) {
        const f = frames[i];
        if (pointInBox(rotatePoint(c, boxCenter(f), -f.rotation), f)) {
          target = f.id;
          break;
        }
      }
      if (topShape.parentId !== target) this.scene.setParent(top, target);
    }
  }

  /** Give a new frame every top-level shape whose centre lies inside it. */
  private adoptIntoFrame(frame: FrameShape): void {
    for (const s of this.scene.all()) {
      if (s.id === frame.id || s.type === 'frame' || s.type === 'group') continue;
      const top = this.scene.topGroup(s.id);
      const topShape = this.scene.mustGet(top);
      if (topShape.parentId !== null) continue;
      if (pointInBox(boxCenter(this.scene.bounds(top)), frame)) this.scene.setParent(top, frame.id);
    }
  }

  private applyResize(d: Extract<Drag, { kind: 'resize' }>, world: Vec, keepAspect: boolean): void {
    const handle = d.handle as Exclude<HandleName, 'rotate'>;
    const from = d.frame.box;
    const rotation = d.frame.rotation;
    const center = boxCenter(from);
    const local = rotatePoint(world, center, -rotation);
    let x1 = from.x;
    let y1 = from.y;
    let x2 = from.x + from.w;
    let y2 = from.y + from.h;
    if (handle.includes('w')) x1 = local.x;
    if (handle.includes('e')) x2 = local.x;
    if (handle.includes('n')) y1 = local.y;
    if (handle.includes('s')) y2 = local.y;
    if (keepAspect && handle.length === 2 && from.w > 0 && from.h > 0) {
      const ratio = from.w / from.h;
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w / h > ratio) {
        const nh = w / ratio;
        if (handle.includes('n')) y1 = y2 - nh;
        else y2 = y1 + nh;
      } else {
        const nw = h * ratio;
        if (handle.includes('w')) x1 = x2 - nw;
        else x2 = x1 + nw;
      }
    }
    const nb = normalizeBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    nb.w = Math.max(nb.w, 1);
    nb.h = Math.max(nb.h, 1);
    if (d.single) {
      const nc = rotatePoint(boxCenter(nb), center, rotation);
      this.scene.setBox(d.single.id, { x: nc.x - nb.w / 2, y: nc.y - nb.h / 2, w: nb.w, h: nb.h });
    } else {
      this.scene.scaleShapes(d.ids, from, nb);
    }
  }

  // ---- keyboard ----------------------------------------------------------

  /** Returns true when the key was consumed. */
  onKeyDown(key: string, mods: Modifiers): boolean {
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (mods.ctrl) {
      switch (k) {
        case 'z':
          if (mods.shift) this.redo();
          else this.undo();
          return true;
        case 'y':
          this.redo();
          return true;
        case 'c':
          this.copy();
          return true;
        case 'x':
          this.cut();
          return true;
        case 'v':
          this.paste();
          return true;
        case 'd':
          this.duplicate();
          return true;
        case 'a':
          this.selectAll();
          return true;
        case 'g':
          if (mods.shift) this.ungroupSelection();
          else this.groupSelection();
          return true;
        case ']':
          this.bringToFront();
          return true;
        case '[':
          this.sendToBack();
          return true;
        case '0':
          this.resetCamera();
          return true;
        case '=':
        case '+':
          this.zoomBy(1.25);
          return true;
        case '-':
          this.zoomBy(0.8);
          return true;
        case '1':
          this.zoomToFit();
          return true;
      }
      return false;
    }
    switch (key) {
      case 'Delete':
      case 'Backspace':
        this.deleteSelection();
        return true;
      case 'Escape':
        if (this.drag) this.cancelDrag();
        else if (this.selection.length) this.clearSelection();
        else this.setTool('select');
        return true;
      case ']':
        this.bringForward();
        return true;
      case '[':
        this.sendBackward();
        return true;
      case '}':
        this.bringToFront();
        return true;
      case '{':
        this.sendToBack();
        return true;
      case '=':
      case '+':
        this.zoomBy(1.25);
        return true;
      case '-':
        this.zoomBy(0.8);
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (this.selection.length === 0) return false;
        const step = mods.shift ? 10 : 1;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        this.transact(() => {
          this.scene.translate(this.selection, dx, dy);
          this.assignFrames(this.selection);
        });
        return true;
      }
    }
    if (mods.shift && key === '!') {
      this.zoomToFit();
      return true;
    }
    const toolKeys: Record<string, Tool> = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', l: 'line', n: 'sticky', t: 'text', p: 'pen', c: 'connector', f: 'frame' };
    if (k in toolKeys && !mods.alt) {
      this.setTool(toolKeys[k]);
      return true;
    }
    return false;
  }

  setSpaceHeld(held: boolean): void {
    if (this.spaceHeld === held) return;
    this.spaceHeld = held;
    this.notify();
  }

  // ---- persistence -------------------------------------------------------

  toBoardFile(): BoardFile {
    return serializeScene(this.scene);
  }

  loadBoardFile(data: unknown): void {
    if (this.editing) this.finishEditing();
    const loaded = deserializeScene(data);
    this.transact(() => {
      this.scene.restore(loaded.snapshot());
      this.selection = [];
    });
  }

  exportPNGCanvas(scale = 1): HTMLCanvasElement {
    return renderToCanvas(this.scene, boardBounds(this.scene), scale);
  }
}

function sceneChanged(a: SceneSnapshot, b: SceneSnapshot): boolean {
  if (a.order.length !== b.order.length) return true;
  for (let i = 0; i < a.order.length; i++) if (a.order[i] !== b.order[i]) return true;
  if (a.shapes.size !== b.shapes.size) return true;
  for (const [id, s] of a.shapes) if (b.shapes.get(id) !== s) return true;
  return false;
}
