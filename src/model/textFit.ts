/**
 * Text layout shared by the canvas renderer and the in-place editor, so a
 * sticky note shows the same font size whether it is being drawn or typed
 * into. Measurement is injected: the renderer passes the canvas context's
 * measureText, tests pass a fixed-width stand-in.
 */
export type Measure = (text: string, font: string) => number;

export const STICKY_MIN_FONT = 10;
export const STICKY_MAX_FONT = 36;
export const STICKY_LINE_HEIGHT = 1.25;
export const STICKY_PAD = 10;

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
