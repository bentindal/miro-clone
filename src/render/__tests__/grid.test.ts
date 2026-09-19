import { describe, expect, it } from 'vitest';
import { GRID_BASE, type GridLevel, gridLevels } from '../grid';

/**
 * How dark the dot at world position `j * GRID_BASE` is. A level draws that
 * dot when its world spacing divides the position, so the coarse level always
 * lands on dots the fine level already drew.
 */
function inkAtDot(levels: GridLevel[], zoom: number, j: number): number {
  let ink = 0;
  for (const level of levels) {
    const k = Math.round(Math.log(level.step / zoom / GRID_BASE) / Math.log(4));
    if (j % 4 ** k === 0) ink = Math.max(ink, level.alpha);
  }
  return ink;
}

describe('gridLevels', () => {
  it('keeps the coarse level in a legible band at every zoom', () => {
    for (let z = 0.05; z <= 8; z *= 1.01) {
      const [coarse] = gridLevels(z);
      expect(coarse.alpha).toBe(1);
      expect(coarse.step / 90, `zoom ${z}`).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(coarse.step / 90, `zoom ${z}`).toBeLessThan(4);
    }
  });

  /** The largest change in a dot's darkness between two adjacent zoom steps. */
  function largestJump(levelsAt: (zoom: number) => GridLevel[]): number {
    let worst = 0;
    let prev: number[] | null = null;
    for (let z = 0.05; z <= 8; z *= 1.001) {
      const levels = levelsAt(z);
      const ink = [];
      for (let j = 1; j <= 64; j++) ink.push(inkAtDot(levels, z, j));
      if (prev) for (let i = 0; i < ink.length; i++) worst = Math.max(worst, Math.abs(ink[i] - prev[i]));
      prev = ink;
    }
    return worst;
  }

  // The point of the change. The old grid multiplied its step by four at fixed
  // zoom levels, so three quarters of the dots vanished in one frame: a jump
  // of a full 1.0. The only discontinuity left is dropping the fine level once
  // it is under 6% opacity, which is what the bound below is.
  it('never changes a dot abruptly', () => {
    expect(largestJump(gridLevels)).toBeLessThanOrEqual(0.061);
  });

  it('is what the old fixed-step grid could not do', () => {
    const stepped = (zoom: number): GridLevel[] => {
      let step = GRID_BASE * zoom;
      while (step < 24) step *= 4;
      while (step > 200) step /= 4;
      return [{ step, alpha: 1 }];
    };
    // Guards the test above: it has to be able to tell the two apart.
    expect(largestJump(stepped)).toBe(1);
  });

  it('nests the fine level inside the coarse one', () => {
    for (let z = 0.05; z <= 8; z *= 1.05) {
      const levels = gridLevels(z);
      if (levels.length < 2) continue;
      expect(levels[0].step / levels[1].step).toBeCloseTo(4, 9);
      expect(levels[1].alpha).toBeLessThanOrEqual(1);
      expect(levels[1].alpha).toBeGreaterThan(0);
    }
  });

  it('drops the fine level rather than drawing thousands of invisible dots', () => {
    // At this zoom the coarse level sits exactly on the ideal spacing, so the
    // fine level is at its densest and its faintest.
    expect(gridLevels(90 / GRID_BASE)).toHaveLength(1);
    // And at 1:1, where the finest dots would be 25px apart at 4% opacity.
    expect(gridLevels(1)).toHaveLength(1);
  });

  it('returns nothing for a zoom that cannot be drawn', () => {
    expect(gridLevels(0)).toEqual([]);
    expect(gridLevels(Number.NaN)).toEqual([]);
    expect(gridLevels(Number.POSITIVE_INFINITY)).toEqual([]);
  });
});
