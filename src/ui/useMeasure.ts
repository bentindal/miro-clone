import { useCallback, useRef, useState } from 'react';

export interface Size {
  w: number;
  h: number;
}

/**
 * Measure an element that may mount and unmount, or change size with its
 * content. Returns a callback ref to put on the element and its current size.
 * A callback ref rather than an effect, because the components using this
 * stay mounted and render `null` when they have nothing to show.
 */
export function useMeasure(initial: Size): [(el: Element | null) => void, Size] {
  const [size, setSize] = useState(initial);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: Element | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    };
    apply();
    observer.current = new ResizeObserver(apply);
    observer.current.observe(el);
  }, []);
  return [ref, size];
}
