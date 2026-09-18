import {
  type Box,
  type Vec,
  boxCenter,
  boxContains,
  distToSegment,
  pointInBox,
  rotatePoint,
} from './geometry';
import { FRAME_TITLE_HEIGHT, Scene, connectorLabelBox, polylineMidpoint } from './scene';
import type { Id, Shape } from './types';

/** Does the point hit the shape? `tolerance` is in world units. */
export function hitShape(scene: Scene, s: Shape, p: Vec, tolerance: number): boolean {
  switch (s.type) {
    case 'group':
      return false;
    case 'connector': {
      const pts = scene.connectorGeometry(s).points;
      if (s.label && pointInBox(p, grow(connectorLabelBox(s.label, polylineMidpoint(pts)), tolerance))) return true;
      for (let i = 0; i + 1 < pts.length; i++) {
        if (distToSegment(p, pts[i], pts[i + 1]) <= tolerance + s.strokeWidth / 2 + 1) return true;
      }
      return false;
    }
    case 'rect':
    case 'sticky':
    case 'text': {
      const local = rotatePoint(p, boxCenter(s), -s.rotation);
      return pointInBox(local, grow(s, tolerance));
    }
    case 'ellipse': {
      const c = boxCenter(s);
      const local = rotatePoint(p, c, -s.rotation);
      const rx = s.w / 2 + tolerance;
      const ry = s.h / 2 + tolerance;
      if (rx <= 0 || ry <= 0) return false;
      const dx = (local.x - c.x) / rx;
      const dy = (local.y - c.y) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case 'line':
    case 'pen': {
      const c = boxCenter(s);
      const local = rotatePoint(p, c, -s.rotation);
      const width = s.strokeWidth;
      const pts = s.points;
      if (pts.length === 1) {
        return Math.hypot(local.x - (s.x + pts[0].x), local.y - (s.y + pts[0].y)) <= tolerance + width;
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = { x: s.x + pts[i].x, y: s.y + pts[i].y };
        const b = { x: s.x + pts[i + 1].x, y: s.y + pts[i + 1].y };
        if (distToSegment(local, a, b) <= tolerance + width / 2) return true;
      }
      return false;
    }
    case 'frame': {
      // Frames are hit on their border and title bar only, so the interior
      // remains available for marquee selection and placing objects.
      const local = rotatePoint(p, boxCenter(s), -s.rotation);
      const title: Box = { x: s.x, y: s.y - FRAME_TITLE_HEIGHT, w: s.w, h: FRAME_TITLE_HEIGHT };
      if (pointInBox(local, title)) return true;
      const outer = grow(s, tolerance);
      const inner = grow(s, -tolerance);
      return pointInBox(local, outer) && !pointInBox(local, inner);
    }
  }
}

function grow(b: Box, t: number): Box {
  return { x: b.x - t, y: b.y - t, w: b.w + 2 * t, h: b.h + 2 * t };
}

/** Top-most leaf shape at a world point, or null. */
export function hitTest(scene: Scene, p: Vec, tolerance = 4): Shape | null {
  const all = scene.all();
  for (let i = all.length - 1; i >= 0; i--) {
    const s = all[i];
    if (hitShape(scene, s, p, tolerance)) return s;
  }
  return null;
}

/** Selectable id (top group) at a world point, or null. */
export function selectableAt(scene: Scene, p: Vec, tolerance = 4): Id | null {
  const s = hitTest(scene, p, tolerance);
  return s ? scene.topGroup(s.id) : null;
}

/**
 * Selectable ids whose bounds lie fully inside `box`. Groups are included when
 * all of their leaves are inside.
 */
export function selectablesInBox(scene: Scene, box: Box): Id[] {
  const out: Id[] = [];
  const seen = new Set<Id>();
  for (const s of scene.all()) {
    if (s.type === 'group') continue;
    const top = scene.topGroup(s.id);
    if (seen.has(top)) continue;
    if (boxContains(box, scene.bounds(top))) {
      seen.add(top);
      out.push(top);
    }
  }
  return out;
}
