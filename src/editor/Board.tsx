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
  /** Active touch contacts by pointer id, for two-finger gestures. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  /** Set once a second finger lands; cleared when every finger has lifted. */
  const gestureLatched = useRef(false);

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
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
      if (editor.readOnly && !['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'v', 'h', 'V', 'H', '+', '=', '-', ' '].includes(e.key) && !(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Tab' && target === canvas) {
        // Cycle through objects; at either end let focus leave the canvas normally.
        if (editor.selectNext(e.shiftKey ? -1 : 1)) e.preventDefault();
        return;
      }
      if (e.key === 'Enter' && target === canvas) {
        if (!editor.readOnly && editor.activateSelection()) e.preventDefault();
        return;
      }
      if (editor.readOnly && (e.ctrlKey || e.metaKey) && !['a', 'A', '0', '=', '+', '-', '1'].includes(e.key)) return;
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

  const twoTouches = () => {
    const pts = [...touches.current.values()];
    return pts.length >= 2 ? ([pts[0], pts[1]] as const) : null;
  };

  /** Returns true when the event was consumed by touch-gesture handling. */
  const touchDown = (e: React.PointerEvent): boolean => {
    if (e.pointerType !== 'touch') return false;
    touches.current.set(e.pointerId, local(e));
    const pair = twoTouches();
    if (pair && !editor.isPinching) {
      gestureLatched.current = true;
      editor.beginPinch(pair[0], pair[1]);
    }
    return gestureLatched.current;
  };

  const touchMove = (e: React.PointerEvent): boolean => {
    if (e.pointerType !== 'touch') return false;
    if (!touches.current.has(e.pointerId)) return false;
    touches.current.set(e.pointerId, local(e));
    const pair = twoTouches();
    if (pair && editor.isPinching) editor.updatePinch(pair[0], pair[1]);
    return gestureLatched.current;
  };

  const touchUp = (e: React.PointerEvent): boolean => {
    if (e.pointerType !== 'touch') return false;
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2 && editor.isPinching) editor.endPinch();
    const consumed = gestureLatched.current;
    if (touches.current.size === 0) gestureLatched.current = false;
    return consumed;
  };

  const status = editor.describeSelection();

  return (
    <div ref={hostRef} className="board" data-testid="board" style={{ cursor }}>
      <canvas
        ref={canvasRef}
        data-testid="canvas"
        role="application"
        aria-label="Whiteboard canvas"
        aria-describedby="board-help"
        aria-roledescription="whiteboard"
        tabIndex={0}
        onPointerDown={(e) => {
          const canvas = e.currentTarget as HTMLCanvasElement;
          canvas.setPointerCapture(e.pointerId);
          if (touchDown(e)) return;
          editor.onPointerDown(local(e), e.button, mods(e));
          // Mousedown's default is prevented below, so take focus explicitly for keyboard use.
          if (!editor.editing) canvas.focus({ preventScroll: true });
        }}
        onPointerMove={(e) => {
          if (touchMove(e)) return;
          const p = local(e);
          editor.onPointerMove(p, mods(e));
          setCursor(editor.cursorAt(p));
        }}
        onPointerUp={(e) => {
          if (touchUp(e)) return;
          editor.onPointerUp(local(e), mods(e));
          setCursor(editor.cursorAt(local(e)));
        }}
        onPointerCancel={(e) => {
          touchUp(e);
          editor.cancelDrag();
        }}
        // Keep focus where it is (e.g. in the text editor) and avoid native text selection.
        onMouseDown={(e) => e.preventDefault()}
        onDoubleClick={(e) => editor.onDoubleClick(local(e))}
        onContextMenu={(e) => e.preventDefault()}
      />
      <TextEditorOverlay editor={editor} />
      <PropertyBar editor={editor} />
      <p id="board-help" className="sr-only">
        Tab and Shift+Tab move between objects, Enter edits the selected text, arrow keys nudge, Delete removes, Escape clears the selection. Letter keys pick tools.
      </p>
      <div role="status" aria-live="polite" className="sr-only" data-testid="a11y-status">
        {status}
      </div>
    </div>
  );
}
