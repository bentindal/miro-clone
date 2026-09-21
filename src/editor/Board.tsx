import { useEffect, useRef, useState } from 'react';
import { toast } from '../ui';
import { onImageLoad } from '../render/images';
import { command, isEnabled } from './commands';
import { chordFor, shortcuts } from './shortcuts';
import type { Editor, Modifiers } from './Editor';
import { ContextMenu } from './ContextMenu';
import { EmptyBoard } from './EmptyBoard';
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
  /** Where the context menu was asked for, in board coordinates; null when closed. */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
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
      // Read-only is not a list of allowed keys any more: every command
      // declares whether it writes, and the registry refuses the ones that do.
      if (e.key === 'Tab' && target === canvas) {
        // Cycle through objects; at either end let focus leave the canvas normally.
        if (editor.selectNext(e.shiftKey ? -1 : 1)) e.preventDefault();
        return;
      }
      if (e.key === 'Enter' && target === canvas) {
        if (!editor.readOnly && editor.activateSelection()) e.preventDefault();
        return;
      }
      if (e.key === ' ') {
        editor.setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      // Paste is the one chord the editor does not consume. The clipboard's
      // contents only reach the page through the browser's own `paste` event,
      // and preventing the key's default would stop that event ever firing,
      // so the handler below decides between a picture and the editor's own
      // clipboard once it can see what was actually pasted.
      if (shortcuts.commandFor(chordFor(e.key, mods(e)))?.id === 'paste') return;
      if (editor.onKeyDown(e.key, mods(e))) e.preventDefault();
    };

    const firstFile = (data: DataTransfer | null): File | null => data?.files?.[0] ?? null;

    /** The first image on a clipboard, if there is one. */
    const imageIn = (data: DataTransfer | null): File | null => {
      for (const item of data?.files ?? []) if (item.type.startsWith('image/')) return item;
      return null;
    };

    const place = (file: File, at: { x: number; y: number }) => {
      void editor.insertImage(file, editor.toWorld(at)).then((refused) => {
        if (refused) toast(refused, 'error');
      });
    };

    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      const file = imageIn(e.clipboardData);
      if (file) {
        e.preventDefault();
        // Pasted pictures land in the middle of what is on screen, because a
        // paste has no position of its own.
        place(file, { x: editor.viewport.w / 2, y: editor.viewport.h / 2 });
        return;
      }
      if (editor.readOnly || !isEnabled(command('paste'), editor)) return;
      e.preventDefault();
      editor.paste();
    };

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      // Any dropped file is taken, not only an image one: somebody who drags a
      // PDF onto a board has asked a question, and `insertImage` answers it by
      // name. Silently doing nothing would read as the board being broken.
      const file = firstFile(e.dataTransfer);
      if (!file) return;
      e.preventDefault();
      if (editor.readOnly) return;
      const r = canvas.getBoundingClientRect();
      place(file, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') editor.setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('paste', onPaste);
    host.addEventListener('dragover', onDragOver);
    host.addEventListener('drop', onDrop);
    // A decoded picture has to reach the canvas, which cannot wait for it.
    const stopWatchingImages = onImageLoad(() => editor.requestRender());
    return () => {
      stopWatchingImages();
      window.removeEventListener('paste', onPaste);
      host.removeEventListener('dragover', onDragOver);
      host.removeEventListener('drop', onDrop);
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
          setMenuAt(null);
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
        onContextMenu={(e) => {
          e.preventDefault();
          const p = local(e);
          editor.selectForContext(p);
          setMenuAt(p);
        }}
      />
      <EmptyBoard editor={editor} />
      {menuAt && <ContextMenu editor={editor} at={menuAt} onClose={() => setMenuAt(null)} />}
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
