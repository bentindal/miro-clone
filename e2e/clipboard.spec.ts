import { expect, test } from '@playwright/test';
import { click, dblclick, drag, drawRect, openBoard, placeSticky, selectTool, selection, shapes, shapesOf, typeAndCommit } from './helpers';

test.describe('copy and paste', () => {
  test('pastes copies offset from the originals with their content', async ({ page }) => {
    const ctx = await openBoard(page);
    const r = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const n = await placeSticky(ctx, { x: 400, y: 150 });
    await dblclick(ctx, { x: 400, y: 150 });
    await typeAndCommit(page, 'copy me');
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 500, y: 250 });
    expect(await selection(page)).toHaveLength(2);

    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    const all = await shapes(page);
    expect(all).toHaveLength(4);
    const pasted = all.filter((s) => s.id !== r.id && s.id !== n.id);
    expect(pasted.map((s) => s.type).sort()).toEqual(['rect', 'sticky']);
    const rectCopy = pasted.find((s) => s.type === 'rect')!;
    const noteCopy = pasted.find((s) => s.type === 'sticky')!;
    expect(rectCopy).toMatchObject({ x: 120, y: 120, w: 100, h: 100 });
    expect(noteCopy).toMatchObject({ x: n.x! + 20, y: n.y! + 20, text: 'copy me' });
    expect(new Set(await selection(page))).toEqual(new Set(pasted.map((s) => s.id)));
    // Originals are untouched.
    expect(all.find((s) => s.id === r.id)).toMatchObject({ x: 100, y: 100 });

    // Pasting again stacks another copy further along.
    await page.keyboard.press('Control+v');
    expect(await shapes(page)).toHaveLength(6);
  });

  test('copying a group with a connector keeps the copy wired together', async ({ page }) => {
    const ctx = await openBoard(page);
    const a = await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    const b = await drawRect(ctx, { x: 400, y: 100 }, { x: 500, y: 200 });
    await selectTool(page, 'connector');
    await drag(ctx, { x: 150, y: 150 }, { x: 450, y: 150 });
    await selectTool(page, 'select');
    await drag(ctx, { x: 50, y: 50 }, { x: 550, y: 250 });
    await page.keyboard.press('Control+g');
    await page.keyboard.press('Control+c');
    await click(ctx, { x: 700, y: 600 });
    await page.keyboard.press('Control+v');

    const groups = await shapesOf(page, 'group');
    expect(groups).toHaveLength(2);
    const connectors = await shapesOf(page, 'connector');
    expect(connectors).toHaveLength(2);
    const copied = connectors.find((k) => k.start?.shapeId !== a.id)!;
    const rects = await shapesOf(page, 'rect');
    const newRects = rects.filter((x) => x.id !== a.id && x.id !== b.id);
    expect(newRects).toHaveLength(2);
    expect(newRects.map((x) => x.id)).toContain(copied.start?.shapeId);
    expect(newRects.map((x) => x.id)).toContain(copied.end?.shapeId);
    expect(copied.start?.shapeId).not.toBe(copied.end?.shapeId);
    const newGroup = groups.find((g) => newRects[0].parentId === g.id)!;
    expect(newRects.every((x) => x.parentId === newGroup.id)).toBe(true);
    expect(copied.parentId).toBe(newGroup.id);
  });

  test('cut removes the originals and paste brings them back', async ({ page }) => {
    const ctx = await openBoard(page);
    await drawRect(ctx, { x: 100, y: 100 }, { x: 200, y: 200 });
    await page.keyboard.press('Control+x');
    expect(await shapes(page)).toHaveLength(0);
    await page.keyboard.press('Control+v');
    const [r] = await shapes(page);
    expect(r).toMatchObject({ type: 'rect', x: 120, y: 120 });
  });
});
