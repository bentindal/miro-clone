import { describe, expect, it } from 'vitest';
import type { TextAlign, TextVAlign } from '../types';
import { STICKY_MAX_FONT, STICKY_MIN_FONT, STICKY_PAD, TAG_GAP, TAG_HEIGHT, TAG_PAD, fitText, layoutTags, layoutTextBlock, requiredHeight, stickyTextBox, tagInset, wrapText } from '../textFit';

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

describe('tags on a note', () => {
  const note = (tags: string[]) => ({ x: 100, y: 200, w: 120, h: 120, tags });

  it('take a row off the top of the text box, and nothing when there are none', () => {
    expect(stickyTextBox(note([]))).toEqual({ x: 100, y: 200, w: 120, h: 120 });
    expect(tagInset([])).toBe(0);
    const tagged = stickyTextBox(note(['one']));
    expect(tagged.y).toBe(200 + TAG_HEIGHT + TAG_GAP);
    expect(tagged.h).toBe(120 - TAG_HEIGHT - TAG_GAP);
    // One row, however many tags there are: they do not stack.
    expect(stickyTextBox(note(['one', 'two', 'three']))).toEqual(tagged);
  });

  // The text has to lose the room the chips take, or the two would overlap
  // and the auto-fit would think it had more space than it does.
  it('leave the text less room, which the fit answers with a smaller size', () => {
    const text = 'a fairly long sentence that has to wrap a few times';
    const plain = fitText(text, 120, 120, STICKY_PAD, measure);
    const box = stickyTextBox(note(['todo']));
    const tagged = fitText(text, box.w, box.h, STICKY_PAD, measure);
    expect(tagged.size).toBeLessThanOrEqual(plain.size);
    expect(tagged.lines.length * tagged.lineHeight).toBeLessThanOrEqual(box.h - STICKY_PAD * 2 + 0.01);
  });

  it('measures a chip as its label plus padding', () => {
    const { widths } = layoutTags(['ab'], 500, measure);
    expect(widths[0]).toBe(Math.ceil(measure('ab', '11px x')) + TAG_PAD * 2);
  });

  it('shows as many chips as fit across the note and counts the rest', () => {
    const tags = ['alpha', 'bravo', 'charlie', 'delta'];
    const wide = layoutTags(tags, 1000, measure);
    expect(wide.shown).toBe(4);
    const narrow = layoutTags(tags, 90, measure);
    expect(narrow.shown).toBeLessThan(4);
    const used = narrow.widths.slice(0, narrow.shown).reduce((a, b) => a + b, 0) + (narrow.shown - 1) * TAG_GAP;
    expect(used).toBeLessThanOrEqual(90 - STICKY_PAD * 2);
  });

  // An empty row would say the note has no tags, which would be a lie.
  it('always draws the first chip, even on a note too narrow for it', () => {
    expect(layoutTags(['a-very-long-tag-indeed'], 40, measure).shown).toBe(1);
  });
});
