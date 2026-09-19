import type { CanvasTheme } from '../render/theme';
import type { Tool } from './tools';

/**
 * Cursors drawn per tool, rather than `crosshair` for all of them.
 *
 * Each is a crosshair with the tool's mark beside it, stroked twice: a thick
 * pass in the surface colour and a thin pass in the text colour. The halo is
 * what makes it readable over a dark shape, a photo or a pale board, and
 * taking both colours from the canvas theme is what makes it follow a theme
 * change instead of disappearing into it.
 */

/** Crosshair centred on the hotspot. */
const CROSS = 'M8 2.5v11M2.5 8h11';

/** Mark for each tool, drawn in the lower right of a 24x24 box. */
const MARKS: Partial<Record<Tool, string>> = {
  rect: 'M14.5 15.5h7v5h-7z',
  ellipse: 'M22 18a3.5 2.5 0 0 1-7 0 3.5 2.5 0 0 1 7 0z',
  line: 'M14.5 21.5 22 14.5',
  sticky: 'M14.5 14.5h7v4l-3 3h-4z',
  text: 'M14.5 15.5h7M18 15.5v6',
  pen: 'M14.5 21.5l.7-2.5 4.3-4.3 1.8 1.8-4.3 4.3z',
  connector: 'M14.5 21.5h3.5a3.5 3.5 0 0 0 3.5-3.5v-3.5',
  frame: 'M17 13.5v8.5M13.5 17h8.5',
  comment: 'M21.5 17.5a3.5 3 0 0 1-3.5 3 5 5 0 0 1-.9-.1l-2.6.6.8-1.6a3 3 0 0 1-1.3-2.4 3.5 3 0 0 1 3.5-3 3.5 3 0 0 1 4 3z',
};

const cache = new Map<string, string>();

/** The CSS `cursor` value for a tool, or null when the browser's own is right. */
export function toolCursor(tool: Tool, theme: CanvasTheme): string | null {
  const mark = MARKS[tool];
  if (!mark) return null;
  const key = `${tool}|${theme.surface}|${theme.text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const paths = `<path d="${CROSS}"/><path d="${mark}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<g stroke="${theme.surface}" stroke-width="3.5">${paths}</g>` +
    `<g stroke="${theme.text}" stroke-width="1.5">${paths}</g>` +
    `</svg>`;
  // The hotspot is the crosshair's centre, not the corner of the image.
  const value = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 8, crosshair`;
  cache.set(key, value);
  return value;
}
