import { Scene } from './scene';
import { ANCHORS, ARROW_HEADS, CONNECTOR_STYLES, type Anchor, type ArrowHead, type ConnectorStyle, type Id, type Shape } from './types';

export const BOARD_FORMAT_VERSION = 1;

export interface BoardFile {
  format: 'whiteboard';
  version: number;
  shapes: Shape[];
}

export function serializeScene(scene: Scene): BoardFile {
  return { format: 'whiteboard', version: BOARD_FORMAT_VERSION, shapes: scene.all() };
}

export function sceneToJSON(scene: Scene): string {
  return JSON.stringify(serializeScene(scene), null, 2);
}

export function deserializeScene(data: unknown): Scene {
  if (!isRecord(data)) throw new Error('Board file must be an object');
  if (data.format !== 'whiteboard') throw new Error('Not a whiteboard file');
  if (data.version !== BOARD_FORMAT_VERSION) throw new Error(`Unsupported board version ${String(data.version)}`);
  if (!Array.isArray(data.shapes)) throw new Error('Board file has no shapes array');
  const scene = new Scene();
  const ids = new Set<Id>();
  for (const raw of data.shapes) {
    const shape = validateShape(raw);
    if (ids.has(shape.id)) throw new Error(`Duplicate shape id ${shape.id}`);
    ids.add(shape.id);
    scene.add(shape);
  }
  // Validate references after all shapes exist.
  for (const s of scene.all()) {
    if (s.parentId !== null && !scene.has(s.parentId)) throw new Error(`Shape ${s.id} references missing parent ${s.parentId}`);
    if (s.type === 'connector') {
      for (const end of [s.start, s.end]) {
        if (end.shapeId !== null && !scene.has(end.shapeId)) {
          throw new Error(`Connector ${s.id} references missing shape ${end.shapeId}`);
        }
      }
    }
  }
  return scene;
}

export function sceneFromJSON(json: string): Scene {
  return deserializeScene(JSON.parse(json));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Invalid number for ${name}`);
  return v;
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new Error(`Invalid string for ${name}`);
  return v;
}

function optStr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function optNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function anchor(v: unknown): Anchor {
  return typeof v === 'string' && (ANCHORS as string[]).includes(v) ? (v as Anchor) : 'auto';
}

function arrowHead(v: unknown, fallback: ArrowHead): ArrowHead {
  return typeof v === 'string' && (ARROW_HEADS as string[]).includes(v) ? (v as ArrowHead) : fallback;
}

function connectorStyle(v: unknown): ConnectorStyle {
  return typeof v === 'string' && (CONNECTOR_STYLES as string[]).includes(v) ? (v as ConnectorStyle) : 'straight';
}

function point(v: unknown, name: string): { x: number; y: number } {
  if (!isRecord(v)) throw new Error(`Invalid point for ${name}`);
  return { x: num(v.x, `${name}.x`), y: num(v.y, `${name}.y`) };
}

function parentId(v: unknown): Id | null {
  if (v === null || v === undefined) return null;
  return str(v, 'parentId');
}

function boxed(r: Record<string, unknown>) {
  return {
    id: str(r.id, 'id'),
    parentId: parentId(r.parentId),
    x: num(r.x, 'x'),
    y: num(r.y, 'y'),
    w: num(r.w, 'w'),
    h: num(r.h, 'h'),
    rotation: typeof r.rotation === 'number' ? num(r.rotation, 'rotation') : 0,
  };
}

function connectorEnd(v: unknown, name: string) {
  if (!isRecord(v)) throw new Error(`Invalid connector end ${name}`);
  return {
    shapeId: v.shapeId === null || v.shapeId === undefined ? null : str(v.shapeId, `${name}.shapeId`),
    point: point(v.point, `${name}.point`),
    anchor: anchor(v.anchor),
  };
}

export function validateShape(raw: unknown): Shape {
  if (!isRecord(raw)) throw new Error('Shape must be an object');
  const type = raw.type;
  switch (type) {
    case 'rect':
    case 'ellipse':
      return {
        type,
        ...boxed(raw),
        fill: optStr(raw.fill, '#ffffff'),
        stroke: optStr(raw.stroke, '#222222'),
        strokeWidth: optNum(raw.strokeWidth, 2),
      };
    case 'line': {
      const pts = raw.points;
      if (!Array.isArray(pts) || pts.length !== 2) throw new Error('Line needs two points');
      return {
        type,
        ...boxed(raw),
        stroke: optStr(raw.stroke, '#222222'),
        strokeWidth: optNum(raw.strokeWidth, 2),
        points: [point(pts[0], 'points[0]'), point(pts[1], 'points[1]')],
      };
    }
    case 'pen': {
      const pts = raw.points;
      if (!Array.isArray(pts) || pts.length === 0) throw new Error('Pen needs points');
      return {
        type,
        ...boxed(raw),
        stroke: optStr(raw.stroke, '#222222'),
        strokeWidth: optNum(raw.strokeWidth, 3),
        points: pts.map((p, i) => point(p, `points[${i}]`)),
      };
    }
    case 'sticky':
      return {
        type,
        ...boxed(raw),
        text: optStr(raw.text, ''),
        fill: optStr(raw.fill, '#fff59d'),
        votes: Array.isArray(raw.votes) ? raw.votes.filter((v): v is string => typeof v === 'string') : [],
      };
    case 'text':
      return {
        type,
        ...boxed(raw),
        text: optStr(raw.text, ''),
        fontSize: optNum(raw.fontSize, 18),
        color: optStr(raw.color, '#222222'),
      };
    case 'frame':
      return { type, ...boxed(raw), title: optStr(raw.title, 'Frame') };
    case 'group':
      return { type, id: str(raw.id, 'id'), parentId: parentId(raw.parentId) };
    case 'connector':
      return {
        type,
        id: str(raw.id, 'id'),
        parentId: parentId(raw.parentId),
        start: connectorEnd(raw.start, 'start'),
        end: connectorEnd(raw.end, 'end'),
        stroke: optStr(raw.stroke, '#222222'),
        strokeWidth: optNum(raw.strokeWidth, 2),
        style: connectorStyle(raw.style),
        startArrow: arrowHead(raw.startArrow, 'none'),
        endArrow: arrowHead(raw.endArrow, 'arrow'),
        label: optStr(raw.label, ''),
      };
    default:
      throw new Error(`Unknown shape type ${String(type)}`);
  }
}
