import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const TOKENS = read('../tokens.css');
const PRIMITIVES = read('../primitives.css');
const APP = read('../../app.css');

/** Custom properties declared in the `:root` block. */
function declared(): Set<string> {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(TOKENS);
  if (!root) throw new Error('tokens.css has no :root block');
  return new Set([...root[1].matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

/** Strip comments so prose does not read as a declaration. */
const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

describe('design tokens', () => {
  it('are the only place a colour is written', () => {
    expect(code(APP)).not.toMatch(COLOUR);
    expect(code(PRIMITIVES)).not.toMatch(COLOUR);
  });

  it('cover every custom property the stylesheets use', () => {
    const names = declared();
    const used = new Set([...`${APP}${PRIMITIVES}`.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    const undeclaredNames = [...used].filter((n) => !names.has(n));
    expect(undeclaredNames).toEqual([]);
  });

  // The roadmap's measurement was four separate definitions of "a button".
  // Styling buttons by element or descendant is how that happened, so the
  // primitives own the `.ui-button` class and nothing else targets the element.
  it('leave buttons to the primitives', () => {
    let checked = 0;
    for (const file of readdirSync(fileURLToPath(new URL('../..', import.meta.url)), { recursive: true, encoding: 'utf8' })) {
      if (!file.endsWith('.css') || file.endsWith('primitives.css')) continue;
      checked++;
      const css = code(read(`../../${file}`));
      const selectors = css.split('}').map((block) => block.split('{')[0]);
      const offenders = selectors.filter((s) => /(^|[\s,>])button\b/.test(s));
      expect(offenders, `${file} styles buttons directly`).toEqual([]);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
