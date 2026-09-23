import type { Mark } from './marks';
import type { Vec } from './geometry';

export type Id = string;

/** Fixed side of a shape a connector end attaches to, or 'auto' for the nearest edge point. */
export type Anchor = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export const ANCHORS: Anchor[] = ['auto', 'top', 'right', 'bottom', 'left'];

export type ConnectorStyle = 'straight' | 'elbow' | 'curved';

export const CONNECTOR_STYLES: ConnectorStyle[] = ['straight', 'elbow', 'curved'];

export type ArrowHead = 'none' | 'arrow' | 'open' | 'dot' | 'bar';

export const ARROW_HEADS: ArrowHead[] = ['none', 'arrow', 'open', 'dot', 'bar'];

export type TextAlign = 'left' | 'center' | 'right';

export const TEXT_ALIGNS: TextAlign[] = ['left', 'center', 'right'];

export type TextVAlign = 'top' | 'middle' | 'bottom';

export const TEXT_VALIGNS: TextVAlign[] = ['top', 'middle', 'bottom'];

interface ShapeBase {
  id: Id;
  /** Group or frame that contains this shape. */
  parentId: Id | null;
}

interface Boxed extends ShapeBase {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation in radians around the box centre. */
  rotation: number;
}

export interface RectShape extends Boxed {
  type: 'rect';
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface EllipseShape extends Boxed {
  type: 'ellipse';
  fill: string;
  stroke: string;
  strokeWidth: number;
}

/** A straight line between the first and last of two local points. */
export interface LineShape extends Boxed {
  type: 'line';
  stroke: string;
  strokeWidth: number;
  /** Two points relative to (x, y). */
  points: [Vec, Vec];
}

export interface PenShape extends Boxed {
  type: 'pen';
  stroke: string;
  strokeWidth: number;
  /** Points relative to (x, y). */
  points: Vec[];
}

export const LIST_STYLES = ['none', 'bullet', 'number'] as const;
export type ListStyle = (typeof LIST_STYLES)[number];

export interface StickyShape extends Boxed {
  type: 'sticky';
  text: string;
  /** Inline formatting over `text`. See `src/model/marks.ts`. */
  marks: Mark[];
  /** Whether the lines are drawn as a list, and of which kind. */
  list: ListStyle;
  fill: string;
  /** Horizontal placement of the text block within the note. */
  align: TextAlign;
  /** Vertical placement of the text block within the note. */
  valign: TextVAlign;
  /** Names of the people who voted for this note, shown as dots. */
  votes: string[];
  /** Short labels drawn as chips along the top of the note. */
  tags: string[];
}

export interface ImageShape extends Boxed {
  type: 'image';
  /**
   * The picture itself, always a `data:image/...` URL. Nothing else is
   * accepted: a remote URL would leak the board's contents to whoever serves
   * it, would taint the canvas so PNG export stopped working, and would turn
   * a board file into a way of making the person who opens it fetch a URL
   * they never chose. See `validateShape`.
   */
  src: string;
  /** What the picture shows, for the screen reader and while it loads. */
  alt: string;
}

export interface TextShape extends Boxed {
  type: 'text';
  text: string;
  /** Inline formatting over `text`. See `src/model/marks.ts`. */
  marks: Mark[];
  /** Whether the lines are drawn as a list, and of which kind. */
  list: ListStyle;
  fontSize: number;
  color: string;
}

export interface FrameShape extends Boxed {
  type: 'frame';
  title: string;
}

export interface GroupShape extends ShapeBase {
  type: 'group';
}

export interface ConnectorEnd {
  /** When set, the endpoint is attached to this shape and `point` is ignored. */
  shapeId: Id | null;
  /** Absolute world position for free endpoints. */
  point: Vec;
  /** Which side of the attached shape to leave from; ignored for free ends. */
  anchor: Anchor;
}

export interface ConnectorShape extends ShapeBase {
  type: 'connector';
  start: ConnectorEnd;
  end: ConnectorEnd;
  stroke: string;
  strokeWidth: number;
  style: ConnectorStyle;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  /** Text shown at the midpoint of the path. */
  label: string;
}

export type Shape =
  | RectShape
  | EllipseShape
  | LineShape
  | PenShape
  | StickyShape
  | TextShape
  | ImageShape
  | FrameShape
  | GroupShape
  | ConnectorShape;

export type ShapeType = Shape['type'];

export type BoxedShape = Exclude<Shape, GroupShape | ConnectorShape>;

export function isBoxed(s: Shape): s is BoxedShape {
  return s.type !== 'group' && s.type !== 'connector';
}

export function hasText(s: Shape): s is StickyShape | TextShape {
  return s.type === 'sticky' || s.type === 'text';
}

let counter = 0;

export function newId(prefix = 's'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
