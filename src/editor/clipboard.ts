import { Scene } from '../model/scene';
import { type Id, type Shape, newId } from '../model/types';

/** Collect the selected shapes plus their descendants, in z-order. */
export function collectForCopy(scene: Scene, ids: Iterable<Id>): Shape[] {
  const wanted = new Set<Id>();
  for (const id of ids) {
    if (!scene.has(id)) continue;
    wanted.add(id);
    for (const d of scene.descendants(id)) wanted.add(d);
  }
  return scene.all().filter((s) => wanted.has(s.id));
}

/**
 * Insert copies of `shapes` with fresh ids, remapping internal references.
 * References to shapes outside the copied set are dropped (parents become
 * top-level, connector ends become free at their resolved position).
 * Returns the ids of the new top-level shapes.
 */
export function pasteShapes(scene: Scene, source: Scene, shapes: Shape[], dx: number, dy: number): Id[] {
  const idMap = new Map<Id, Id>();
  for (const s of shapes) idMap.set(s.id, newId(s.type));
  const topLevel: Id[] = [];
  for (const s of shapes) {
    const id = idMap.get(s.id)!;
    const parentId = s.parentId !== null && idMap.has(s.parentId) ? idMap.get(s.parentId)! : null;
    if (parentId === null) topLevel.push(id);
    let copy: Shape;
    if (s.type === 'group') copy = { ...s, id, parentId };
    else if (s.type === 'connector') {
      const resolved = source.has(s.id) ? source.connectorPoints(s) : { a: s.start.point, b: s.end.point };
      const mapEnd = (end: typeof s.start, fallback: { x: number; y: number }) =>
        end.shapeId !== null && idMap.has(end.shapeId)
          ? { shapeId: idMap.get(end.shapeId)!, point: { ...end.point } }
          : { shapeId: null, point: { x: fallback.x + dx, y: fallback.y + dy } };
      copy = { ...s, id, parentId, start: mapEnd(s.start, resolved.a), end: mapEnd(s.end, resolved.b) };
    } else copy = { ...s, id, parentId, x: s.x + dx, y: s.y + dy };
    scene.add(copy);
  }
  return topLevel;
}
