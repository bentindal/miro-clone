import { describe, expect, it } from 'vitest';
import type { Command } from '../commands';
import { ShortcutStore, chordFor } from '../shortcuts';

const NONE = { shift: false, ctrl: false, alt: false };

const noop = () => {};

const FAKE: Command[] = [
  { id: 'alpha', label: 'Alpha', icon: 'select', group: 'edit', shortcut: ['Ctrl+A'], run: noop },
  { id: 'beta', label: 'Beta', icon: 'select', group: 'edit', shortcut: ['B', 'Ctrl+B'], run: noop },
  { id: 'gamma', label: 'Gamma', icon: 'select', group: 'view', run: noop },
];

/** A localStorage stand-in, so a test never depends on the real one. */
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const stored = (m: ReturnType<typeof memory>) => JSON.parse(m.data.get('whiteboard.shortcuts') ?? '{}');

describe('naming a key press', () => {
  it('upper-cases a single character and orders the modifiers', () => {
    expect(chordFor('z', { ...NONE, ctrl: true })).toBe('Ctrl+Z');
    expect(chordFor('Z', { ...NONE, ctrl: true, shift: true })).toBe('Ctrl+Shift+Z');
    expect(chordFor('v', NONE)).toBe('V');
  });

  it('names Shift for a letter or a named key', () => {
    expect(chordFor('ArrowLeft', { ...NONE, shift: true })).toBe('Shift+ArrowLeft');
    expect(chordFor('A', { ...NONE, shift: true })).toBe('Shift+A');
  });

  // Shift+] reports '}', so 'Shift+}' would be a second name for one press and
  // whichever of the two a command declared, the other would never fire.
  it('does not name Shift for a character Shift already produced', () => {
    expect(chordFor('}', { ...NONE, shift: true })).toBe('}');
    expect(chordFor('!', { ...NONE, shift: true })).toBe('!');
  });

  it('keeps Alt', () => {
    expect(chordFor('d', { shift: false, ctrl: true, alt: true })).toBe('Ctrl+Alt+D');
  });
});

describe('the shortcut store', () => {
  it('starts from the declared defaults', () => {
    const store = new ShortcutStore(null, FAKE);
    expect(store.chords('beta')).toEqual(['B', 'Ctrl+B']);
    expect(store.chords('gamma')).toEqual([]);
    expect(store.commandFor('Ctrl+A')?.id).toBe('alpha');
    expect(store.commandFor('Ctrl+K')).toBeNull();
  });

  it('rebinds a command and forgets its old key', () => {
    const store = new ShortcutStore(null, FAKE);
    store.set('alpha', ['Ctrl+Shift+A']);
    expect(store.commandFor('Ctrl+A')).toBeNull();
    expect(store.commandFor('Ctrl+Shift+A')?.id).toBe('alpha');
  });

  // Two commands on one chord means one of them silently never runs, so the
  // store takes the key rather than leaving a loser nobody can see.
  it('takes a chord away from whoever held it', () => {
    const store = new ShortcutStore(null, FAKE);
    expect(store.conflict('B', 'alpha')?.id).toBe('beta');
    store.set('alpha', ['B']);
    expect(store.commandFor('B')?.id).toBe('alpha');
    expect(store.chords('beta')).toEqual(['Ctrl+B']);
    expect(store.conflict('B', 'alpha')).toBeNull();
  });

  it('gives a command with no default a key', () => {
    const store = new ShortcutStore(null, FAKE);
    store.set('gamma', ['Ctrl+9']);
    expect(store.commandFor('Ctrl+9')?.id).toBe('gamma');
  });

  // Storing the whole map would freeze today's defaults into every browser
  // that has ever opened the board.
  it('stores only what differs from the defaults', () => {
    const storage = memory();
    const store = new ShortcutStore(storage, FAKE);
    store.set('alpha', ['Ctrl+Shift+A']);
    expect(stored(storage)).toEqual({ alpha: ['Ctrl+Shift+A'] });
    store.set('alpha', ['Ctrl+A']);
    expect(stored(storage)).toEqual({});
  });

  it('reads a remap back on the next visit', () => {
    const storage = memory();
    new ShortcutStore(storage, FAKE).set('beta', ['Ctrl+Y']);
    expect(new ShortcutStore(storage, FAKE).commandFor('Ctrl+Y')?.id).toBe('beta');
  });

  it('falls back to the defaults on a stored value it cannot use', () => {
    for (const raw of ['not json', '{"alpha":"Ctrl+A"}', '[1,2]', 'null']) {
      const store = new ShortcutStore(memory({ 'whiteboard.shortcuts': raw }), FAKE);
      expect(store.commandFor('Ctrl+A')?.id, raw).toBe('alpha');
    }
  });

  it('ignores an override for a command that no longer exists', () => {
    const store = new ShortcutStore(memory({ 'whiteboard.shortcuts': '{"deleted-command":["Ctrl+A"]}' }), FAKE);
    expect(store.commandFor('Ctrl+A')?.id).toBe('alpha');
  });

  it('resets one command and all of them', () => {
    const store = new ShortcutStore(null, FAKE);
    store.set('alpha', ['Ctrl+1']);
    store.set('beta', ['Ctrl+2']);
    store.reset('alpha');
    expect(store.commandFor('Ctrl+A')?.id).toBe('alpha');
    expect(store.commandFor('Ctrl+2')?.id).toBe('beta');
    store.resetAll();
    expect(store.chords('beta')).toEqual(['B', 'Ctrl+B']);
  });

  it('notifies only on a real change, and hands out a stable snapshot', () => {
    const store = new ShortcutStore(null, FAKE);
    let calls = 0;
    store.subscribe(() => calls++);
    const first = store.get();
    store.reset('alpha');
    expect(calls).toBe(0);
    expect(store.get()).toBe(first);
    store.set('alpha', ['Ctrl+1']);
    expect(calls).toBe(1);
    expect(store.get()).not.toBe(first);
    expect(store.get()).toBe(store.get());
  });

  it('works when storage refuses to co-operate', () => {
    const angry = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = new ShortcutStore(angry, FAKE);
    expect(store.commandFor('Ctrl+A')?.id).toBe('alpha');
    expect(() => store.set('alpha', ['Ctrl+1'])).not.toThrow();
    expect(store.commandFor('Ctrl+1')?.id).toBe('alpha');
  });
});
