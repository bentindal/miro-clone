import { useEffect, useRef } from 'react';
import { visibleWorldBox } from '../model/geometry';
import { boardBounds } from '../render/renderer';
import { drawMinimap, fromMinimap, minimapView } from '../render/minimap';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';

const WIDTH = 180;
const HEIGHT = 120;

/**
 * The whole board at a glance, bottom right. Clicking or dragging on it moves
 * the camera rather than the board: the minimap is a way of looking, not a
 * way of editing, so nothing on it can change a shape.
 */
export function Minimap({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const ref = useRef<HTMLCanvasElement>(null);
  const open = editor.minimapOpen;

  const visible = visibleWorldBox(editor.camera, editor.viewport.w, editor.viewport.h);
  const view = minimapView(boardBounds(editor.scene), visible, WIDTH, HEIGHT);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(WIDTH * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMinimap(ctx, editor.scene, view, visible, WIDTH, HEIGHT, editor.theme);
  });

  if (!open) return null;

  const moveTo = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    editor.centerOn(fromMinimap(view, { x: e.clientX - r.left, y: e.clientY - r.top }));
  };

  return (
    <canvas
      ref={ref}
      className="minimap"
      data-testid="minimap"
      role="slider"
      aria-label="Minimap"
      aria-valuetext={`Viewing ${Math.round(visible.x)}, ${Math.round(visible.y)}`}
      style={{ width: WIDTH, height: HEIGHT, right: editor.insets.right + 12 }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => {
        if ((e.currentTarget as HTMLCanvasElement).hasPointerCapture(e.pointerId)) moveTo(e);
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
