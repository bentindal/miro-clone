import { describe, expect, it, vi } from 'vitest';
import { type Timers, ToastStore } from '../toast';

/** Timers that fire when told to, so dismissal can be tested without waiting. */
function fakeTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const timers: Timers = {
    set: (fn, ms) => {
      const id = next++;
      pending.set(id, { fn, ms });
      return id;
    },
    clear: (id) => void pending.delete(id),
  };
  return {
    timers,
    pending,
    /** Fire everything due at or before `ms`. */
    advance(ms: number) {
      for (const [id, t] of [...pending]) {
        if (t.ms <= ms) {
          pending.delete(id);
          t.fn();
        }
      }
    },
  };
}

describe('the toast store', () => {
  it('keeps messages in the order they arrived', () => {
    const store = new ToastStore(fakeTimers().timers);
    store.add('first');
    store.add('second', 'error');
    expect(store.list().map((t) => [t.message, t.kind])).toEqual([
      ['first', 'info'],
      ['second', 'error'],
    ]);
  });

  it('tells subscribers when the list changes, and only then', () => {
    const store = new ToastStore(fakeTimers().timers);
    const seen = vi.fn();
    store.subscribe(seen);
    const id = store.add('hello');
    expect(seen).toHaveBeenCalledTimes(1);
    store.dismiss(id);
    expect(seen).toHaveBeenCalledTimes(2);
    // Dismissing something already gone is not a change.
    store.dismiss(id);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  // useSyncExternalStore re-renders forever if the snapshot is a new object
  // each time it is read.
  it('returns the same list until something changes', () => {
    const store = new ToastStore(fakeTimers().timers);
    expect(store.list()).toBe(store.list());
    store.add('hello');
    const snapshot = store.list();
    expect(store.list()).toBe(snapshot);
  });

  it('dismisses itself after a while', () => {
    const clock = fakeTimers();
    const store = new ToastStore(clock.timers);
    store.add('gone shortly', 'success');
    expect(store.list()).toHaveLength(1);
    clock.advance(2500);
    expect(store.list()).toEqual([]);
  });

  // An error is worth reading twice, and is usually the one that arrives while
  // you are looking somewhere else.
  it('leaves an error up longer than a success', () => {
    const clock = fakeTimers();
    const store = new ToastStore(clock.timers);
    store.add('saved', 'success');
    store.add('could not load', 'error');
    clock.advance(2500);
    expect(store.list().map((t) => t.message)).toEqual(['could not load']);
    clock.advance(8000);
    expect(store.list()).toEqual([]);
  });

  it('forgets the timer of a message dismissed by hand', () => {
    const clock = fakeTimers();
    const store = new ToastStore(clock.timers);
    store.dismiss(store.add('hello'));
    expect(clock.pending.size).toBe(0);
  });

  it('gives each message an id of its own', () => {
    const store = new ToastStore(fakeTimers().timers);
    const a = store.add('one');
    store.dismiss(a);
    expect(store.add('two')).not.toBe(a);
  });
});
