export type ThemeChoice = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

export interface Appearance {
  theme: ThemeChoice;
  density: Density;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', density: 'comfortable' };

const KEY = 'whiteboard.appearance';

const THEMES: ThemeChoice[] = ['system', 'light', 'dark'];
const DENSITIES: Density[] = ['comfortable', 'compact'];

/** Anything unrecognised falls back, so a stale or hand-edited value cannot wedge the UI. */
export function parseAppearance(raw: unknown): Appearance {
  const rec = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const theme = THEMES.find((t) => t === rec.theme) ?? DEFAULT_APPEARANCE.theme;
  const density = DENSITIES.find((d) => d === rec.density) ?? DEFAULT_APPEARANCE.density;
  return { theme, density };
}

/**
 * The attributes the token blocks key off. `system` sets no theme attribute at
 * all, which is what lets the `prefers-color-scheme` block apply; choosing
 * light has to be explicit, or it could not override a dark system.
 */
export function attributesFor(appearance: Appearance): { theme: string | null; density: string | null } {
  return {
    theme: appearance.theme === 'system' ? null : appearance.theme,
    density: appearance.density === 'comfortable' ? null : appearance.density,
  };
}

/**
 * How the app looks: which theme, and how tightly it is packed. Kept out of
 * the editor because it outlives any one board, and read back from storage so
 * the choice survives a reload.
 */
export class AppearanceStore {
  private current: Appearance;
  private listeners = new Set<() => void>();

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
    private readonly root: { setAttribute: (k: string, v: string) => void; removeAttribute: (k: string) => void } | null = typeof document === 'undefined'
      ? null
      : document.documentElement,
  ) {
    this.current = this.read();
    this.apply();
  }

  private read(): Appearance {
    try {
      const raw = this.storage?.getItem(KEY);
      return parseAppearance(raw ? JSON.parse(raw) : null);
    } catch {
      // Private browsing, blocked storage, or something that is not JSON.
      return { ...DEFAULT_APPEARANCE };
    }
  }

  private apply(): void {
    if (!this.root) return;
    const attrs = attributesFor(this.current);
    for (const [name, value] of [
      ['data-theme', attrs.theme],
      ['data-density', attrs.density],
    ] as const) {
      if (value === null) this.root.removeAttribute(name);
      else this.root.setAttribute(name, value);
    }
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Stable between changes, so `useSyncExternalStore` does not loop. */
  get = (): Appearance => this.current;

  set(patch: Partial<Appearance>): void {
    const next = parseAppearance({ ...this.current, ...patch });
    if (next.theme === this.current.theme && next.density === this.current.density) return;
    this.current = next;
    this.apply();
    try {
      this.storage?.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
    for (const fn of this.listeners) fn();
  }
}

export const appearance = new AppearanceStore();
