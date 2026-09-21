import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TOKENS = readFileSync(fileURLToPath(new URL('../tokens.css', import.meta.url)), 'utf8');

/** Declarations from one block, by custom property name. */
function block(selector: RegExp): Map<string, string> {
  const m = selector.exec(TOKENS);
  if (!m) throw new Error(`no block for ${selector}`);
  const out = new Map<string, string>();
  for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(d[1], d[2].trim());
  return out;
}

const LIGHT = block(/:root \{([\s\S]*?)\n\}/);
const DARK = block(/:root\[data-theme='dark'\] \{([\s\S]*?)\n\}/);
const SYSTEM_DARK = block(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{([\s\S]*?)\n {2}\}/);

type RGB = [number, number, number];

function parse(colour: string): RGB {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(colour);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => parseFloat(p));
    return [parts[0], parts[1], parts[2]];
  }
  throw new Error(`cannot parse colour ${colour}`);
}

/** WCAG relative luminance. */
function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(parse(a)), luminance(parse(b))];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

/** Foreground on background, as the stylesheets actually pair them. */
const PAIRS: { name: string; fg: string; bg: string; min: number }[] = [
  // Body text. AA for normal text is 4.5.
  { name: 'text on surface', fg: '--text', bg: '--surface', min: 4.5 },
  { name: 'text on sunken surface', fg: '--text', bg: '--surface-sunken', min: 4.5 },
  { name: 'text on hovered surface', fg: '--text', bg: '--surface-hover', min: 4.5 },
  { name: 'muted text on surface', fg: '--text-muted', bg: '--surface', min: 4.5 },
  { name: 'muted text on sunken surface', fg: '--text-muted', bg: '--surface-sunken', min: 4.5 },
  { name: 'muted text on muted surface', fg: '--text-muted', bg: '--surface-muted', min: 4.5 },
  // Text on a filled control.
  { name: 'inverse text on accent', fg: '--text-inverse', bg: '--accent', min: 4.5 },
  { name: 'tooltip text on tooltip', fg: '--tooltip-text', bg: '--tooltip-bg', min: 4.5 },
  // Status pills.
  { name: 'danger text on its pill', fg: '--danger-text', bg: '--danger-bg', min: 4.5 },
  { name: 'success text on its pill', fg: '--success-text', bg: '--success-bg', min: 4.5 },
  { name: 'warning text on its pill', fg: '--warning-text', bg: '--warning-bg', min: 4.5 },
  // Borders and focus rings are UI components: AA for those is 3.
  { name: 'border on surface', fg: '--border', bg: '--surface', min: 1.4 },
  { name: 'strong border on surface', fg: '--border-strong', bg: '--surface', min: 3 },
  { name: 'accent ring on surface', fg: '--accent', bg: '--surface', min: 3 },
  { name: 'accent ring on sunken surface', fg: '--accent', bg: '--surface-sunken', min: 3 },
  // Canvas chrome against the board.
  { name: 'selection frame on the board', fg: '--accent', bg: '--canvas-bg', min: 3 },
  { name: 'guides on the board', fg: '--canvas-guide', bg: '--canvas-bg', min: 3 },
  { name: 'frame border on the board', fg: '--canvas-frame-border', bg: '--canvas-bg', min: 1.5 },
  // A sticky note is a pale colour in either theme, so its text is fixed.
  { name: 'sticky text on the palest note', fg: '--canvas-shape-text', bg: '#fff59d', min: 4.5 },
  { name: 'sticky text on the darkest note', fg: '--canvas-shape-text', bg: '#ce93d8', min: 4.5 },
];

/** Colours the stylesheets pair with something outside the token set. */
const LITERALS: Record<string, string> = { '#fff59d': '#fff59d', '#ce93d8': '#ce93d8' };

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme contrast', (_name, tokens) => {
  const value = (token: string) => LITERALS[token] ?? tokens.get(token) ?? LIGHT.get(token);

  // Written down rather than eyeballed: a palette that reads fine to the
  // person who picked it is the usual way this goes wrong.
  it.each(PAIRS)('$name is at least $min:1', ({ fg, bg, min }) => {
    const a = value(fg);
    const b = value(bg);
    expect(a, fg).toBeDefined();
    expect(b, bg).toBeDefined();
    expect(contrast(a!, b!)).toBeGreaterThanOrEqual(min);
  });
});

describe('the two dark blocks', () => {
  // CSS cannot share one block between a media query and an attribute
  // selector, so dark is written twice. Drift between them would give someone
  // a different dark depending on how they arrived at it.
  it('declare exactly the same values', () => {
    expect(Object.fromEntries(SYSTEM_DARK)).toEqual(Object.fromEntries(DARK));
  });

  it('override every colour the light block declares', () => {
    const colours = [...LIGHT].filter(([, v]) => /^#|^rgba?\(/.test(v)).map(([k]) => k);
    // Text on an accent fill is white in both themes, so it is listed but equal.
    expect([...colours].sort()).toEqual([...DARK.keys()].sort());
  });
});
