/**
 * Text layout shared by the canvas renderer and the in-place editor, so a
 * sticky note shows the same font size whether it is being drawn or typed
 * into. Measurement is injected: the renderer passes the canvas context's
 * measureText, tests pass a fixed-width stand-in.
 */
import { type Mark, runsFor } from './marks';
import type { ListStyle, TextAlign, TextVAlign } from './types';

export type Measure = (text: string, font: string) => number;

export const STICKY_MIN_FONT = 10;
export const STICKY_MAX_FONT = 36;
export const STICKY_LINE_HEIGHT = 1.25;
export const STICKY_PAD = 10;

/** Tag chip metrics, shared so the renderer and the in-place editor agree. */
export const TAG_FONT = 11;
export const TAG_HEIGHT = 16;
export const TAG_PAD = 6;
export const TAG_GAP = 4;

/**
 * The box a note's text gets. Tags take a row off the top, so the two never
 * overlap and a note with tags simply has less room for words — which the
 * auto-fit then answers by choosing a smaller size or growing the note.
 */
export function stickyTextBox(s: { x: number; y: number; w: number; h: number; tags: readonly string[] }): { x: number; y: number; w: number; h: number } {
  const inset = tagInset(s.tags);
  return { x: s.x, y: s.y + inset, w: s.w, h: Math.max(s.h - inset, 1) };
}

/** How much height the tag row takes off the top of a note, zero when there are none. */
export function tagInset(tags: readonly string[]): number {
  return tags.length > 0 ? TAG_HEIGHT + TAG_GAP : 0;
}

/** Chip widths for `tags`, and how many fit across a note `w` wide. */
export function layoutTags(tags: readonly string[], w: number, measure: Measure): { widths: number[]; shown: number } {
  const font = fontString(TAG_FONT);
  const widths = tags.map((t) => Math.ceil(measure(t, font)) + TAG_PAD * 2);
  const room = Math.max(w - STICKY_PAD * 2, 1);
  let used = 0;
  let shown = 0;
  for (const width of widths) {
    const next = used + width + (shown > 0 ? TAG_GAP : 0);
    // The first chip is always drawn, even on a note too narrow for it: a
    // clipped tag still says the note has one, an empty row says nothing.
    if (next > room && shown > 0) break;
    used = next;
    shown++;
  }
  return { widths, shown };
}

export function fontString(size: number, bold = false, italic = false): string {
  return `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}${size}px system-ui, sans-serif`;
}

/** Half-open character range of one wrapped line. */
export interface LineRange {
  from: number;
  to: number;
}

/** Width of a character range, however it happens to be formatted. */
export type WidthOf = (from: number, to: number) => number;

/**
 * Measure a range with its formatting applied. Bold is wider than regular, so
 * wrapping that measured everything in one font would wrap bold text too late
 * and regular text too early.
 */
export function widthOfStyled(text: string, marks: readonly Mark[], size: number, measure: Measure): WidthOf {
  return (from, to) => runsFor(text, marks, from, to).reduce((w, r) => w + measure(r.text, fontString(size, r.bold, r.italic)), 0);
}

/** Room a list marker takes at the start of every line, in the same units as the text. */
export function listIndent(size: number, list: ListStyle): number {
  return list === 'none' ? 0 : size * 1.6;
}

/** What is drawn before line `i` of a list, or an empty string. */
export function listMarker(list: ListStyle, i: number): string {
  return list === 'bullet' ? '•' : list === 'number' ? `${i + 1}.` : '';
}

/**
 * Greedy word wrap over character offsets rather than strings, so the caller
 * can measure a line with its formatting. Words wider than the line stay on
 * their own line rather than being split.
 */
export function wrapRanges(text: string, width: number, widthOf: WidthOf): LineRange[] {
  const out: LineRange[] = [];
  let paraStart = 0;
  for (const para of text.split('\n')) {
    const paraEnd = paraStart + para.length;
    let lineStart = paraStart;
    let lineEnd = paraStart;
    let i = paraStart;
    while (i < paraEnd) {
      let wordEnd = i;
      while (wordEnd < paraEnd && text[wordEnd] !== ' ') wordEnd++;
      if (lineEnd === lineStart || widthOf(lineStart, wordEnd) <= width) {
        // The first word goes on the line whatever it measures: a line with
        // nothing on it would not wrap any better on the next pass.
        lineEnd = wordEnd;
      } else {
        out.push({ from: lineStart, to: lineEnd });
        lineStart = i;
        lineEnd = wordEnd;
      }
      i = wordEnd;
      while (i < paraEnd && text[i] === ' ') i++;
    }
    out.push({ from: lineStart, to: lineEnd });
    paraStart = paraEnd + 1;
  }
  return out;
}

/** Greedy word wrap of unformatted text, which is `wrapRanges` with one font. */
export function wrapText(text: string, width: number, font: string, measure: Measure): string[] {
  return wrapRanges(text, width, (from, to) => measure(text.slice(from, to), font)).map((r) => text.slice(r.from, r.to));
}

export interface FitResult {
  size: number;
  font: string;
  lines: string[];
  /** The same lines as character ranges, for drawing them with their formatting. */
  ranges: LineRange[];
  lineHeight: number;
  /** True when even the smallest size overflows the box; the caller may grow the box. */
  overflow: boolean;
}

export interface StyledText {
  marks?: readonly Mark[];
  list?: ListStyle;
}

/**
 * Largest font size at which `text` wraps into a box of `w` by `h` (inside
 * `pad`), stepping down from STICKY_MAX_FONT to STICKY_MIN_FONT. Formatting
 * is measured, because bold is wider, and a list marker takes room off the
 * front of every line.
 */
export function fitText(text: string, w: number, h: number, pad: number, measure: Measure, styled: StyledText = {}): FitResult {
  const marks = styled.marks ?? [];
  const list = styled.list ?? 'none';
  const height = Math.max(h - pad * 2, 1);
  let last: FitResult | null = null;
  for (let size = STICKY_MAX_FONT; size >= STICKY_MIN_FONT; size -= 2) {
    const width = Math.max(w - pad * 2 - listIndent(size, list), 1);
    const font = fontString(size);
    const widthOf = widthOfStyled(text, marks, size, measure);
    const ranges = wrapRanges(text, width, widthOf);
    const lines = ranges.map((r) => text.slice(r.from, r.to));
    const lineHeight = size * STICKY_LINE_HEIGHT;
    const fitsHeight = lines.length * lineHeight <= height + 0.01;
    const fitsWidth = ranges.every((r) => widthOf(r.from, r.to) <= width + 0.01);
    last = { size, font, lines, ranges, lineHeight, overflow: !(fitsHeight && fitsWidth) };
    if (!last.overflow) return last;
  }
  return last!;
}

/** Height a sticky needs to show all of `text` at the smallest font, keeping its width. */
export function requiredHeight(text: string, w: number, pad: number, measure: Measure, styled: StyledText = {}): number {
  const list = styled.list ?? 'none';
  const width = Math.max(w - pad * 2 - listIndent(STICKY_MIN_FONT, list), 1);
  const lines = wrapRanges(text, width, widthOfStyled(text, styled.marks ?? [], STICKY_MIN_FONT, measure));
  return Math.ceil(lines.length * STICKY_MIN_FONT * STICKY_LINE_HEIGHT + pad * 2);
}

export interface TextBlockLayout {
  /** What to set `ctx.textAlign` to, and the CSS `text-align` to match. */
  textAlign: TextAlign;
  /** x to draw every line at, given that `textAlign`. */
  x: number;
  /** y of the top of the first line. */
  y: number;
}

/**
 * Where a block of `lines` sits inside a box. Horizontal alignment is the
 * canvas's own; vertical has no canvas equivalent, so it is an offset the
 * caller applies to the first line.
 *
 * Text taller than the box is pinned to the top rather than allowed to start
 * above it, so the first line is always the one you can read.
 */
export function layoutTextBlock(
  box: { x: number; y: number; w: number; h: number },
  pad: number,
  lines: number,
  lineHeight: number,
  align: TextAlign,
  valign: TextVAlign,
): TextBlockLayout {
  const x = align === 'left' ? box.x + pad : align === 'right' ? box.x + box.w - pad : box.x + box.w / 2;
  const blockHeight = lines * lineHeight;
  const free = box.h - pad * 2 - blockHeight;
  const offset = valign === 'top' ? 0 : valign === 'bottom' ? free : free / 2;
  return { textAlign: align, x, y: box.y + pad + Math.max(0, offset) };
}
