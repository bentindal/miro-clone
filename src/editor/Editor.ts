import {
  type Box,
  type Camera,
  type Vec,
  boxCenter,
  worldToScreen,
  boxFromPoints,
  boxesIntersect,
  boundsOfPoints,
  dist,
  fitCamera,
  normalizeBox,
  panCamera,
  pointInBox,
  rotatePoint,
  screenToWorld,
  visibleWorldBox,
  zoomCameraAt,
  zoomCameraBy,
} from '../model/geometry';
import * as Y from 'yjs';
import { hitTest, selectableAt, selectablesInBox } from '../model/hitTest';
import { Scene, type SceneSnapshot } from '../model/scene';
import { type BoardFile, deserializeScene, serializeScene } from '../model/serialize';
import {
  type Anchor,
  type BoxedShape,
  type ConnectorShape,
  type ConnectorStyle,
  type FrameShape,
  type ImageShape,
  type Id,
  type Shape,
  type StickyShape,
  type TextShape,
  hasText,
  isBoxed,
  newId,
} from '../model/types';
import {
  HANDLE_HIT_RADIUS,
  type HandleName,
  type Overlay,
  type RenderStats,
  type SelectionFrame,
  boardBounds,
  linkAtPoint,
  renderBoard,
  renderToCanvas,
  selectionFrame,
} from '../render/renderer';
import { type AlignKind, type Guide, type SpacingGuide, alignDeltas, computeSnap, distributeDeltas, snapEdges } from '../model/snap';
import { collectForCopy, pasteShapes } from './clipboard';
import { DocBinding } from '../sync/binding';
import { STICKY_PAD, fitText, requiredHeight, stickyTextBox, tagInset } from '../model/textFit';
import { type MarkKind, diffText, hasMarkOver, linkAt, remapMarks, toggleMark } from '../model/marks';
import { fitWithin, isImageDataUrl, rejectImage } from '../model/images';
import { CommentStore } from '../sync/comments';
import type { Tool } from './tools';
import { runShortcut } from './shortcuts';
import { toolCursor } from './cursors';
import { type StylePatch, patchFor } from './fields';

export type { StylePatch } from './fields';
import { type CanvasTheme, LIGHT_CANVAS_THEME, resolveCanvasTheme } from '../render/theme';

/** A comment pin as drawn on the canvas. */
export interface Pin {
  id: string;
  /** World position. */
  x: number;
  y: number;
  count: number;
  resolved: boolean;
  active: boolean;
}

/** A collaborator's presence as shown on the canvas. */
export interface Peer {
  clientId: number;
  name: string;
  color: string;
  cursor: Vec | null;
  selection: Id[];
}

export { type Tool, TOOLS } from './tools';

/** Id the comments panel registers itself under in the dock. */
export const COMMENTS_PANEL = 'comments';

/** Screen-pixel radius of a comment pin. */
export const PIN_RADIUS = 11;

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
  | { kind: 'connector'; startId: Id | null; startAnchor: Anchor; start: Vec; current: Vec; endId: Id | null; endAnchor: Anchor };

export interface EditingState {
  id: Id;
  /** Whether the shape was created by this edit (removed again if left empty). */
  fresh: boolean;
}

const DRAG_THRESHOLD = 3;
/** Screen-pixel distance within which a moved object snaps to a neighbour. */
const SNAP_THRESHOLD = 6;
export const GRID_SIZE = 20;
/** Screen-pixel radius within which a connector end snaps to a side anchor. */
const ANCHOR_SNAP = 12;
const STICKY_SIZE = 120;
const STICKY_COLORS = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#f48fb1'];
const SHAPE_FILL = '#ffffff';
const SHAPE_STROKE = '#222222';

export class Editor {
  readonly scene = new Scene();
  /** Shared document; the scene is a view over it. */
  readonly doc: Y.Doc;
  /** Origin tag for this editor's own transactions. */
  readonly origin = { editor: true };
  readonly binding: DocBinding;
  readonly undoManager: Y.UndoManager;
  readonly comments: CommentStore;
  /** Thread open in the comments panel. */
  activeThreadId: string | null = null;
  /** A comment being composed that has no message yet. */
  pendingComment: { shapeId: Id | null; x: number; y: number } | null = null;
  /** Panel open in the dock, by its registered id, or null for none. */
  openPanel: string | null = null;

  /** The command palette lives here rather than in a component, so a command can open it. */
  paletteOpen = false;

  /** Whether the minimap is showing. Here for the same reason the palette is. */
  minimapOpen = true;
  showResolved = false;
  /** Viewers can look and point but not change anything. The server enforces this too. */
  readOnly = false;
  /** Other people on this board, for rendering cursors and selections. */
  peers: Peer[] = [];
  /** Last known pointer position in world coordinates, for presence. */
  pointerWorld: Vec | null = null;
  /**
   * Width in pixels the floating chrome takes off each side of the canvas.
   * The rail and the dock report their own footprint, so anything that has to
   * stay clear of them (the property bar today) does not need to know what is
   * there.
   */
  insets: { left: number; right: number } = { left: 0, right: 0 };
  camera: Camera = { tx: 0, ty: 0, zoom: 1 };
  selection: Id[] = [];
  tool: Tool = 'select';
  hoverId: Id | null = null;
  editing: EditingState | null = null;
  viewport = { w: 1, h: 1 };
  spaceHeld = false;
  clipboard: Shape[] | null = null;
  /** Style applied to newly drawn connectors. */
  connectorStyle: ConnectorStyle = 'straight';
  /** Snap moved objects to a grid when no neighbouring edge is close. */
  gridSnap = false;
  /** Guide lines from the current snap, drawn while moving or resizing. */
  guides: Guide[] = [];
  /** Equal-gap markers from the current snap. */
  spacingGuides: SpacingGuide[] = [];
  lastRenderStats: RenderStats = { drawn: 0, culled: 0 };
  lastRenderMs = 0;
  private drag: Drag | null = null;
  private pinch: { center: Vec; span: number } | null = null;
  private txSnap: SceneSnapshot | null = null;
  /** Undo stack depth when the current pointer step began, to drop steps that changed nothing. */
  private txUndoDepth = 0;
  private listeners = new Set<() => void>();
  /** Called on every pointer move, without a full change notification. */
  private pointerListeners = new Set<() => void>();
  private version = 0;
  private canvas: HTMLCanvasElement | null = null;
  /** Canvas colours resolved from the CSS tokens; see src/render/theme.ts. */
  theme: CanvasTheme = LIGHT_CANVAS_THEME;
  private measureCtx: CanvasRenderingContext2D | null = null;
  /** The context layout measurement uses: the board's, or a scratch one. */
  private ctxForMeasure(): CanvasRenderingContext2D | null {
    if (!this.measureCtx) this.measureCtx = (this.canvas ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null))?.getContext('2d') ?? null;
    return this.measureCtx;
  }

  /** Text measurement for layout decisions; uses the board canvas, falls back to a rough estimate. */
  private readonly measure = (text: string, font: string): number => {
    const ctx = this.ctxForMeasure();
    if (!ctx) return text.length * parseFloat(font) * 0.6;
    ctx.font = font;
    return ctx.measureText(text).width;
  };
  private renderHandle: number | null = null;
  private stickyColorIndex = 0;

  constructor(doc = new Y.Doc()) {
    this.doc = doc;
    this.binding = new DocBinding(doc, this.scene, this.origin, () => this.afterChange());
    this.undoManager = new Y.UndoManager([this.binding.shapes, this.binding.order, this.binding.meta], {
      trackedOrigins: new Set([this.origin]),
      // Consecutive writes merge into one undo step until `stopCapturing` marks a boundary.
      captureTimeout: Number.MAX_SAFE_INTEGER,
    });
    this.undoManager.on('stack-item-popped', () => this.notify());
    this.comments = new CommentStore(doc, this.origin);
    this.comments.subscribe(() => this.notify());
  }

  // ---- comments ----------------------------------------------------------

  /** Pins for every thread (resolved ones only when shown), positioned by their shape when it still exists. */
  pins(): Pin[] {
    const out: Pin[] = [];
    for (const t of this.comments.list()) {
      if (t.resolved && !this.showResolved) continue;
      let x = t.x;
      let y = t.y;
      if (t.shapeId && this.scene.has(t.shapeId)) {
        const b = this.scene.bounds(t.shapeId);
        x = b.x + b.w;
        y = b.y;
      }
      out.push({ id: t.id, x, y, count: t.messages.length, resolved: t.resolved, active: t.id === this.activeThreadId });
    }
    return out;
  }

  private pinForPending(): Vec {
    const p = this.pendingComment!;
    if (p.shapeId && this.scene.has(p.shapeId)) {
      const b = this.scene.bounds(p.shapeId);
      return { x: b.x + b.w, y: b.y };
    }
    return { x: p.x, y: p.y };
  }

  /** The pin under a screen point, if any. */
  pinAt(screen: Vec): Pin | null {
    for (const pin of this.pins().reverse()) {
      const p = worldToScreen(this.camera, { x: pin.x, y: pin.y });
      if (dist(p, screen) <= PIN_RADIUS + 2) return pin;
    }
    return null;
  }

  /** True while the comments panel is the one open in the dock. */
  get commentsOpen(): boolean {
    return this.openPanel === COMMENTS_PANEL;
  }

  openThread(id: string | null): void {
    this.activeThreadId = id;
    this.pendingComment = null;
    if (id) this.openPanel = COMMENTS_PANEL;
    this.notify();
  }

  /** Show a registered panel in the dock, or close the dock with null. */
  setPaletteOpen(open: boolean): void {
    if (this.paletteOpen === open) return;
    this.paletteOpen = open;
    this.notify();
  }

  setMinimapOpen(open: boolean): void {
    if (this.minimapOpen === open) return;
    this.minimapOpen = open;
    this.notify();
  }

  setOpenPanel(id: string | null): void {
    const wasComments = this.commentsOpen;
    this.openPanel = id;
    if (wasComments && id !== COMMENTS_PANEL) {
      this.activeThreadId = null;
      this.pendingComment = null;
    }
    this.notify();
  }

  setCommentsOpen(open: boolean): void {
    this.setOpenPanel(open ? COMMENTS_PANEL : null);
  }

  setShowResolved(show: boolean): void {
    this.showResolved = show;
    this.notify();
  }

  /** Start composing a comment at a world point, anchored to the shape there if any. */
  beginComment(world: Vec): void {
    if (this.readOnly) return;
    const hit = hitTest(this.scene, world, 4 / this.camera.zoom);
    this.pendingComment = { shapeId: hit ? hit.id : null, x: world.x, y: world.y };
    this.activeThreadId = null;
    this.openPanel = COMMENTS_PANEL;
    this.tool = 'select';
    this.notify();
  }

  cancelComment(): void {
    this.pendingComment = null;
    this.notify();
  }

  /** Post the pending comment's first message; returns the new thread id. */
  postComment(author: { name: string; color: string }, text: string): string | null {
    const pending = this.pendingComment;
    if (!pending || this.readOnly || !text.trim()) return null;
    const id = this.comments.create(pending, { author: author.name, color: author.color, text: text.trim() });
    this.pendingComment = null;
    this.activeThreadId = id;
    this.notify();
    return id;
  }

  replyToThread(id: string, author: { name: string; color: string }, text: string): void {
    if (this.readOnly || !text.trim()) return;
    this.comments.reply(id, { author: author.name, color: author.color, text: text.trim() });
  }

  resolveThread(id: string, resolved: boolean): void {
    if (this.readOnly) return;
    this.comments.setResolved(id, resolved);
    if (resolved && this.activeThreadId === id) this.activeThreadId = null;
    this.notify();
  }

  /** Populate from a synced document (or seed the document from this scene). */
  adoptDocument(): void {
    this.binding.adoptDocument();
    this.undoManager.clear();
    this.notify();
  }

  get canUndo(): boolean {
    return this.undoManager.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.undoManager.redoStack.length > 0;
  }

  get title(): string {
    return this.binding.title;
  }

  setTitle(title: string): void {
    if (this.readOnly) return;
    this.undoManager.stopCapturing();
    this.binding.setTitle(title);
    this.notify();
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.binding.writable = !readOnly;
    if (readOnly) {
      this.cancelDrag();
      if (this.editing) this.finishEditing();
      if (this.tool !== 'select' && this.tool !== 'hand') this.tool = 'select';
    }
    this.notify();
  }

  setPeers(peers: Peer[]): void {
    this.peers = peers;
    this.notify();
  }

  // ---- subscriptions -----------------------------------------------------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getVersion(): number {
    return this.version;
  }

  /** Subscribe to pointer movement (for presence); cheaper than `subscribe`. */
  onPointer(fn: () => void): () => void {
    this.pointerListeners.add(fn);
    return () => this.pointerListeners.delete(fn);
  }

  /** True while a pointer drag (move, resize, draw, marquee, pan) is in progress. */
  get isDragging(): boolean {
    return this.drag !== null;
  }

  private notify(): void {
    this.binding.pushLocal();
    this.version++;
    for (const fn of this.listeners) fn();
    this.requestRender();
  }

  // ---- rendering ---------------------------------------------------------

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    if (canvas) this.refreshTheme();
    this.requestRender();
  }

  /**
   * Re-read the canvas colours from the stylesheet. Call after anything that
   * changes which tokens apply, such as switching theme.
   */
  refreshTheme(): void {
    this.theme = resolveCanvasTheme(this.canvas);
    this.requestRender();
  }

  /** Report how much room a piece of floating chrome takes on one side. */
  setInset(side: 'left' | 'right', px: number): void {
    if (this.insets[side] === px) return;
    this.insets = { ...this.insets, [side]: px };
    this.notify();
  }

  setViewport(w: number, h: number): void {
    if (this.viewport.w === w && this.viewport.h === h) return;
    this.viewport = { w, h };
    this.notify();
  }

  requestRender(): void {
    if (this.renderHandle !== null || typeof requestAnimationFrame !== 'function') return;
    this.renderHandle = requestAnimationFrame(() => {
      this.renderHandle = null;
      this.renderNow();
    });
  }

  /** Synchronously draw the board; returns the time spent in milliseconds. */
  renderNow(): number {
    if (this.renderHandle !== null) {
      cancelAnimationFrame(this.renderHandle);
      this.renderHandle = null;
    }
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
    this.lastRenderStats = renderBoard(ctx, this.scene, this.camera, w, h, this.overlay(), this.theme);
    this.lastRenderMs = performance.now() - t0;
    return this.lastRenderMs;
  }

  overlay(): Overlay {
    const d = this.drag;
    return {
      selection: this.selection,
      hoverId: this.hoverId,
      marquee: d?.kind === 'marquee' && d.moved ? boxFromPoints(d.start, d.current) : null,
      preview:
        d?.kind === 'create'
          ? this.previewShape(d)
          : d?.kind === 'pen'
            ? this.penShape(d.points, 'preview')
            : d?.kind === 'connector'
              ? this.connectorPreview(d)
              : null,
      anchorTargetId: d?.kind === 'connector' ? (d.endId ?? (dist(d.start, d.current) * this.camera.zoom < DRAG_THRESHOLD ? d.startId : null)) : null,
      guides: this.guides,
      spacingGuides: this.spacingGuides,
      peers: this.peers,
      pins: this.pins(),
      pendingPin: this.pendingComment ? this.pinForPending() : null,
      editingId: this.editing?.id ?? null,
    };
  }

  // ---- history -----------------------------------------------------------

  /** Run `fn` as one undoable step. Does nothing in read-only mode. */
  transact<T>(fn: () => T): T | undefined {
    if (this.readOnly) return undefined;
    this.undoManager.stopCapturing();
    const result = fn();
    this.afterChange();
    return result;
  }

  /** Start a pointer-driven step; returns the scene as it was for incremental re-application. */
  private beginTx(): SceneSnapshot {
    this.undoManager.stopCapturing();
    this.txSnap = this.scene.snapshot();
    this.txUndoDepth = this.undoManager.undoStack.length;
    return this.txSnap;
  }

  private endTx(): void {
    const snap = this.txSnap;
    this.txSnap = null;
    this.binding.pushLocal();
    // A drag that ends where it started (or was cancelled) must not leave an empty undo step.
    if (snap && !sceneChanged(snap, this.scene.snapshot())) this.dropStepsSince(this.txUndoDepth);
    this.afterChange();
  }

  private dropStepsSince(depth: number): void {
    const stack = this.undoManager.undoStack;
    if (stack.length > depth) stack.splice(depth);
  }

  private afterChange(): void {
    this.selection = this.selection.filter((id) => this.scene.has(id));
    if (this.hoverId && !this.scene.has(this.hoverId)) this.hoverId = null;
    this.notify();
  }

  undo(): boolean {
    if (this.readOnly) return false;
    if (this.editing) this.finishEditing();
    if (!this.canUndo) return false;
    this.undoManager.undo();
    this.afterChange();
    return true;
  }

  redo(): boolean {
    if (this.readOnly) return false;
    if (this.editing) this.finishEditing();
    if (!this.canRedo) return false;
    this.undoManager.redo();
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

  /** Fill the viewport with the selection, which is `zoomToFit` over fewer shapes. */
  zoomToSelection(): void {
    if (this.selection.length === 0) return;
    this.setCamera(fitCamera(this.scene.boundsOfMany(this.selection), this.viewport.w, this.viewport.h));
  }

  /** Put a world point in the middle of the viewport, keeping the zoom. */
  centerOn(world: Vec): void {
    this.setCamera({
      zoom: this.camera.zoom,
      tx: this.viewport.w / 2 - world.x * this.camera.zoom,
      ty: this.viewport.h / 2 - world.y * this.camera.zoom,
    });
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

  // ---- two-finger gestures -----------------------------------------------

  /** True while a two-finger pan/pinch gesture is in progress. */
  get isPinching(): boolean {
    return this.pinch !== null;
  }

  /** Start a two-finger gesture from two screen points. Cancels any single-pointer drag. */
  beginPinch(a: Vec, b: Vec): void {
    this.cancelDrag();
    this.pinch = { center: midpoint(a, b), span: Math.max(dist(a, b), 1) };
    this.notify();
  }

  /** Update a two-finger gesture: pan by the centroid's movement, zoom by the change in finger distance. */
  updatePinch(a: Vec, b: Vec): void {
    const g = this.pinch;
    if (!g) return;
    const center = midpoint(a, b);
    const span = Math.max(dist(a, b), 1);
    let cam = panCamera(this.camera, center.x - g.center.x, center.y - g.center.y);
    cam = zoomCameraBy(cam, span / g.span, center);
    g.center = center;
    g.span = span;
    this.setCamera(cam);
  }

  endPinch(): void {
    if (!this.pinch) return;
    this.pinch = null;
    this.notify();
  }

  // ---- selection & tools -------------------------------------------------

  setTool(tool: Tool): void {
    if (this.editing) this.finishEditing();
    this.tool = tool;
    this.drag = null;
    this.notify();
  }

  /**
   * What a right-click should act on: whatever is under the pointer, unless
   * it is already part of the selection. Clicking away clears, so the menu
   * cannot offer to delete something the person is not looking at.
   */
  selectForContext(screen: Vec): void {
    const target = selectableAt(this.scene, this.toWorld(screen), 4 / this.camera.zoom);
    if (!target) {
      if (this.selection.length) this.clearSelection();
      return;
    }
    if (!this.selection.includes(target)) this.select([target]);
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

  /** Top-level selectable ids in z-order (groups collapse to one entry). */
  selectables(): Id[] {
    return this.scene.normalizeSelection(this.scene.all().filter((s) => s.type !== 'group').map((s) => s.id));
  }

  /**
   * Move the selection to the next (or previous) object in z-order.
   * Returns false when the cycle would wrap, so the caller can let keyboard
   * focus leave the canvas instead.
   */
  selectNext(direction: 1 | -1): boolean {
    const items = this.selectables();
    if (items.length === 0) return false;
    const current = this.selection.length === 1 ? items.indexOf(this.selection[0]) : -1;
    let next: number;
    if (current === -1) next = direction === 1 ? 0 : items.length - 1;
    else {
      next = current + direction;
      if (next < 0 || next >= items.length) return false;
    }
    this.select([items[next]]);
    return true;
  }

  /** Open the text editor for a single selected text-bearing object or frame. Returns true if it did. */
  activateSelection(): boolean {
    if (this.selection.length !== 1) return false;
    const s = this.scene.get(this.selection[0]);
    if (!s || !(hasText(s) || s.type === 'frame' || s.type === 'connector')) return false;
    this.startEditing(s.id, false);
    return true;
  }

  /** Short human description of the current selection for assistive technology. */
  describeSelection(): string {
    if (this.editing) return 'Editing text';
    const items = this.selectables();
    if (this.selection.length === 0) return items.length === 0 ? 'Empty board' : `Nothing selected, ${items.length} objects`;
    if (this.selection.length > 1) return `${this.selection.length} objects selected`;
    const id = this.selection[0];
    const s = this.scene.get(id);
    if (!s) return 'Nothing selected';
    const index = items.indexOf(id) + 1;
    return `Selected ${describeShape(s)}, ${index} of ${items.length}`;
  }

  get selectionFrame(): SelectionFrame | null {
    return selectionFrame(this.scene, this.selection, this.camera);
  }

  handleAt(screen: Vec): HandleName | null {
    if (this.tool !== 'select' || this.readOnly) return null;
    const frame = this.selectionFrame;
    if (!frame) return null;
    const r = HANDLE_HIT_RADIUS;
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
    if (this.tool !== 'select') return toolCursor(this.tool, this.theme) ?? 'crosshair';
    if (this.pinAt(screen)) return 'pointer';
    // A link that does not look clickable is not a link.
    if (this.linkAt(this.toWorld(screen))) return 'pointer';
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
    if (this.readOnly && this.tool !== 'select') {
      this.tool = 'select';
    }
    if (this.tool === 'comment') {
      this.beginComment(world);
      return;
    }
    if (this.tool === 'select') {
      const pin = this.pinAt(screen);
      if (pin) {
        this.openThread(pin.id);
        return;
      }
      const href = this.linkAt(world);
      if (href) {
        this.openLink(href);
        return;
      }
    }
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
        const startAnchor = hit && startId ? (this.scene.nearestAnchor(hit, world, ANCHOR_SNAP / this.camera.zoom) ?? 'auto') : 'auto';
        this.drag = { kind: 'connector', startId, startAnchor, start: world, current: world, endId: null, endAnchor: 'auto' };
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

  /**
   * The link under a world point, but only on a shape that is already
   * selected. A first click selects the shape and a second follows the link,
   * so text with a link in it can still be picked up and moved.
   */
  linkAt(world: Vec): string {
    const ctx = this.ctxForMeasure();
    if (!ctx) return '';
    for (const id of this.selection) {
      const s = this.scene.get(id);
      if (!s || !hasText(s)) continue;
      const href = linkAtPoint(ctx, s, world);
      if (href) return href;
    }
    return '';
  }

  /** Follow a link, in a new tab that cannot reach back into this one. */
  openLink(href: string): void {
    if (typeof window === 'undefined') return;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  private selectPointerDown(screen: Vec, world: Vec, mods: Modifiers): void {
    const handle = this.handleAt(screen);
    const frame = this.selectionFrame;
    if (handle && frame && !this.readOnly) {
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
      if (this.selection.includes(target) && !this.readOnly) {
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
    this.pointerWorld = world;
    for (const fn of this.pointerListeners) fn();
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
        this.guides = [];
        this.spacingGuides = [];
        if (!mods.alt) {
          const snap = this.snapMove(d.ids, dx, dy);
          dx += snap.dx;
          dy += snap.dy;
          this.guides = snap.guides;
          this.spacingGuides = snap.spacing;
        }
        this.scene.translate(d.ids, dx, dy);
        break;
      }
      case 'resize':
        this.scene.restore(d.snap);
        this.guides = [];
        this.spacingGuides = [];
        this.applyResize(d, world, mods.shift, !mods.alt);
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
        d.endAnchor = hit && d.endId ? (this.scene.nearestAnchor(hit, world, ANCHOR_SNAP / this.camera.zoom) ?? 'auto') : 'auto';
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
        this.guides = [];
        this.spacingGuides = [];
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
        this.guides = [];
        this.spacingGuides = [];
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
    if (hit && (hasText(hit) || hit.type === 'frame' || hit.type === 'connector')) this.startEditing(hit.id, false);
  }

  cancelDrag(): void {
    const d = this.drag;
    this.guides = [];
    this.spacingGuides = [];
    if (!d) return;
    this.drag = null;
    if ((d.kind === 'move' || d.kind === 'resize' || d.kind === 'rotate') && d.snap) {
      this.scene.restore(d.snap);
      this.endTx();
      return;
    }
    this.txSnap = null;
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
        return { type, ...base, fill: SHAPE_FILL, stroke: SHAPE_STROKE, strokeWidth: 2 };
      case 'ellipse':
        return { type, ...base, fill: SHAPE_FILL, stroke: SHAPE_STROKE, strokeWidth: 2 };
      case 'frame':
        return { type, ...base, title: 'Frame' };
      case 'line':
        return {
          type,
          ...base,
          stroke: SHAPE_STROKE,
          strokeWidth: 2,
          points: [
            { x: a.x - box.x, y: a.y - box.y },
            { x: b.x - box.x, y: b.y - box.y },
          ],
        };
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

  private connectorFromDrag(d: Extract<Drag, { kind: 'connector' }>, end: Vec, id: Id): ConnectorShape {
    return {
      type: 'connector',
      id,
      parentId: null,
      stroke: SHAPE_STROKE,
      strokeWidth: 2,
      style: this.connectorStyle,
      startArrow: 'none',
      endArrow: 'arrow',
      label: '',
      start: { shapeId: d.startId, point: d.start, anchor: d.startId ? d.startAnchor : 'auto' },
      end: { shapeId: d.endId, point: end, anchor: d.endId ? d.endAnchor : 'auto' },
    };
  }

  private connectorPreview(d: Extract<Drag, { kind: 'connector' }>): ConnectorShape | null {
    if (dist(d.start, d.current) * this.camera.zoom < DRAG_THRESHOLD) return null;
    return this.connectorFromDrag(d, d.current, 'preview');
  }

  private commitConnector(d: Extract<Drag, { kind: 'connector' }>, world: Vec): void {
    if (dist(d.start, world) * this.camera.zoom < DRAG_THRESHOLD) return;
    this.transact(() => {
      const c = this.connectorFromDrag(d, world, newId('connector'));
      this.scene.add(c);
      this.selection = [c.id];
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
        align: 'center',
        valign: 'middle',
        votes: [],
        tags: [],
        marks: [],
        list: 'none',
      };
      this.scene.add(s);
      this.assignFrames([s.id]);
      this.selection = [s.id];
    });
    this.tool = 'select';
  }

  /**
   * Put a picture on the board, centred on `world`. Returns the reason it
   * could not be, so the caller can say so where the person is looking; the
   * editor has no opinion about how a failure is shown.
   */
  async insertImage(file: File, world: Vec): Promise<string | null> {
    const refused = rejectImage(file);
    if (refused) return refused;
    let src: string;
    try {
      src = await readAsDataURL(file);
    } catch {
      return `${file.name || 'That file'} could not be read`;
    }
    if (!isImageDataUrl(src)) return `${file.name || 'That file'} is not an image this board can show`;
    const natural = await measureImage(src);
    if (!natural) return `${file.name || 'That file'} could not be decoded`;
    const size = fitWithin(natural.w, natural.h);
    const shape: ImageShape = {
      type: 'image',
      id: newId('img'),
      parentId: null,
      x: world.x - size.w / 2,
      y: world.y - size.h / 2,
      w: size.w,
      h: size.h,
      rotation: 0,
      src,
      // The file name is a poor description, but it is the only one anybody
      // supplied, and it beats an empty label in the screen reader.
      alt: file.name ? file.name.replace(/\.[^.]+$/, '') : '',
    };
    this.transact(() => {
      this.scene.add(shape);
      this.assignFrames([shape.id]);
      this.selection = [shape.id];
    });
    return null;
  }

  private placeText(world: Vec): void {
    if (this.readOnly) return;
    this.undoManager.stopCapturing();
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
      marks: [],
      list: 'none',
      fontSize: 18,
      color: SHAPE_STROKE,
    };
    this.scene.add(s);
    this.assignFrames([s.id]);
    this.selection = [s.id];
    this.tool = 'select';
    this.editing = { id: s.id, fresh: true };
  }

  // ---- text editing ------------------------------------------------------

  startEditing(id: Id, fresh: boolean): void {
    if (this.readOnly) return;
    const s = this.scene.get(id);
    if (!s || !(hasText(s) || s.type === 'frame' || s.type === 'connector')) return;
    if (this.editing) this.finishEditing();
    this.undoManager.stopCapturing();
    this.editing = { id, fresh };
    this.selection = [this.scene.topGroup(id)];
    this.notify();
  }

  editingText(): string {
    if (!this.editing) return '';
    const s = this.scene.get(this.editing.id);
    if (!s) return '';
    if (s.type === 'frame') return s.title;
    if (s.type === 'connector') return s.label;
    return hasText(s) ? s.text : '';
  }

  setEditingText(text: string): void {
    if (!this.editing) return;
    const s = this.scene.get(this.editing.id);
    if (!s) return;
    if (s.type === 'frame') this.scene.update<FrameShape>(s.id, { title: text });
    else if (s.type === 'connector') this.scene.update<ConnectorShape>(s.id, { label: text.replace(/\n/g, ' ') });
    else if (hasText(s)) {
      // Formatting is ranges over this string, so it has to move with the
      // edit or the bold would end up on the wrong words.
      const marks = remapMarks(s.marks, diffText(s.text, text), text.length);
      if (s.type === 'sticky') {
        // The note shrinks its font to fit; once it cannot shrink further it grows taller instead.
        // Tags take a row off the top, so both the fit and the grown height are
        // worked out against the box the text actually gets.
        const box = stickyTextBox(s);
        const styled = { marks, list: s.list };
        const fit = fitText(text, box.w, box.h, STICKY_PAD, this.measure, styled);
        const h = fit.overflow ? Math.max(s.h, requiredHeight(text, box.w, STICKY_PAD, this.measure, styled) + tagInset(s.tags)) : s.h;
        this.scene.update<StickyShape>(s.id, { text, marks, h });
      } else this.scene.update<TextShape>(s.id, { text, marks });
    }
    this.notify();
  }

  /**
   * Turn a kind of formatting on or off over a range of the text being
   * edited. The range comes from the textarea's own selection, which is the
   * only place that knows what the person has highlighted.
   */
  applyMark(kind: MarkKind, from: number, to: number, href = ''): void {
    const s = this.editing ? this.scene.get(this.editing.id) : undefined;
    if (!s || !hasText(s) || this.readOnly) return;
    this.transact(() => this.scene.update<StickyShape | TextShape>(s.id, { marks: toggleMark(s.marks, kind, from, to, href) }));
  }

  /** Whether every character in the range already carries `kind`. */
  markedOver(kind: MarkKind, from: number, to: number): boolean {
    const s = this.editing ? this.scene.get(this.editing.id) : undefined;
    return s !== undefined && hasText(s) && hasMarkOver(s.marks, kind, from, to);
  }

  /** The link on the range being edited, if the whole of it is one link. */
  linkOver(from: number, to: number): string {
    const s = this.editing ? this.scene.get(this.editing.id) : undefined;
    if (!s || !hasText(s) || !hasMarkOver(s.marks, 'link', from, to)) return '';
    return linkAt(s.marks, from);
  }

  finishEditing(): void {
    const e = this.editing;
    if (!e) return;
    this.editing = null;
    const s = this.scene.get(e.id);
    if (s && s.type === 'text' && s.text.trim() === '') {
      this.scene.remove([s.id]);
    }
    this.afterChange();
  }

  // ---- editing commands --------------------------------------------------

  /** Toggle the given person's vote on every selected sticky note. */
  toggleVote(voter: string): void {
    if (this.readOnly || !voter) return;
    const stickies = this.selection.flatMap((id) => this.scene.leaves(id)).filter((id) => this.scene.get(id)?.type === 'sticky');
    if (stickies.length === 0) return;
    // If every selected note already has the vote, remove it; otherwise add it where missing.
    const all = stickies.every((id) => (this.scene.mustGet(id) as StickyShape).votes.includes(voter));
    this.transact(() => {
      for (const id of stickies) {
        const s = this.scene.mustGet(id) as StickyShape;
        const votes = all ? s.votes.filter((v) => v !== voter) : s.votes.includes(voter) ? s.votes : [...s.votes, voter];
        this.scene.update<StickyShape>(id, { votes });
      }
    });
  }

  /**
   * Apply style properties to every leaf in the selection that supports them.
   * One undo step for the whole selection.
   */
  /**
   * Apply a patch to every selected leaf that has the properties in it. Which
   * shape types have which property is declared once, in `fields.ts`, so this
   * does not grow when a property is added.
   */
  setStyle(patch: StylePatch): void {
    const leaves = new Set<Id>();
    for (const id of this.selection) for (const leaf of this.scene.leaves(id)) leaves.add(leaf);
    if (leaves.size === 0) return;
    // New connectors keep the last style picked.
    if (patch.connectorStyle) this.connectorStyle = patch.connectorStyle;
    this.transact(() => {
      for (const id of leaves) {
        const shape = this.scene.mustGet(id);
        // Typed at the field; the shape's own type is restored by `Scene.update`.
        const next = patchFor(shape, patch);
        if (Object.keys(next).length > 0) this.scene.update(id, next as Partial<Omit<Shape, 'id' | 'type'>>);
      }
    });
  }

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
    return (
      this.transact(() => {
        const parents = new Set(ids.map((id) => this.scene.mustGet(id).parentId));
        const parentId = parents.size === 1 ? [...parents][0] : null;
        const groupId = newId('group');
        const lowest = Math.min(...ids.map((id) => this.scene.indexOf(id)));
        this.scene.add({ type: 'group', id: groupId, parentId }, lowest);
        for (const id of ids) this.scene.setParent(id, groupId);
        this.selection = [groupId];
        return groupId;
      }) ?? null
    );
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
    return (
      this.transact(() => {
        const source = new Scene();
        for (const s of shapes) source.add(s);
        const ids = pasteShapes(this.scene, source, shapes, d, d);
        this.assignFrames(ids);
        this.selection = ids;
        return ids;
      }) ?? []
    );
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

  /**
   * Snap correction for moving `ids` by (dx, dy): compares the moved bounds
   * against every other object near the viewport.
   */
  private snapMove(ids: Id[], dx: number, dy: number): { dx: number; dy: number; guides: Guide[]; spacing: SpacingGuide[] } {
    const b = this.scene.boundsOfMany(ids);
    const movedBox = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
    return computeSnap(movedBox, this.snapTargets(ids), SNAP_THRESHOLD / this.camera.zoom, this.gridSnap ? GRID_SIZE : null);
  }

  /** Bounds of every other object near the viewport, the things a drag can snap to. */
  private snapTargets(excluding: Iterable<Id>): Box[] {
    const skip = new Set<Id>();
    for (const id of excluding) {
      skip.add(id);
      for (const d of this.scene.descendants(id)) skip.add(d);
    }
    const view = visibleWorldBox(this.camera, this.viewport.w, this.viewport.h);
    const margin = Math.max(view.w, view.h);
    const region = { x: view.x - margin, y: view.y - margin, w: view.w + 2 * margin, h: view.h + 2 * margin };
    const others: Box[] = [];
    for (const s of this.scene.all()) {
      if (skip.has(s.id) || s.type === 'group' || s.type === 'connector') continue;
      const sb = this.scene.boundsOfShape(s);
      if (boxesIntersect(sb, region)) others.push(sb);
    }
    return others;
  }

  setGridSnap(on: boolean): void {
    this.gridSnap = on;
    this.notify();
  }

  /** Align the selected top-level objects on an edge or centre of their union. */
  align(kind: AlignKind): void {
    const ids = this.scene.normalizeSelection(this.selection);
    if (ids.length < 2) return;
    const deltas = alignDeltas(ids.map((id) => this.scene.bounds(id)), kind);
    this.transact(() => {
      ids.forEach((id, i) => this.scene.translate([id], deltas[i].dx, deltas[i].dy));
      this.assignFrames(ids);
    });
  }

  /** Space the selected top-level objects evenly along an axis. */
  distribute(axis: 'x' | 'y'): void {
    const ids = this.scene.normalizeSelection(this.selection);
    if (ids.length < 3) return;
    const deltas = distributeDeltas(ids.map((id) => this.scene.bounds(id)), axis);
    this.transact(() => {
      ids.forEach((id, i) => this.scene.translate([id], deltas[i].dx, deltas[i].dy));
      this.assignFrames(ids);
    });
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

  private applyResize(d: Extract<Drag, { kind: 'resize' }>, world: Vec, keepAspect: boolean, snap: boolean): void {
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
    // Snap the dragged edges to neighbours (unrotated boxes only; a rotated edge has no axis to snap on).
    if (snap && rotation === 0 && !keepAspect) {
      const box = normalizeBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      const flippedX = x2 < x1;
      const flippedY = y2 < y1;
      const edges = {
        left: handle.includes(flippedX ? 'e' : 'w'),
        right: handle.includes(flippedX ? 'w' : 'e'),
        top: handle.includes(flippedY ? 's' : 'n'),
        bottom: handle.includes(flippedY ? 'n' : 's'),
      };
      const r = snapEdges(box, edges, this.snapTargets(d.ids), SNAP_THRESHOLD / this.camera.zoom, this.gridSnap ? GRID_SIZE : null);
      const setX = (edge: 'w' | 'e', value: number) => {
        if (edge === 'w') x1 = value;
        else x2 = value;
      };
      const setY = (edge: 'n' | 's', value: number) => {
        if (edge === 'n') y1 = value;
        else y2 = value;
      };
      if (r.left !== undefined) setX(flippedX ? 'e' : 'w', r.left);
      if (r.right !== undefined) setX(flippedX ? 'w' : 'e', r.right);
      if (r.top !== undefined) setY(flippedY ? 's' : 'n', r.top);
      if (r.bottom !== undefined) setY(flippedY ? 'n' : 's', r.bottom);
      this.guides = r.guides;
    }
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

  /**
   * Returns true when the key was consumed. The editor no longer knows which
   * key does what: `commands.ts` declares the actions and `shortcuts.ts` maps
   * chords to them, so a remapped key and a tooltip cannot disagree.
   */
  onKeyDown(key: string, mods: Modifiers): boolean {
    return runShortcut(this, key, mods);
  }

  /** Move the selection by whole board units, as the arrow keys do. */
  nudge(dx: number, dy: number): void {
    if (this.selection.length === 0 || this.readOnly) return;
    this.transact(() => {
      this.scene.translate(this.selection, dx, dy);
      this.assignFrames(this.selection);
    });
  }

  /**
   * Back out of whatever is in progress, innermost first. Escape means "not
   * this" rather than any one action, so it unwinds one layer per press.
   */
  cancel(): void {
    if (this.drag) this.cancelDrag();
    else if (this.pendingComment) this.cancelComment();
    else if (this.paletteOpen) this.setPaletteOpen(false);
    else if (this.selection.length) this.clearSelection();
    else this.setTool('select');
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

const TYPE_LABELS: Record<Shape['type'], string> = {
  rect: 'rectangle',
  ellipse: 'ellipse',
  line: 'line',
  pen: 'pen stroke',
  sticky: 'sticky note',
  text: 'text',
  image: 'image',
  frame: 'frame',
  group: 'group',
  connector: 'connector',
};

function describeShape(s: Shape): string {
  const label = TYPE_LABELS[s.type];
  if (s.type === 'image') return s.alt.trim() ? `image "${s.alt.trim()}"` : 'image';
  if (s.type === 'sticky' || s.type === 'text') {
    const text = s.text.trim().replace(/\s+/g, ' ');
    return text ? `${label} "${text.length > 40 ? `${text.slice(0, 40)}…` : text}"` : `empty ${label}`;
  }
  if (s.type === 'frame') return `frame "${s.title}"`;
  return label;
}

function midpoint(a: Vec, b: Vec): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** The picture's own size, or null when the data will not decode. */
function measureImage(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
