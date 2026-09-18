import type { Vec } from './geometry';

export type Id = string;

export type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'center';

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
}

export interface EllipseShape extends Boxed {
  type: 'ellipse';
  fill: string;
  stroke: string;
}

/** A straight line between the first and last of two local points. */
export interface LineShape extends Boxed {
  type: 'line';
  stroke: string;
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

export interface StickyShape extends Boxed {
  type: 'sticky';
  text: string;
  fill: string;
}

export interface TextShape extends Boxed {
  type: 'text';
  text: string;
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
}

export interface ConnectorShape extends ShapeBase {
  type: 'connector';
  start: ConnectorEnd;
  end: ConnectorEnd;
  stroke: string;
}

export type Shape =
  | RectShape
  | EllipseShape
  | LineShape
  | PenShape
  | StickyShape
  | TextShape
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
