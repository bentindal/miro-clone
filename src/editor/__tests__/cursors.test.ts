import { describe, expect, it } from 'vitest';
import { LIGHT_CANVAS_THEME } from '../../render/theme';
import { toolCursor } from '../cursors';
import { TOOLS } from '../tools';

/** The SVG inside a `url("data:image/svg+xml,…")` cursor value. */
function svgOf(cursor: string): string {
  const m = /^url\("data:image\/svg\+xml,(.*)"\) (\d+) (\d+), crosshair$/.exec(cursor);
  expect(m, `not a cursor value: ${cursor.slice(0, 60)}`).not.toBeNull();
  return decodeURIComponent(m![1]);
}

describe('tool cursors', () => {
  // Select and hand keep the browser's own arrow and grab hand, which people
  // already read correctly; everything that draws gets a mark of its own.
  const DRAWING = TOOLS.filter((t) => t !== 'select' && t !== 'hand');

  it('give every drawing tool its own cursor', () => {
    const seen = new Map<string, string>();
    for (const tool of DRAWING) {
      const cursor = toolCursor(tool, LIGHT_CANVAS_THEME);
      expect(cursor, tool).not.toBeNull();
      const svg = svgOf(cursor!);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      const previous = seen.get(svg);
      expect(previous, `${tool} and ${previous} draw the same cursor`).toBeUndefined();
      seen.set(svg, tool);
    }
  });

  it('leave select and hand to the browser', () => {
    expect(toolCursor('select', LIGHT_CANVAS_THEME)).toBeNull();
    expect(toolCursor('hand', LIGHT_CANVAS_THEME)).toBeNull();
  });

  it('put the hotspot on the crosshair, not the corner of the image', () => {
    const m = /"\) (\d+) (\d+), /.exec(toolCursor('rect', LIGHT_CANVAS_THEME)!);
    expect(m?.slice(1)).toEqual(['8', '8']);
  });

  // A cursor with no halo vanishes over a dark shape, and one with hardcoded
  // colours vanishes under a second theme.
  it('take both their colours from the theme', () => {
    const svg = svgOf(toolCursor('pen', { ...LIGHT_CANVAS_THEME, surface: '#abcdef', text: '#fedcba' })!);
    expect(svg).toContain('stroke="#abcdef"');
    expect(svg).toContain('stroke="#fedcba"');
    expect(svg).not.toContain(LIGHT_CANVAS_THEME.surface);
  });

  // A raw '#' ends the URL and a raw '"' ends the quoted value, so an
  // unencoded payload yields a cursor the browser silently ignores.
  it('URL-encode the payload, so the data URL survives the characters SVG needs', () => {
    const payload = /data:image\/svg\+xml,(.*)"\)/.exec(toolCursor('comment', LIGHT_CANVAS_THEME)!)![1];
    for (const raw of ['<', '>', '"', '#']) expect(payload, `raw ${raw}`).not.toContain(raw);
    expect(decodeURIComponent(payload)).toContain('<svg');
  });
});
