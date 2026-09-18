export interface Vec {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Camera {
  /** Screen-space translation in pixels. */
  tx: number;
  ty: number;
  zoom: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export function vec(x: number, y: number): Vec {
  return { x, y };
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec, s: number): Vec {
  return { x: a.x * s, y: a.y * s };
}

export function len(a: Vec): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Rotate point p around pivot by angle (radians). */
export function rotatePoint(p: Vec, pivot: Vec, angle: number): Vec {
  if (angle === 0) return { x: p.x, y: p.y };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}

export function boxCenter(b: Box): Vec {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Corners of a box in order: top-left, top-right, bottom-right, bottom-left. */
export function boxCorners(b: Box): [Vec, Vec, Vec, Vec] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

/** Corners of a box rotated around its center. */
export function rotatedCorners(b: Box, angle: number): [Vec, Vec, Vec, Vec] {
  const c = boxCenter(b);
  const cs = boxCorners(b);
  return [
    rotatePoint(cs[0], c, angle),
    rotatePoint(cs[1], c, angle),
    rotatePoint(cs[2], c, angle),
    rotatePoint(cs[3], c, angle),
  ];
}

export function boundsOfPoints(points: readonly Vec[]): Box {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Axis-aligned bounds of a box after rotation around its center. */
export function rotatedBounds(b: Box, angle: number): Box {
  if (angle === 0) return { ...b };
  return boundsOfPoints(rotatedCorners(b, angle));
}

export function unionBoxes(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** True when `inner` lies entirely within `outer`. */
export function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function pointInBox(p: Vec, b: Box): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** Normalise a box that may have negative width or height. */
export function normalizeBox(b: Box): Box {
  return {
    x: b.w < 0 ? b.x + b.w : b.x,
    y: b.h < 0 ? b.y + b.h : b.y,
    w: Math.abs(b.w),
    h: Math.abs(b.h),
  };
}

export function boxFromPoints(a: Vec, b: Vec): Box {
  return normalizeBox({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
}

/** Distance from point p to segment ab. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * abx, y: a.y + t * aby });
}

// ---- Camera transforms -------------------------------------------------

export function worldToScreen(cam: Camera, p: Vec): Vec {
  return { x: p.x * cam.zoom + cam.tx, y: p.y * cam.zoom + cam.ty };
}

export function screenToWorld(cam: Camera, p: Vec): Vec {
  return { x: (p.x - cam.tx) / cam.zoom, y: (p.y - cam.ty) / cam.zoom };
}

export function panCamera(cam: Camera, dx: number, dy: number): Camera {
  return { tx: cam.tx + dx, ty: cam.ty + dy, zoom: cam.zoom };
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Zoom so that the world point under `screenPoint` stays fixed on screen. */
export function zoomCameraAt(cam: Camera, newZoom: number, screenPoint: Vec): Camera {
  const z = clampZoom(newZoom);
  const world = screenToWorld(cam, screenPoint);
  return {
    zoom: z,
    tx: screenPoint.x - world.x * z,
    ty: screenPoint.y - world.y * z,
  };
}

/** Multiply zoom by factor, keeping `screenPoint` fixed. */
export function zoomCameraBy(cam: Camera, factor: number, screenPoint: Vec): Camera {
  return zoomCameraAt(cam, cam.zoom * factor, screenPoint);
}

/** World-space rectangle currently visible in a viewport of the given size. */
export function visibleWorldBox(cam: Camera, viewportW: number, viewportH: number): Box {
  const tl = screenToWorld(cam, { x: 0, y: 0 });
  const br = screenToWorld(cam, { x: viewportW, y: viewportH });
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

/** Camera that fits `box` into the viewport with padding. */
export function fitCamera(box: Box, viewportW: number, viewportH: number, padding = 40): Camera {
  const w = Math.max(box.w, 1);
  const h = Math.max(box.h, 1);
  const zoom = clampZoom(Math.min((viewportW - padding * 2) / w, (viewportH - padding * 2) / h));
  const c = boxCenter(box);
  return {
    zoom,
    tx: viewportW / 2 - c.x * zoom,
    ty: viewportH / 2 - c.y * zoom,
  };
}
