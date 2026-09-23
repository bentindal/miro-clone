import { describe, expect, it } from 'vitest';
import { type Mark, diffText, hasMarkOver, linkAt, normalizeMarks, remapMarks, removeMark, runsFor, toggleMark } from '../marks';

const bold = (from: number, to: number): Mark => ({ kind: 'bold', from, to, href: '' });
const link = (from: number, to: number, href: string): Mark => ({ kind: 'link', from, to, href });
const plain = (marks: Mark[]) => marks.map((m) => `${m.kind}${m.href ? `(${m.href})` : ''}:${m.from}-${m.to}`);

describe('normalizing marks', () => {
  it('drops empty and backwards ranges', () => {
    expect(normalizeMarks([bold(3, 3), bold(5, 2)])).toEqual([]);
  });

  it('joins touching and overlapping ranges of the same kind', () => {
    expect(plain(normalizeMarks([bold(0, 3), bold(3, 6)]))).toEqual(['bold:0-6']);
    expect(plain(normalizeMarks([bold(0, 4), bold(2, 9)]))).toEqual(['bold:0-9']);
  });

  it('leaves different kinds alone, and links with different targets apart', () => {
    expect(plain(normalizeMarks([bold(0, 3), { kind: 'italic', from: 0, to: 3, href: '' }]))).toEqual(['bold:0-3', 'italic:0-3']);
    expect(plain(normalizeMarks([link(0, 3, 'a'), link(3, 6, 'b')]))).toEqual(['link(a):0-3', 'link(b):3-6']);
  });

  it('clamps to the length of the text', () => {
    expect(plain(normalizeMarks([bold(2, 99)], 10))).toEqual(['bold:2-10']);
  });
});

describe('asking whether a range is marked', () => {
  it('is true only when every character carries it', () => {
    expect(hasMarkOver([bold(0, 10)], 'bold', 2, 5)).toBe(true);
    expect(hasMarkOver([bold(0, 4)], 'bold', 2, 5)).toBe(false);
    expect(hasMarkOver([bold(0, 3), bold(3, 8)], 'bold', 1, 7)).toBe(true);
    expect(hasMarkOver([bold(0, 3), bold(4, 8)], 'bold', 1, 7)).toBe(false);
  });

  it('is false for an empty range, so a bare caret is not "already bold"', () => {
    expect(hasMarkOver([bold(0, 10)], 'bold', 4, 4)).toBe(false);
  });
});

describe('toggling', () => {
  // Pressing bold on something already bold has to un-bold it, or the button
  // is a one-way switch that lies about its state.
  it('turns a range on, then off again', () => {
    const on = toggleMark([], 'bold', 2, 6);
    expect(plain(on)).toEqual(['bold:2-6']);
    expect(plain(toggleMark(on, 'bold', 2, 6))).toEqual([]);
  });

  it('turns on when only part of the range is marked', () => {
    expect(plain(toggleMark([bold(2, 4)], 'bold', 2, 6))).toEqual(['bold:2-6']);
  });

  it('splits a mark when the middle is turned off', () => {
    expect(plain(removeMark([bold(0, 10)], 'bold', 4, 6))).toEqual(['bold:0-4', 'bold:6-10']);
  });

  it('ignores an empty range', () => {
    expect(toggleMark([], 'bold', 5, 5)).toEqual([]);
  });

  // Re-linking selected text should move it, not leave two links on it.
  it('replaces a link rather than layering one over another', () => {
    const first = toggleMark([], 'link', 0, 5, 'https://a.example');
    const second = toggleMark(first, 'link', 0, 5, 'https://b.example');
    expect(plain(second)).toEqual(['link(https://b.example):0-5']);
    expect(linkAt(second, 2)).toBe('https://b.example');
    expect(linkAt(second, 9)).toBe('');
  });
});

describe('finding what changed in the text', () => {
  it('reads a typed character, a deletion and a replacement', () => {
    expect(diffText('abc', 'abxc')).toEqual({ at: 2, removed: 0, inserted: 1 });
    expect(diffText('abxc', 'abc')).toEqual({ at: 2, removed: 1, inserted: 0 });
    expect(diffText('hello world', 'hello there')).toEqual({ at: 6, removed: 5, inserted: 5 });
  });

  it('reads no change as no change', () => {
    expect(diffText('same', 'same')).toEqual({ at: 4, removed: 0, inserted: 0 });
  });

  it('reads emptying and filling', () => {
    expect(diffText('abc', '')).toEqual({ at: 0, removed: 3, inserted: 0 });
    expect(diffText('', 'abc')).toEqual({ at: 0, removed: 0, inserted: 3 });
  });
});

describe('keeping marks on the right characters as the text changes', () => {
  it('shifts a mark when text is typed before it', () => {
    expect(plain(remapMarks([bold(4, 8)], { at: 0, removed: 0, inserted: 2 }, 12))).toEqual(['bold:6-10']);
  });

  it('extends a mark when text is typed inside it', () => {
    expect(plain(remapMarks([bold(4, 8)], { at: 6, removed: 0, inserted: 3 }, 13))).toEqual(['bold:4-11']);
  });

  // Typing on from the end of a bold word stays bold; typing up to the start
  // of one does not become bold. Symmetric in the data, so this is a choice.
  it('extends at the end and not at the start', () => {
    expect(plain(remapMarks([bold(4, 8)], { at: 8, removed: 0, inserted: 2 }, 12))).toEqual(['bold:4-10']);
    expect(plain(remapMarks([bold(4, 8)], { at: 4, removed: 0, inserted: 2 }, 12))).toEqual(['bold:6-10']);
  });

  it('leaves a mark alone when the change is after it', () => {
    expect(plain(remapMarks([bold(0, 4)], { at: 7, removed: 0, inserted: 3 }, 13))).toEqual(['bold:0-4']);
  });

  it('shrinks a mark when part of it is deleted, and drops it when all of it is', () => {
    expect(plain(remapMarks([bold(2, 10)], { at: 4, removed: 3, inserted: 0 }, 9))).toEqual(['bold:2-7']);
    expect(plain(remapMarks([bold(2, 6)], { at: 0, removed: 10, inserted: 0 }, 0))).toEqual([]);
  });

  it('keeps the formatting when a marked range is typed over', () => {
    expect(plain(remapMarks([bold(2, 6)], { at: 2, removed: 4, inserted: 7 }, 11))).toEqual(['bold:2-9']);
  });

  // The round trip a real edit takes: text in, diff, remap.
  it('follows a word swapped in the middle of a sentence', () => {
    const before = 'the quick fox';
    const after = 'the slow fox';
    const marks = [bold(4, 9)];
    const moved = remapMarks(marks, diffText(before, after), after.length);
    expect(after.slice(moved[0].from, moved[0].to)).toBe('slow');
  });
});

describe('splitting text into runs', () => {
  it('covers the text exactly, in order', () => {
    const text = 'hello world';
    const runs = runsFor(text, [bold(0, 5)]);
    expect(runs.map((r) => r.text).join('')).toBe(text);
    expect(runs.map((r) => [r.text, r.bold])).toEqual([
      ['hello', true],
      [' world', false],
    ]);
    expect(runs[1].start).toBe(5);
  });

  it('gives overlapping kinds a run that carries both', () => {
    const runs = runsFor('abcdef', [bold(0, 4), { kind: 'italic', from: 2, to: 6, href: '' }]);
    expect(runs.map((r) => [r.text, r.bold, r.italic])).toEqual([
      ['ab', true, false],
      ['cd', true, true],
      ['ef', false, true],
    ]);
  });

  it('carries a link target through', () => {
    const runs = runsFor('see docs', [link(4, 8, 'https://x.example')]);
    expect(runs.map((r) => r.href)).toEqual(['', 'https://x.example']);
  });

  it('joins neighbours that look the same rather than splitting a word', () => {
    expect(runsFor('abcdef', [bold(0, 2), bold(2, 4)]).map((r) => r.text)).toEqual(['abcd', 'ef']);
  });

  it('works on one line of a wrapped block', () => {
    const text = 'one two three';
    expect(runsFor(text, [bold(0, 7)], 4, 7).map((r) => [r.text, r.bold])).toEqual([['two', true]]);
  });

  it('returns nothing for an empty range', () => {
    expect(runsFor('abc', [], 2, 2)).toEqual([]);
    expect(runsFor('', [])).toEqual([]);
  });
});
