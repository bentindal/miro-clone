export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** How long each kind stays up. An error is worth reading twice. */
const TTL: Record<ToastKind, number> = { info: 3000, success: 2500, error: 8000 };

export interface Timers {
  set: (fn: () => void, ms: number) => number;
  clear: (handle: number) => void;
}

const REAL_TIMERS: Timers = {
  set: (fn, ms) => (typeof window === 'undefined' ? 0 : window.setTimeout(fn, ms)),
  clear: (handle) => {
    if (typeof window !== 'undefined') window.clearTimeout(handle);
  },
};

/**
 * Transient messages. `window.alert` blocked the tab and could not be styled;
 * this can be read and ignored. The timers are injected so the dismissal
 * behaviour can be tested without waiting for it.
 */
export class ToastStore {
  private toasts: Toast[] = [];
  private handles = new Map<number, number>();
  private listeners = new Set<() => void>();
  private nextId = 1;

  constructor(private readonly timers: Timers = REAL_TIMERS) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Stable between changes, so `useSyncExternalStore` does not loop. */
  list = (): readonly Toast[] => this.toasts;

  add(message: string, kind: ToastKind = 'info'): number {
    const id = this.nextId++;
    this.toasts = [...this.toasts, { id, kind, message }];
    this.handles.set(id, this.timers.set(() => this.dismiss(id), TTL[kind]));
    this.notify();
    return id;
  }

  dismiss(id: number): void {
    const handle = this.handles.get(id);
    if (handle !== undefined) {
      this.timers.clear(handle);
      this.handles.delete(id);
    }
    const next = this.toasts.filter((t) => t.id !== id);
    if (next.length === this.toasts.length) return;
    this.toasts = next;
    this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

export const toasts = new ToastStore();

/** Raise a message. Returns its id, so a caller can dismiss it early. */
export function toast(message: string, kind: ToastKind = 'info'): number {
  return toasts.add(message, kind);
}
