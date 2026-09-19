/**
 * Dot grid spacing.
 *
 * The old grid multiplied its step by four whenever it left a fixed range, so
 * the board visibly changed density at particular zoom levels. Instead, two
 * nested levels are always drawn: a coarse one at full strength, and the level
 * four times finer fading in as it becomes legible. Because each coarse dot is
 * also a fine dot, nothing jumps when the levels shift.
 */

/** World units between dots at the finest level, at zoom 1. */
export const GRID_BASE = 100;
/** Each level is this many times coarser than the last. */
const RATIO = 4;
/** Screen pixels the coarse level aims for. */
const IDEAL = 90;
/** Opacity the fine level has to reach before it is worth drawing at all. */
const FADE_IN = 0.06;

export interface GridLevel {
  /** Spacing in screen pixels. */
  step: number;
  /** 0 to 1. The coarse level is always 1. */
  alpha: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * The levels to draw at this zoom, coarsest first. The coarse step always
 * lands in [IDEAL, IDEAL * RATIO); the fine step is a quarter of it and fades
 * from invisible to full as it grows across that range.
 */
export function gridLevels(zoom: number): GridLevel[] {
  if (!(zoom > 0) || !Number.isFinite(zoom)) return [];
  const k = Math.ceil(Math.log(IDEAL / (GRID_BASE * zoom)) / Math.log(RATIO));
  const coarse = GRID_BASE * RATIO ** k * zoom;
  const fine = coarse / RATIO;
  const alpha = clamp01((fine - IDEAL / RATIO) / (IDEAL - IDEAL / RATIO));
  const levels: GridLevel[] = [{ step: coarse, alpha: 1 }];
  // The fine level is densest exactly where it is faintest, so below this it
  // costs a few thousand dots to draw something nobody can see.
  if (alpha > FADE_IN) levels.push({ step: fine, alpha });
  return levels;
}
