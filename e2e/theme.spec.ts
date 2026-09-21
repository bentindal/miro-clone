import { expect, test } from '@playwright/test';
import { openBoardMenu, openBoard } from './helpers';

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
    // Grid dots sit on multiples of the level's spacing from the origin; this
    // point is on no plausible one.
    expect(await pixel(page, 57, 43)).toBe('244,245,247');

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
    expect(await pixel(page, 57, 43)).toBe('16,18,20');

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
      for (const el of document.querySelectorAll<HTMLElement>('.tool-rail [data-tool], .zoom-cluster [data-action], .dock-tabs [data-action]')) {
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

test.describe('appearance', () => {
  /** What the document root says, which is what the token blocks key off. */
  const attrs = (page: import('@playwright/test').Page) =>
    page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      density: document.documentElement.getAttribute('data-density'),
    }));

  const surfaceOf = (page: import('@playwright/test').Page) => page.locator('.top-bar').evaluate((el) => getComputedStyle(el).backgroundColor);

  test('choosing dark repaints the DOM and the canvas together', async ({ page }) => {
    await openBoard(page);
    expect(await surfaceOf(page)).toBe('rgb(255, 255, 255)');
    expect(await pixel(page, 57, 43)).toBe('244,245,247');

    await openBoardMenu(page);
    await page.locator('[data-action="theme-dark"]').click();

    expect(await attrs(page)).toEqual({ theme: 'dark', density: null });
    expect(await surfaceOf(page)).toBe('rgb(28, 31, 36)');
    // The canvas cannot read CSS variables; this is the proof it re-resolved.
    expect(await pixel(page, 57, 43)).toBe('19,21,25');
    const theme = await page.evaluate(() => (window as never as { __wb: { theme: () => Record<string, string> } }).__wb.theme());
    expect(theme.background).toBe('#131519');
  });

  test('the choice survives a reload', async ({ page }) => {
    await openBoard(page);
    await openBoardMenu(page);
    await page.locator('[data-action="theme-dark"]').click();
    await page.reload();
    await expect(page.getByTestId('canvas')).toBeVisible();
    expect(await attrs(page)).toEqual({ theme: 'dark', density: null });
    expect(await pixel(page, 57, 43)).toBe('19,21,25');
  });

  // The default choice is 'system', which sets no attribute at all: that is
  // what lets the prefers-color-scheme block apply.
  test('with no choice made, the system decides', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openBoard(page);
    expect(await attrs(page)).toEqual({ theme: null, density: null });
    expect(await surfaceOf(page)).toBe('rgb(28, 31, 36)');

    await page.emulateMedia({ colorScheme: 'light' });
    expect(await surfaceOf(page)).toBe('rgb(255, 255, 255)');
  });

  test('choosing light overrides a dark system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openBoard(page);
    await openBoardMenu(page);
    await page.locator('[data-action="theme-light"]').click();
    expect(await attrs(page)).toEqual({ theme: 'light', density: null });
    expect(await surfaceOf(page)).toBe('rgb(255, 255, 255)');
  });

  test('compact density shrinks the controls and nothing else', async ({ page }) => {
    await openBoard(page);
    const railButton = page.locator('.tool-rail [data-tool="select"]');
    const before = (await railButton.boundingBox())!;
    const colourBefore = await surfaceOf(page);

    await openBoardMenu(page);
    await page.locator('[data-action="density-compact"]').click();

    expect(await attrs(page)).toEqual({ theme: null, density: 'compact' });
    const after = (await railButton.boundingBox())!;
    expect(after.height).toBeLessThan(before.height);
    expect(await surfaceOf(page)).toBe(colourBefore);
  });
});
