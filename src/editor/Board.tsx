import { useEffect, useRef, useState } from 'react';
import type { Editor, Modifiers } from './Editor';
import { PropertyBar } from './PropertyBar';
import { TextEditorOverlay } from './TextEditorOverlay';
import { useEditorVersion } from './useEditor';

function mods(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): Modifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
}

/** The canvas surface plus its input wiring. */
export function Board({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState('default');

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    editor.attachCanvas(canvas);
    const update = () => {
      const r = host.getBoundingClientRect();
      editor.setViewport(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (e.deltaMode === 2) {
        dx *= r.width;
        dy *= r.height;
      }
      editor.onWheel(dx, dy, e.ctrlKey || e.metaKey, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      if (e.key === ' ') {
        editor.setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      if (editor.onKeyDown(e.key, mods(e))) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') editor.setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      editor.attachCanvas(null);
    };
  }, [editor]);

  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div ref={hostRef} className="board" data-testid="board" style={{ cursor }}>
      <canvas
        ref={canvasRef}
        data-testid="canvas"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          editor.onPointerDown(local(e), e.button, mods(e));
        }}
        onPointerMove={(e) => {
          const p = local(e);
          editor.onPointerMove(p, mods(e));
          setCursor(editor.cursorAt(p));
        }}
        onPointerUp={(e) => {
          editor.onPointerUp(local(e), mods(e));
          setCursor(editor.cursorAt(local(e)));
        }}
        onPointerCancel={() => editor.cancelDrag()}
        // Keep focus where it is (e.g. in the text editor) and avoid native text selection.
        onMouseDown={(e) => e.preventDefault()}
        onDoubleClick={(e) => editor.onDoubleClick(local(e))}
        onContextMenu={(e) => e.preventDefault()}
      />
      <TextEditorOverlay editor={editor} />
      <PropertyBar editor={editor} />
    </div>
  );
}
