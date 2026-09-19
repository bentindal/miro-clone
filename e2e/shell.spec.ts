import { expect, test } from '@playwright/test';
import { drawRect, openBoard, openBoardMenu, selectTool } from './helpers';

test.describe('shell', () => {
  test('tools are on the rail, grouped, and the top bar carries neither them nor the view controls', async ({ page }) => {
    await openBoard(page);
    const rail = page.locator('.tool-rail');
    await expect(rail.locator('[data-tool]')).toHaveCount(11);
    // The grouping is data in tools.ts; this checks the rail renders it.
    const groups = await rail.locator('.rail-group').evaluateAll((els) =>
      els.map((el) => ({
        label: el.getAttribute('aria-label'),
        tools: [...el.querySelectorAll('[data-tool]')].map((t) => t.getAttribute('data-tool')),
      })),
    );
    expect(groups).toEqual([
      { label: 'Navigate', tools: ['select', 'hand'] },
      { label: 'Shapes', tools: ['rect', 'ellipse', 'line'] },
      { label: 'Content', tools: ['sticky', 'text', 'pen'] },
      { label: 'Structure', tools: ['connector', 'frame', 'comment'] },
    ]);

    await rail.locator('[data-tool="sticky"]').click();
    await expect(rail.locator('[data-tool="sticky"]')).toHaveAttribute('aria-pressed', 'true');

    // Identity and collaboration only.
    const bar = page.locator('.top-bar');
    await expect(bar.locator('[data-tool]')).toHaveCount(0);
    for (const action of ['undo', 'redo', 'zoom-in', 'zoom-out', 'zoom-fit', 'toggle-grid']) {
      await expect(bar.locator(`[data-action="${action}"]`)).toHaveCount(0);
      await expect(page.locator(`.zoom-cluster [data-action="${action}"]`)).toHaveCount(1);
    }
    await expect(bar.getByTestId('board-title')).toBeVisible();
    await expect(bar.locator('[data-action="share"]')).toBeVisible();

    // File actions moved into the board menu rather than onto the bar.
    await expect(page.locator('[data-action="export-png"]')).toHaveCount(0);
    await openBoardMenu(page);
    await expect(page.locator('[data-action="export-png"]')).toBeVisible();
  });

  test('the dock is built from the panel registry', async ({ page }) => {
    await openBoard(page);
    const tabs = page.locator('.dock-tabs [data-action^="toggle-"]');
    // One tab per registered panel, named from its definition.
    await expect(tabs).toHaveCount(1);
    await expect(tabs.first()).toHaveAttribute('data-action', 'toggle-comments');
    await expect(tabs.first()).toHaveAttribute('aria-label', 'Comments');
    await expect(page.getByTestId('panel-comments')).toHaveCount(0);

    await tabs.first().click();
    const panel = page.getByTestId('panel-comments');
    await expect(panel).toBeVisible();
    // Title, header controls and body all come from the registered definition.
    await expect(panel.locator('.ui-panel-header strong')).toHaveText('Comments');
    await expect(panel.getByTestId('show-resolved')).toBeVisible();
    await expect(panel.getByTestId('comments-panel')).toBeVisible();

    await panel.getByRole('button', { name: 'Close comments' }).click();
    await expect(page.getByTestId('panel-comments')).toHaveCount(0);
  });

  test('the property bar keeps clear of the rail and the open dock', async ({ page }) => {
    const ctx = await openBoard(page);
    // A shape far right, then the dock opened over it. The bar has to find
    // room beside the dock rather than hiding under it.
    await drawRect(ctx, { x: 1000, y: 300 }, { x: 1150, y: 400 });
    await selectTool(page, 'select');
    await page.locator('[data-action="toggle-comments"]').click();
    await expect(page.getByTestId('panel-comments')).toBeVisible();
    await page.getByTestId('canvas').focus();
    await page.keyboard.press('Tab');
    const bar = page.getByTestId('property-bar');
    await expect(bar).toBeVisible();
    const barBox = (await bar.boundingBox())!;
    const dockBox = (await page.getByTestId('panel-comments').boundingBox())!;
    const railBox = (await page.locator('.tool-rail').boundingBox())!;
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(dockBox.x);
    expect(barBox.x).toBeGreaterThanOrEqual(railBox.x + railBox.width);
  });
});
