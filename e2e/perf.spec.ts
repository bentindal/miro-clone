import { expect, test } from '@playwright/test';
import { openBoard } from './helpers';

/**
 * Renders a board of 5,000 mixed objects and measures the time the editor
 * spends producing each frame while panning and zooming. Asserts the 95th
 * percentile stays under one 60Hz frame (16ms).
 */

const OBJECT_COUNT = 5000;
const FRAMES = 240;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

test('board with 5,000 objects pans and zooms under 16ms p95', async ({ page }) => {
  const ctx = await openBoard(page);

  await page.evaluate((count) => {
    const shapes: unknown[] = [];
    const cols = 80;
    const colors = ['#ffffff', '#fff59d', '#a5d6a7', '#90caf9', '#f48fb1'];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * 140;
      const y = row * 140;
      const kind = i % 5;
      const base = { id: `p${i}`, parentId: null, x, y, w: 100, h: 80, rotation: (i % 7) * 0.1 };
      if (kind === 0) shapes.push({ type: 'rect', ...base, fill: colors[i % colors.length], stroke: '#222' });
      else if (kind === 1) shapes.push({ type: 'ellipse', ...base, fill: colors[(i + 1) % colors.length], stroke: '#222' });
      else if (kind === 2) shapes.push({ type: 'sticky', ...base, text: `Note ${i}`, fill: colors[(i + 2) % colors.length] });
      else if (kind === 3) shapes.push({ type: 'line', ...base, stroke: '#222', points: [{ x: 0, y: 0 }, { x: 100, y: 80 }] });
      else
        shapes.push({
          type: 'pen',
          ...base,
          stroke: '#222',
          strokeWidth: 3,
          points: Array.from({ length: 12 }, (_, k) => ({ x: (k / 11) * 100, y: 40 + Math.sin(k) * 30 })),
        });
    }
    (window as unknown as { __wb: { load: (d: unknown) => void } }).__wb.load({ format: 'whiteboard', version: 1, shapes });
  }, OBJECT_COUNT);

  const count = await page.evaluate(() => (window as unknown as { __wb: { shapes: () => unknown[] } }).__wb.shapes().length);
  expect(count).toBe(OBJECT_COUNT);

  // Measure frames from inside requestAnimationFrame so the timing reflects
  // the real per-frame work the editor does while the camera moves.
  const result = await page.evaluate(
    async ({ frames, w, h }) => {
      const wb = (window as unknown as {
        __wb: {
          editor: {
            setCamera: (c: { tx: number; ty: number; zoom: number }) => void;
            camera: { tx: number; ty: number; zoom: number };
            zoomToFit: () => void;
            zoomBy: (f: number, at: { x: number; y: number }) => void;
            renderNow: () => number;
            lastRenderStats: { drawn: number; culled: number };
          };
        };
      }).__wb;
      const ed = wb.editor;
      ed.zoomToFit();
      const fitZoom = ed.camera.zoom;
      const raf = () => new Promise<number>((r) => requestAnimationFrame(r));
      const panTimes: number[] = [];
      const zoomTimes: number[] = [];
      const drawn: number[] = [];

      // Pan: sweep across the board at fit zoom and at 1x so both dense and sparse views are measured.
      for (let i = 0; i < frames; i++) {
        await raf();
        const t0 = performance.now();
        const zoomLevel = i < frames / 2 ? fitZoom : 1;
        if (i === 0 || i === frames / 2) ed.setCamera({ tx: 0, ty: 0, zoom: zoomLevel });
        const c = ed.camera;
        ed.setCamera({ tx: c.tx - 7, ty: c.ty - 3, zoom: c.zoom });
        ed.renderNow();
        panTimes.push(performance.now() - t0);
        drawn.push(ed.lastRenderStats.drawn);
      }

      // Zoom: pinch in and out around the viewport centre through the full range.
      ed.zoomToFit();
      const at = { x: w / 2, y: h / 2 };
      for (let i = 0; i < frames; i++) {
        await raf();
        const t0 = performance.now();
        const factor = i < frames / 2 ? 1.03 : 1 / 1.03;
        ed.zoomBy(factor, at);
        ed.renderNow();
        zoomTimes.push(performance.now() - t0);
        drawn.push(ed.lastRenderStats.drawn);
      }
      return { panTimes, zoomTimes, maxDrawn: Math.max(...drawn), minDrawn: Math.min(...drawn) };
    },
    { frames: FRAMES, w: ctx.width, h: ctx.height },
  );

  const panP95 = percentile(result.panTimes, 95);
  const zoomP95 = percentile(result.zoomTimes, 95);
  const panMax = Math.max(...result.panTimes);
  const zoomMax = Math.max(...result.zoomTimes);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

  console.log(
    [
      `perf: ${OBJECT_COUNT} objects, ${FRAMES} pan frames + ${FRAMES} zoom frames`,
      `  pan  p95=${panP95.toFixed(2)}ms mean=${mean(result.panTimes).toFixed(2)}ms max=${panMax.toFixed(2)}ms`,
      `  zoom p95=${zoomP95.toFixed(2)}ms mean=${mean(result.zoomTimes).toFixed(2)}ms max=${zoomMax.toFixed(2)}ms`,
      `  objects drawn per frame: min=${result.minDrawn} max=${result.maxDrawn}`,
    ].join('\n'),
  );

  // The zoomed-out frames must actually draw the whole board, otherwise the
  // measurement would only be exercising culling.
  expect(result.maxDrawn).toBe(OBJECT_COUNT);
  expect(panP95).toBeLessThan(16);
  expect(zoomP95).toBeLessThan(16);
});
