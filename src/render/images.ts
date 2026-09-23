/**
 * Pictures are decoded once per `src` and kept, because the renderer draws
 * from a synchronous canvas call and cannot wait. Until one is decoded the
 * shape draws as a placeholder; when it arrives the board is asked to repaint.
 */
const cache = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

/** Called when a picture finishes decoding, so the board can draw it. */
export function onImageLoad(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The decoded picture for a `src`, or null while it is still loading or if it failed. */
export function imageFor(src: string): HTMLImageElement | null {
  const held = cache.get(src);
  if (held) return held.complete && held.naturalWidth > 0 ? held : null;
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  cache.set(src, img);
  img.onload = () => {
    for (const fn of listeners) fn();
  };
  img.onerror = () => {
    // A picture that will not decode stays a placeholder rather than
    // disappearing: the shape is still there and still selectable.
    for (const fn of listeners) fn();
  };
  img.src = src;
  return null;
}

/** Whether a `src` has been tried and cannot be decoded. */
export function imageFailed(src: string): boolean {
  const held = cache.get(src);
  return held !== undefined && held.complete && held.naturalWidth === 0;
}

export function clearImageCache(): void {
  cache.clear();
}
