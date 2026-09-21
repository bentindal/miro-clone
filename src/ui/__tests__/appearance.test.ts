import { describe, expect, it, vi } from 'vitest';
import { AppearanceStore, DEFAULT_APPEARANCE, attributesFor, parseAppearance } from '../appearance';

/** A root element that records the attributes set on it. */
function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
}

function fakeStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set('whiteboard.appearance', initial);
  return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
}

describe('appearance', () => {
  // 'system' must set no attribute at all: that is what lets the
  // prefers-color-scheme block apply. Choosing light has to be explicit, or it
  // could not override a dark system.
  it('leaves the theme attribute off for the system choice', () => {
    expect(attributesFor({ theme: 'system', density: 'comfortable' })).toEqual({ theme: null, density: null });
    expect(attributesFor({ theme: 'light', density: 'compact' })).toEqual({ theme: 'light', density: 'compact' });
    expect(attributesFor({ theme: 'dark', density: 'comfortable' })).toEqual({ theme: 'dark', density: null });
  });

  it('falls back on anything it does not recognise', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: 'neon', density: 7 })).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: 'dark' })).toEqual({ theme: 'dark', density: 'comfortable' });
  });

  it('applies what it read, on construction', () => {
    const root = fakeRoot();
    new AppearanceStore(fakeStorage(JSON.stringify({ theme: 'dark', density: 'compact' })), root);
    expect(Object.fromEntries(root.attrs)).toEqual({ 'data-theme': 'dark', 'data-density': 'compact' });
  });

  it('removes the attribute again when the choice goes back to the default', () => {
    const root = fakeRoot();
    const store = new AppearanceStore(fakeStorage(), root);
    store.set({ theme: 'dark' });
    expect(root.attrs.get('data-theme')).toBe('dark');
    store.set({ theme: 'system' });
    expect(root.attrs.has('data-theme')).toBe(false);
  });

  it('remembers the choice', () => {
    const storage = fakeStorage();
    new AppearanceStore(storage, fakeRoot()).set({ density: 'compact' });
    expect(JSON.parse(storage.store.get('whiteboard.appearance')!)).toEqual({ theme: 'system', density: 'compact' });
  });

  it('tells subscribers, and only when something changed', () => {
    const store = new AppearanceStore(fakeStorage(), fakeRoot());
    const seen = vi.fn();
    store.subscribe(seen);
    store.set({ theme: 'dark' });
    expect(seen).toHaveBeenCalledTimes(1);
    store.set({ theme: 'dark' });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  // useSyncExternalStore re-renders forever if the snapshot is a new object
  // each time it is read.
  it('returns the same object until something changes', () => {
    const store = new AppearanceStore(fakeStorage(), fakeRoot());
    expect(store.get()).toBe(store.get());
  });

  // Private browsing and blocked site data both throw here.
  it('works when storage refuses', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const root = fakeRoot();
    const store = new AppearanceStore(throwing, root);
    expect(store.get()).toEqual(DEFAULT_APPEARANCE);
    store.set({ theme: 'dark' });
    expect(root.attrs.get('data-theme')).toBe('dark');
  });

  it('works with no document and no storage at all', () => {
    const store = new AppearanceStore(null, null);
    store.set({ theme: 'dark' });
    expect(store.get().theme).toBe('dark');
  });
});
