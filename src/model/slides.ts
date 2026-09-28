import { assignKeys, isValidKey, keyBetween } from './fractional';
import type { Scene } from './scene';
import type { FrameShape, Id } from './types';

/**
 * Frames double as presentation slides. Their order is deliberately not the
 * z-order: frames are inserted at the bottom of the z-order so they stay
 * behind their contents, which would make every new frame the first slide.
 * Each frame instead carries `slide`, a fractional index key, so moving one
 * slide writes one field on one frame and two people reordering at once
 * converge instead of fighting over a renumbered list.
 *
 * A frame written before slides existed has an empty key. The empty string
 * sorts below every valid key, so those frames come first, among themselves by
 * id — which is creation order, because `newId` starts with a timestamp. They
 * keep that place until something reorders the deck, which is the point at
 * which every frame gets a real key.
 */
export function slides(scene: Scene): FrameShape[] {
  const frames = scene.all().filter((s): s is FrameShape => s.type === 'frame');
  return frames.sort((a, b) => (a.slide === b.slide ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.slide < b.slide ? -1 : 1));
}

/** Where `id` sits in the presentation, or -1 when it is not a frame. */
export function slideIndex(scene: Scene, id: Id): number {
  return slides(scene).findIndex((f) => f.id === id);
}

/** The slide a shape belongs to, following frame parentage, or null. */
export function slideOf(scene: Scene, id: Id): FrameShape | null {
  const self = scene.get(id);
  if (!self) return null;
  if (self.type === 'frame') return self;
  const frameId = scene.frameOf(id);
  const frame = frameId ? scene.get(frameId) : undefined;
  return frame?.type === 'frame' ? frame : null;
}

/** The key a frame created now should take to become the last slide. */
export function nextSlideKey(scene: Scene): string {
  const last = slides(scene).at(-1);
  return keyBetween(last && isValidKey(last.slide) ? last.slide : null, null);
}

/**
 * The `slide` keys to write so that `id` sits at index `to`, as a map of frame
 * id to new key. Empty when the move changes nothing.
 *
 * Frames that never had a key get one here, in the order they already present
 * in, because a key can only be placed between two other keys. That is a write
 * per frame, but it happens once per board and only when somebody reorders.
 */
export function reorderSlides(scene: Scene, id: Id, to: number): Map<Id, string> {
  const order = slides(scene);
  const from = order.findIndex((f) => f.id === id);
  const target = Math.max(0, Math.min(order.length - 1, to));
  if (from === -1 || from === target) return new Map();

  // Existing keys are kept: the frames are already sorted by them, so the
  // longest increasing subsequence `assignKeys` keeps is all of them.
  const existing = new Map<Id, string>();
  for (const f of order) if (isValidKey(f.slide)) existing.set(f.id, f.slide);
  // `assignKeys` returns only the keys it had to invent, so the two are merged.
  const keys = new Map(existing);
  for (const [frameId, key] of assignKeys(
    order.map((f) => f.id),
    existing,
  ))
    keys.set(frameId, key);

  const rest = order.filter((f) => f.id !== id);
  const before = target > 0 ? keys.get(rest[target - 1].id)! : null;
  const after = target < rest.length ? keys.get(rest[target].id)! : null;
  keys.set(id, keyBetween(before, after));

  const writes = new Map<Id, string>();
  for (const f of order) {
    const key = keys.get(f.id)!;
    if (key !== f.slide) writes.set(f.id, key);
  }
  return writes;
}
