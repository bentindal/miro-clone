import { expect, test } from '@playwright/test';
import { openBoard } from './helpers';

/**
 * Renders a board of 5,000 mixed objects and measures the time the editor
 * spends producing each frame while panning and zooming. Asserts the 95th
 * percentile stays under one 60Hz frame (16ms).
 *
 * The mix matters as much as the count. ROADMAP.md predicted that rich text,
 * images and elbow connectors would each break the renderer's batching, and
 * for a while this gate was measuring a board made only of the shapes that
 * batch well — green, and no longer covering the content that would break it.
 * All three are in the mix now, at the share of a board that actually leans
 * on them.
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
    // A handful of distinct pictures rather than one, so the decode cache
    // holds several entries as a real board's would, and rather than 500, so
    // the fixture does not carry half a megabyte of base64.
    const pictures = [
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP4z8CAFTEMLQkAKP8/wc53yE8AAAAASUVORK5CYII=',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEElEQVR42mNg+M+AHQ0tCQDpMD/BHYHcAQAAAABJRU5ErkJggg==',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEElEQVR42mNgYPiPAw0pCQCpcD/B/MtF/AAAAABJRU5ErkJggg==',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP4/58BK2IYWhIAEXZ/gVEmf+cAAAAASUVORK5CYII=',
    ];
    /** The id of the most recent shape a connector may attach to. */
    const attachable: string[] = [];
    /** Counts pictures placed, so every one in the list gets used. Indexing by
     * `i` would not: the loop reaches an image every tenth shape, so `i % 4`
     * only ever lands on two of them. */
    let placed = 0;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * 140;
      const y = row * 140;
      const kind = i % 10;
      const id = `p${i}`;
      const base = { id, parentId: null, x, y, w: 100, h: 80, rotation: (i % 7) * 0.1 };
      if (kind === 0) shapes.push({ type: 'rect', ...base, fill: colors[i % colors.length], stroke: '#222' });
      else if (kind === 1) shapes.push({ type: 'ellipse', ...base, fill: colors[(i + 1) % colors.length], stroke: '#222' });
      else if (kind === 2) shapes.push({ type: 'sticky', ...base, text: `Note ${i}`, fill: colors[(i + 2) % colors.length] });
      else if (kind === 3) shapes.push({ type: 'line', ...base, stroke: '#222', points: [{ x: 0, y: 0 }, { x: 100, y: 80 }] });
      else if (kind === 4)
        shapes.push({
          type: 'pen',
          ...base,
          stroke: '#222',
          strokeWidth: 3,
          points: Array.from({ length: 12 }, (_, k) => ({ x: (k / 11) * 100, y: 40 + Math.sin(k) * 30 })),
        });
      // A formatted note: several runs per line, so the renderer draws each
      // line a run at a time and measures each run's own font.
      else if (kind === 5)
        shapes.push({
          type: 'sticky',
          ...base,
          text: `Bold ${i} and italic and a link`,
          fill: colors[(i + 3) % colors.length],
          marks: [
            { kind: 'bold', from: 0, to: 4, href: '' },
            { kind: 'italic', from: 14, to: 20, href: '' },
            { kind: 'link', from: 27, to: 31, href: 'https://example.com' },
          ],
        });
      // Formatted text in a list, which adds a marker and an indent per line.
      else if (kind === 6)
        shapes.push({
          type: 'text',
          ...base,
          text: `First point ${i}\nSecond point\nThird point`,
          fontSize: 14,
          color: '#222222',
          list: 'bullet',
          marks: [{ kind: 'bold', from: 0, to: 5, href: '' }],
        });
      else if (kind === 7) shapes.push({ type: 'image', ...base, src: pictures[placed++ % pictures.length], alt: `Picture ${i}` });
      // Elbow connectors between neighbours: the routing is recomputed from
      // the two shapes' geometry, which is the part that does not batch.
      else if (kind === 8 && attachable.length >= 2) {
        shapes.push({
          type: 'connector',
          id,
          parentId: null,
          stroke: '#222222',
          strokeWidth: 2,
          style: 'elbow',
          startArrow: 'none',
          endArrow: 'arrow',
          label: '',
          start: { shapeId: attachable[attachable.length - 1], point: { x, y }, anchor: 'auto' },
          end: { shapeId: attachable[attachable.length - 2], point: { x: x + 100, y: y + 80 }, anchor: 'auto' },
        });
      } else shapes.push({ type: 'rect', ...base, fill: colors[(i + 4) % colors.length], stroke: '#222' });

      if (kind !== 8) attachable.push(id);
    }
    (window as unknown as { __wb: { load: (d: unknown) => void } }).__wb.load({ format: 'whiteboard', version: 1, shapes });
  }, OBJECT_COUNT);

  // The mix is the point of this gate, so it is asserted rather than assumed.
  // Narrowing it back to the shapes that batch well is the exact way this test
  // stopped being a gate the first time.
  const mix = await page.evaluate(() => {
    const counts: Record<string, number> = {};
    for (const s of (window as unknown as { __wb: { shapes: () => { type: string }[] } }).__wb.shapes()) counts[s.type] = (counts[s.type] ?? 0) + 1;
    return counts;
  });
  expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBe(OBJECT_COUNT);
  for (const type of ['rect', 'ellipse', 'sticky', 'line', 'pen', 'text', 'image', 'connector']) {
    expect(mix[type] ?? 0, `${type} is missing from the perf mix`).toBeGreaterThanOrEqual(400);
  }

  // The pictures have to be decoded before the clock starts, or this measures
  // 500 placeholder rectangles and quietly stops covering images at all. Each
  // one is a flat colour no other shape uses, so a solid block of one on the
  // canvas proves a picture was drawn rather than waited for.
  await page
    .waitForFunction(
      () => {
        const wb = (window as unknown as { __wb: { editor: { setCamera: (c: { tx: number; ty: number; zoom: number }) => void; renderNow: () => number } } }).__wb;
        wb.editor.setCamera({ tx: 0, ty: 0, zoom: 1 });
        wb.editor.renderNow();
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const wanted = [
          [255, 0, 0],
          [0, 255, 0],
          [0, 0, 255],
          [255, 255, 0],
        ];
        let hits = 0;
        for (let i = 0; i < d.length; i += 4) {
          for (const [r, g, b] of wanted) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) hits++;
        }
        // A whole picture, not a stray blended pixel at somebody's edge.
        return hits > 1000;
      },
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {
      throw new Error("the perf board's pictures never reached the canvas, so this run would have measured placeholders");
    });

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
