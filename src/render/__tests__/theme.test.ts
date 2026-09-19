import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CANVAS_TOKENS, type CanvasTheme, LIGHT_CANVAS_THEME, resolveCanvasTheme } from '../theme';

const TOKENS_CSS = fileURLToPath(new URL('../../ui/tokens.css', import.meta.url));

/** Declarations inside the `:root` block of tokens.css, by custom property name. */
function declaredTokens(): Map<string, string> {
  const css = readFileSync(TOKENS_CSS, 'utf8');
  const root = /:root\s*\{([\s\S]*?)\}/.exec(css);
  if (!root) throw new Error('tokens.css has no :root block');
  const out = new Map<string, string>();
  for (const line of root[1].split(';')) {
    const m = /(--[\w-]+)\s*:\s*([^;]+)/.exec(line);
    if (m) out.set(m[1], m[2].trim());
  }
  return out;
}

describe('canvas theme', () => {
  const declared = declaredTokens();
  const keys = Object.keys(CANVAS_TOKENS) as (keyof CanvasTheme)[];

  it('declares every token it names', () => {
    for (const key of keys) {
      expect(declared.has(CANVAS_TOKENS[key]), `${CANVAS_TOKENS[key]} missing from tokens.css`).toBe(true);
    }
  });

  // The fallback exists because the canvas cannot read CSS variables and the
  // export path has no document. It is only safe while it agrees with the
  // stylesheet, so hold the two together here rather than by eye.
  it('fallback values match the stylesheet', () => {
    for (const key of keys) {
      expect(LIGHT_CANVAS_THEME[key], `theme.${key}`).toBe(declared.get(CANVAS_TOKENS[key]));
    }
  });

  it('falls back to the light theme with no document', () => {
    expect(resolveCanvasTheme(null)).toEqual(LIGHT_CANVAS_THEME);
  });

  it('covers every colour the renderer draws', () => {
    const src = readFileSync(fileURLToPath(new URL('../renderer.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
  });
});
