import { describe, expect, it } from 'vitest';
import type { TextAlign, TextVAlign } from '../types';
import { STICKY_MAX_FONT, STICKY_MIN_FONT, fitText, layoutTextBlock, requiredHeight, wrapText } from '../textFit';

/** Every character is 0.6 em wide, like a typical sans-serif average. */
const measure = (text: string, font: string) => text.length * 0.6 * parseFloat(font);

describe('wrapText', () => {
  it('wraps on spaces and keeps paragraphs', () => {
    expect(wrapText('one two three four', 50, '10px x', measure)).toEqual(['one two', 'three', 'four']);
    expect(wrapText('a\nb c', 100, '10px x', measure)).toEqual(['a', 'b c']);
  });

  it('leaves an over-long word on its own line', () => {
    expect(wrapText('supercalifragilistic ok', 30, '10px x', measure)).toEqual(['supercalifragilistic', 'ok']);
  });
});

describe('fitText', () => {
  it('uses the largest size for short text and shrinks for long text', () => {
    const short = fitText('Hi', 120, 120, 10, measure);
    expect(short.size).toBe(STICKY_MAX_FONT);
    expect(short.overflow).toBe(false);
    const long = fitText('The quick brown fox jumps over the lazy dog again and again', 120, 120, 10, measure);
    expect(long.size).toBeLessThan(short.size);
    expect(long.size).toBeGreaterThanOrEqual(STICKY_MIN_FONT);
    expect(long.overflow).toBe(false);
    // Every line fits the inner width and all lines fit the inner height.
    for (const l of long.lines) expect(measure(l, long.font)).toBeLessThanOrEqual(100);
    expect(long.lines.length * long.lineHeight).toBeLessThanOrEqual(100);
  });

  it('is monotonic: more text never gets a bigger font', () => {
    let prev = STICKY_MAX_FONT;
    let text = 'word';
    for (let i = 0; i < 40; i++) {
      const r = fitText(text, 120, 120, 10, measure);
      expect(r.size).toBeLessThanOrEqual(prev);
      prev = r.size;
      text += ' word';
    }
  });

  it('reports overflow at the smallest size and requiredHeight says how tall the note must be', () => {
    const text = Array.from({ length: 80 }, () => 'lorem ipsum').join(' ');
    const r = fitText(text, 120, 120, 10, measure);
    expect(r.size).toBe(STICKY_MIN_FONT);
    expect(r.overflow).toBe(true);
    const h = requiredHeight(text, 120, 10, measure);
    expect(h).toBeGreaterThan(120);
    expect(fitText(text, 120, h, 10, measure).overflow).toBe(false);
  });
});

describe('layoutTextBlock', () => {
  const box = { x: 100, y: 200, w: 200, h: 100 };
  const PAD = 10;
  // Two 20px lines in an 80px-tall inner box: 40px spare.
  const two = (align: TextAlign, valign: TextVAlign) => layoutTextBlock(box, PAD, 2, 20, align, valign);

  it('puts the block where the note says, horizontally', () => {
    expect(two('left', 'top')).toMatchObject({ x: 110, textAlign: 'left' });
    expect(two('center', 'top')).toMatchObject({ x: 200, textAlign: 'center' });
    expect(two('right', 'top')).toMatchObject({ x: 290, textAlign: 'right' });
  });

  it('puts the block where the note says, vertically', () => {
    expect(two('center', 'top').y).toBe(210);
    expect(two('center', 'middle').y).toBe(230);
    expect(two('center', 'bottom').y).toBe(250);
  });

  it('centres by default, which is where a note with one line reads best', () => {
    // One 20px line, 60px spare: half above, half below.
    expect(layoutTextBlock(box, PAD, 1, 20, 'center', 'middle')).toMatchObject({ x: 200, y: 240, textAlign: 'center' });
  });

  // Otherwise the first line of an overflowing note starts above the note and
  // the part you can read is the middle of the text rather than its start.
  it('pins text taller than the note to the top, whatever the alignment', () => {
    for (const valign of ['top', 'middle', 'bottom'] as const) {
      expect(layoutTextBlock(box, PAD, 10, 20, 'center', valign).y, valign).toBe(210);
    }
  });
});
