import type { ConnectorShape, EllipseShape, RectShape, StickyShape, PenShape, LineShape, FrameShape, GroupShape } from '../types';

export function rect(id: string, x: number, y: number, w: number, h: number, extra: Partial<RectShape> = {}): RectShape {
  return { type: 'rect', id, parentId: null, x, y, w, h, rotation: 0, fill: '#fff', stroke: '#000', ...extra };
}

export function ellipse(id: string, x: number, y: number, w: number, h: number, extra: Partial<EllipseShape> = {}): EllipseShape {
  return { type: 'ellipse', id, parentId: null, x, y, w, h, rotation: 0, fill: '#fff', stroke: '#000', ...extra };
}

export function sticky(id: string, x: number, y: number, text = ''): StickyShape {
  return { type: 'sticky', id, parentId: null, x, y, w: 100, h: 100, rotation: 0, text, fill: '#ff0' };
}

export function pen(id: string, x: number, y: number, points: { x: number; y: number }[]): PenShape {
  const maxX = Math.max(...points.map((p) => p.x));
  const maxY = Math.max(...points.map((p) => p.y));
  return { type: 'pen', id, parentId: null, x, y, w: maxX, h: maxY, rotation: 0, stroke: '#000', strokeWidth: 3, points };
}

export function line(id: string, x: number, y: number, x2: number, y2: number): LineShape {
  return {
    type: 'line',
    id,
    parentId: null,
    x,
    y,
    w: x2 - x,
    h: y2 - y,
    rotation: 0,
    stroke: '#000',
    points: [
      { x: 0, y: 0 },
      { x: x2 - x, y: y2 - y },
    ],
  };
}

export function frame(id: string, x: number, y: number, w: number, h: number): FrameShape {
  return { type: 'frame', id, parentId: null, x, y, w, h, rotation: 0, title: 'Frame' };
}

export function group(id: string, parentId: string | null = null): GroupShape {
  return { type: 'group', id, parentId };
}

export function connector(id: string, startId: string | null, endId: string | null, a = { x: 0, y: 0 }, b = { x: 0, y: 0 }): ConnectorShape {
  return {
    type: 'connector',
    id,
    parentId: null,
    stroke: '#000',
    start: { shapeId: startId, point: a },
    end: { shapeId: endId, point: b },
  };
}
