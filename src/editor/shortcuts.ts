import { COMMANDS, type Command, isEnabled } from './commands';
import type { Editor, Modifiers } from './Editor';

const KEY = 'whiteboard.shortcuts';

/**
 * The canonical name for a key press: modifiers in a fixed order, then the
 * key itself, single characters upper-cased.
 *
 * Shift is only named when the key is a letter or a named key. A shifted
 * punctuation or digit key already reports the character it produced — `}`,
 * `!` — so naming Shift as well would give one press two names, and `}` and
 * `Shift+}` would both be plausible spellings of the same chord.
 */
export function chordFor(key: string, mods: Modifiers): string {
  const k = key.length === 1 ? key.toUpperCase() : key;
  const named = k.length > 1 || (k >= 'A' && k <= 'Z');
  const parts: string[] = [];
  if (mods.ctrl) parts.push('Ctrl');
  if (mods.shift && named) parts.push('Shift');
  if (mods.alt) parts.push('Alt');
  parts.push(k);
  return parts.join('+');
}

/**
 * Characters that are only reachable with Shift, spelled the way a person
 * would say them. The chord stays the character, because that is what the
 * keyboard reports; this is display only.
 */
const SHIFTED: Record<string, string> = { '!': 'Shift+1', '@': 'Shift+2', '#': 'Shift+3', '$': 'Shift+4', '%': 'Shift+5' };

export function formatShortcut(chord: string | undefined): string | undefined {
  if (!chord) return undefined;
  const i = chord.lastIndexOf('+');
  const head = i > 0 ? chord.slice(0, i + 1) : '';
  const key = i > 0 ? chord.slice(i + 1) : chord;
  return head + (SHIFTED[key] ?? key);
}

/** Command id to the chords bound to it. Absent means the default applies. */
export type Overrides = Record<string, string[]>;

function parseOverrides(raw: unknown): Overrides {
  const rec = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: Overrides = {};
  for (const [id, chords] of Object.entries(rec)) {
    if (Array.isArray(chords) && chords.every((c) => typeof c === 'string')) out[id] = chords as string[];
  }
  return out;
}

/**
 * Which keys run which commands. Only the differences from the defaults are
 * stored, so a default that changes later reaches people who never remapped
 * it, and a command that disappears takes its override with it.
 */
export class ShortcutStore {
  private overrides: Overrides;
  /** Rebuilt on change and handed out as-is, so `useSyncExternalStore` is stable. */
  private snapshot!: Record<string, string[]>;
  private byChord!: Map<string, Command>;
  private listeners = new Set<() => void>();

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
    private readonly commands: Command[] = COMMANDS,
  ) {
    this.overrides = this.read();
    this.rebuild();
  }

  private read(): Overrides {
    try {
      const raw = this.storage?.getItem(KEY);
      return parseOverrides(raw ? JSON.parse(raw) : null);
    } catch {
      // Blocked storage or something that is not JSON: the defaults still work.
      return {};
    }
  }

  private rebuild(): void {
    const map: Record<string, string[]> = {};
    const byChord = new Map<string, Command>();
    for (const cmd of this.commands) {
      const chords = this.overrides[cmd.id] ?? cmd.shortcut ?? [];
      map[cmd.id] = chords;
      // First declaration wins, so a stale override cannot shadow a command
      // that never agreed to give its key up.
      for (const chord of chords) if (!byChord.has(chord)) byChord.set(chord, cmd);
    }
    this.snapshot = map;
    this.byChord = byChord;
  }

  private persist(): void {
    this.rebuild();
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.overrides));
    } catch {
      // Not being able to remember a remap is not a reason to refuse it.
    }
    for (const fn of this.listeners) fn();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get = (): Record<string, string[]> => this.snapshot;

  chords(id: string): string[] {
    return this.snapshot[id] ?? [];
  }

  commandFor(chord: string): Command | null {
    return this.byChord.get(chord) ?? null;
  }

  /** The command a chord is already bound to, for warning before it is taken. */
  conflict(chord: string, forId: string): Command | null {
    const owner = this.byChord.get(chord);
    return owner && owner.id !== forId ? owner : null;
  }

  /**
   * Bind a command to exactly these chords. A chord can only run one command,
   * so any other command holding one loses it here rather than silently
   * shadowing or being shadowed.
   */
  set(id: string, chords: string[]): void {
    const target = this.commands.find((c) => c.id === id);
    if (!target) return;
    const taken = new Set(chords);
    for (const cmd of this.commands) {
      if (cmd.id === id) continue;
      const current = this.chords(cmd.id);
      const kept = current.filter((c) => !taken.has(c));
      if (kept.length !== current.length) this.overrides[cmd.id] = kept;
    }
    const isDefault = JSON.stringify(chords) === JSON.stringify(target.shortcut ?? []);
    if (isDefault) delete this.overrides[id];
    else this.overrides[id] = chords;
    this.persist();
  }

  reset(id: string): void {
    if (!(id in this.overrides)) return;
    delete this.overrides[id];
    this.persist();
  }

  resetAll(): void {
    if (Object.keys(this.overrides).length === 0) return;
    this.overrides = {};
    this.persist();
  }
}

export const shortcuts = new ShortcutStore();

/** Returns true when the key press was consumed by a command. */
export function runShortcut(editor: Editor, key: string, mods: Modifiers, store: ShortcutStore = shortcuts): boolean {
  const cmd = store.commandFor(chordFor(key, mods));
  if (!cmd || !isEnabled(cmd, editor)) return false;
  cmd.run(editor);
  return true;
}
