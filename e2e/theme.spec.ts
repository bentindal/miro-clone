import { expect, test } from '@playwright/test';
import { openBoard } from './helpers';

/** Colour of one device pixel of the canvas, as `r,g,b`. */
async function pixel(page: import('@playwright/test').Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const dpr = window.devicePixelRatio || 1;
      const d = ctx.getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data;
      return `${d[0]},${d[1]},${d[2]}`;
    },
    [x, y],
  );
}

test.describe('theme', () => {
  // The canvas cannot read CSS variables, so the tokens reach it through a
  // resolved theme object. This is what makes a second theme a token block
  // rather than a find-and-replace across CSS and the renderer.
  test('the canvas takes its colours from the CSS tokens', async ({ page }) => {
    await openBoard(page);
    const theme = await page.evaluate(() => (window as never as { __wb: { theme: () => Record<string, string> } }).__wb.theme());
    expect(theme.background).toBe('#f4f5f7');
    expect(theme.accent).toBe('#2f6fed');
    // (50, 50) sits between grid dots, which are drawn every 100px from the origin.
    expect(await pixel(page, 50, 50)).toBe('244,245,247');

    // One declaration moves both surfaces.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--canvas-bg', '#101214');
      document.documentElement.style.setProperty('--accent', '#ff00aa');
      (window as never as { __wb: { editor: { refreshTheme: () => void; renderNow: () => number } } }).__wb.editor.refreshTheme();
      (window as never as { __wb: { editor: { renderNow: () => number } } }).__wb.editor.renderNow();
    });
    const after = await page.evaluate(() => (window as never as { __wb: { theme: () => Record<string, string> } }).__wb.theme());
    expect(after.background).toBe('#101214');
    expect(after.accent).toBe('#ff00aa');
    expect(await pixel(page, 50, 50)).toBe('16,18,20');

    // The DOM followed the same declaration: the active tool button is accent-filled.
    // Polled because the button transitions its background over --duration-fast.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.querySelector('[data-tool="select"]') as Element).backgroundColor))
      .toBe('rgb(255, 0, 170)');
  });

  test('every tool and action button carries an icon', async ({ page }) => {
    await openBoard(page);
    const missing = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('.toolbar [data-tool], .toolbar [data-action]')) {
        const id = el.getAttribute('data-tool') ?? el.getAttribute('data-action') ?? '?';
        // Load is a file input inside a label styled as a button, so look at the control.
        const control = el.closest('.ui-button') ?? el;
        if (!control.querySelector('svg[data-icon]')) out.push(id);
      }
      return out;
    });
    expect(missing).toEqual([]);
  });
});
