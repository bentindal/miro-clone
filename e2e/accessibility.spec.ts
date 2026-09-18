import { expect, test } from '@playwright/test';
import { click, drawRect, openBoard, placeSticky, selection, shapesOf } from './helpers';

test.describe('accessibility', () => {
  test('the canvas is a labelled, focusable application region', async ({ page }) => {
    await openBoard(page);
    const canvas = page.getByRole('application', { name: 'Whiteboard canvas' });
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('tabindex', '0');
    await expect(canvas).toHaveAttribute('aria-describedby', 'board-help');
    await expect(page.locator('#board-help')).toContainText('Tab and Shift+Tab move between objects');
  });

  test('Tab and Shift+Tab cycle the selection through objects and announce them', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await placeSticky(ctx, { x: 400, y: 150 });
    const c = await drawRect(ctx, { x: 600, y: 100 }, { x: 700, y: 200 });
    const status = page.getByTestId('a11y-status');
    await click(ctx, { x: 500, y: 500 });
    await expect(status).toHaveText('Nothing selected, 3 objects');
    await expect(page.getByTestId('canvas')).toBeFocused();

    await page.keyboard.press('Tab');
    expect(await selection(page)).toEqual([a.id]);
    await expect(status).toHaveText('Selected rectangle, 1 of 3');
    await page.keyboard.press('Tab');
    expect(await selection(page)).toEqual([b.id]);
    await expect(status).toHaveText('Selected empty sticky note, 2 of 3');
    await page.keyboard.press('Shift+Tab');
    expect(await selection(page)).toEqual([a.id]);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await selection(page)).toEqual([c.id]);
    await expect(page.getByTestId('canvas')).toBeFocused();

    // Past the last object, Tab leaves the canvas so keyboard users are not trapped.
    await page.keyboard.press('Tab');
    expect(await selection(page)).toEqual([c.id]);
    await expect(page.getByTestId('canvas')).not.toBeFocused();
  });

  test('Enter edits the selected note from the keyboard and the edit is announced', async ({ page }) => {
    const ctx = await openBoard(page);
    const n = await placeSticky(ctx, { x: 400, y: 300 });
    const status = page.getByTestId('a11y-status');
    await click(ctx, { x: 400, y: 300 });
    expect(await selection(page)).toEqual([n.id]);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('text-editor')).toBeFocused();
    await expect(status).toHaveText('Editing text');
    await page.keyboard.type('Spoken');
    await page.keyboard.press('Escape');
    await expect(status).toHaveText('Selected sticky note "Spoken", 1 of 1');
    expect((await shapesOf(page, 'sticky'))[0].text).toBe('Spoken');
    await page.keyboard.press('Delete');
    await expect(status).toHaveText('Empty board');
  });

  test('every control has an accessible name and the tool buttons expose their shortcuts', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await drawRect(ctx, { x: 300, y: 100 }, { x: 400, y: 200 });
    await page.mouse.move(ctx.origin.x + 50, ctx.origin.y + 50);
    await page.mouse.down();
    await page.mouse.move(ctx.origin.x + 450, ctx.origin.y + 250, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('property-bar')).toBeVisible();

    const unnamed = await page.evaluate(() => {
      const controls = document.querySelectorAll<HTMLElement>('button, input, select, [role="application"]');
      const missing: string[] = [];
      for (const el of controls) {
        const name = el.getAttribute('aria-label') || el.textContent?.trim() || (el as HTMLInputElement).labels?.[0]?.textContent?.trim() || '';
        if (!name) missing.push(el.outerHTML.slice(0, 80));
      }
      return missing;
    });
    expect(unnamed).toEqual([]);
    await expect(page.getByRole('button', { name: 'Rectangle', exact: true })).toHaveAttribute('aria-keyshortcuts', 'R');
    await expect(page.getByRole('toolbar', { name: 'Properties' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Align left' })).toBeVisible();
  });
});
