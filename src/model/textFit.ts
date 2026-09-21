/**
 * Text layout shared by the canvas renderer and the in-place editor, so a
 * sticky note shows the same font size whether it is being drawn or typed
 * into. Measurement is injected: the renderer passes the canvas context's
 * measureText, tests pass a fixed-width stand-in.
 */
import type { TextAlign, TextVAlign } from './types';

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

export function fontString(size: number): string {
  return `${size}px system-ui, sans-serif`;
}

/** Greedy word wrap; words wider than the line stay on their own line rather than being split. */
export function wrapText(text: string, width: number, font: string, measure: Measure): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, font) <= width || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface FitResult {
  size: number;
  font: string;
  lines: string[];
  lineHeight: number;
  /** True when even the smallest size overflows the box; the caller may grow the box. */
  overflow: boolean;
}

/**
 * Largest font size at which `text` wraps into a box of `w` by `h` (inside
 * `pad`), stepping down from STICKY_MAX_FONT to STICKY_MIN_FONT.
 */
export function fitText(text: string, w: number, h: number, pad: number, measure: Measure): FitResult {
  const width = Math.max(w - pad * 2, 1);
  const height = Math.max(h - pad * 2, 1);
  let last: FitResult | null = null;
  for (let size = STICKY_MAX_FONT; size >= STICKY_MIN_FONT; size -= 2) {
    const font = fontString(size);
    const lines = wrapText(text, width, font, measure);
    const lineHeight = size * STICKY_LINE_HEIGHT;
    const fitsHeight = lines.length * lineHeight <= height + 0.01;
    const fitsWidth = lines.every((l) => measure(l, font) <= width + 0.01);
    last = { size, font, lines, lineHeight, overflow: !(fitsHeight && fitsWidth) };
    if (!last.overflow) return last;
  }
  return last!;
}

/** Height a sticky needs to show all of `text` at the smallest font, keeping its width. */
export function requiredHeight(text: string, w: number, pad: number, measure: Measure): number {
  const font = fontString(STICKY_MIN_FONT);
  const lines = wrapText(text, Math.max(w - pad * 2, 1), font, measure);
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
