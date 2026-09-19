/**
 * The canvas cannot read CSS custom properties, so the `--canvas-*` group and
 * the handful of shared tokens the renderer needs are resolved once into a
 * plain object and passed into `renderBoard`. Both surfaces then change
 * colour together, which is what makes a second theme a token block rather
 * than a find-and-replace across two languages.
 */
export interface CanvasTheme {
  /** Page behind the board. */
  background: string;
  grid: string;
  /** Selection frame, marquee outline, anchor dots, active comment pin ring. */
  accent: string;
  /** Marquee fill. */
  accentSoft: string;
  /** Outline under the pointer. */
  hover: string;
  /** Handle fill, connector label fill, pin and cursor outlines. */
  surface: string;
  text: string;
  textMuted: string;
  /** Alignment and equal-spacing markers. */
  guide: string;
  frameFill: string;
  frameBorder: string;
  pinOpen: string;
  pinResolved: string;
  stickyShadow: string;
  vote: string;
  /** Cast by pins and peer cursors, so they read as raised like the DOM chrome. */
  shadow: string;
}

/** CSS custom property backing each key. Kept in step by theme.test.ts. */
export const CANVAS_TOKENS: Record<keyof CanvasTheme, string> = {
  background: '--canvas-bg',
  grid: '--canvas-grid',
  accent: '--accent',
  accentSoft: '--accent-soft',
  hover: '--canvas-hover',
  surface: '--surface',
  text: '--text',
  textMuted: '--text-muted',
  guide: '--canvas-guide',
  frameFill: '--canvas-frame-fill',
  frameBorder: '--canvas-frame-border',
  pinOpen: '--canvas-pin-open',
  pinResolved: '--canvas-pin-resolved',
  stickyShadow: '--canvas-sticky-shadow',
  vote: '--canvas-vote',
  shadow: '--canvas-shadow',
};

/**
 * Values of the tokens as declared in `src/ui/tokens.css`. Used when there is
 * no document to read from (tests, PNG export) and as the fallback for any
 * property a stylesheet has not defined.
 */
export const LIGHT_CANVAS_THEME: CanvasTheme = {
  background: '#f4f5f7',
  grid: '#d5d8de',
  accent: '#2f6fed',
  accentSoft: 'rgba(47, 111, 237, 0.12)',
  hover: 'rgba(47, 111, 237, 0.5)',
  surface: '#ffffff',
  text: '#222222',
  textMuted: '#5f6368',
  guide: '#e91e63',
  frameFill: '#ffffff',
  frameBorder: '#9aa0a6',
  pinOpen: '#f9a825',
  pinResolved: '#9aa0a6',
  stickyShadow: 'rgba(0, 0, 0, 0.12)',
  vote: '#e53935',
  shadow: 'rgba(0, 0, 0, 0.18)',
};

const KEYS = Object.keys(CANVAS_TOKENS) as (keyof CanvasTheme)[];

/**
 * Read the current value of every canvas token off `el` (the document root by
 * default). Call again after switching theme; the result is a snapshot.
 */
export function resolveCanvasTheme(el?: Element | null): CanvasTheme {
  const target = el ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (!target) return { ...LIGHT_CANVAS_THEME };
  const styles = getComputedStyle(target);
  const theme = {} as CanvasTheme;
  for (const key of KEYS) {
    const value = styles.getPropertyValue(CANVAS_TOKENS[key]).trim();
    theme[key] = value || LIGHT_CANVAS_THEME[key];
  }
  return theme;
}
