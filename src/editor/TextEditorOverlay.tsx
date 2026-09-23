import { useEffect, useRef, useState } from 'react';
import { worldToScreen } from '../model/geometry';
import { FRAME_TITLE_HEIGHT } from '../model/scene';
import { fontFor } from '../render/renderer';
import { STICKY_PAD, fitText, layoutTextBlock, stickyTextBox, tagInset } from '../model/textFit';
import { hasText } from '../model/types';
import { FormatBar } from './FormatBar';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';

let measureCtx: CanvasRenderingContext2D | null = null;

/** Text measurement off a scratch canvas, matching what the renderer measures. */
function measureText(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * font.length; // no canvas: rough but non-crashing
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** A textarea positioned over the shape being edited. */
export function TextEditorOverlay({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /** What is highlighted in the textarea, which is what formatting applies to. */
  const [range, setRange] = useState({ from: 0, to: 0 });
  const editing = editor.editing;
  const shape = editing ? editor.scene.get(editing.id) : undefined;

  // `selectionchange` on the document is the event that actually fires for
  // every way a caret moves — typing, dragging, keyboard, the browser's own
  // menus. React's `onSelect` is a partial emulation of it and misses some.
  useEffect(() => {
    const read = () => {
      const el = ref.current;
      if (el && document.activeElement === el) setRange({ from: el.selectionStart ?? 0, to: el.selectionEnd ?? 0 });
    };
    document.addEventListener('selectionchange', read);
    return () => document.removeEventListener('selectionchange', read);
  }, []);

  useEffect(() => {
    if (shape && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
    // Focus only when the edited shape changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  if (!editing || !shape || !(hasText(shape) || shape.type === 'frame' || shape.type === 'connector')) return null;
  const cam = editor.camera;
  if (shape.type === 'connector') {
    const mid = worldToScreen(cam, editor.scene.connectorMidpoint(shape));
    const w = Math.max(120, (shape.label.length * 6.6 + 24) * cam.zoom);
    const h = 22 * cam.zoom;
    return (
      <input
        ref={ref as unknown as React.RefObject<HTMLInputElement>}
        data-testid="text-editor"
        className="text-editor label-editor"
        value={editor.editingText()}
        placeholder="Label"
        onChange={(e) => editor.setEditingText(e.target.value)}
        onBlur={() => editor.finishEditing()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || e.key === 'Enter') {
            e.preventDefault();
            editor.finishEditing();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: mid.x - w / 2, top: mid.y - h / 2, width: w, height: h, fontSize: 12 * cam.zoom, textAlign: 'center' }}
      />
    );
  }
  const isFrame = shape.type === 'frame';
  const pad = shape.type === 'sticky' ? STICKY_PAD : 0;
  const top = isFrame ? shape.y - FRAME_TITLE_HEIGHT : shape.y;
  const tl = worldToScreen(cam, { x: shape.x, y: top });
  const w = shape.w * cam.zoom;
  const h = (isFrame ? FRAME_TITLE_HEIGHT : shape.h) * cam.zoom;
  // The editor sits where the drawn text sits, so it has to lose the same
  // row to the tags that the renderer does.
  const note = shape.type === 'sticky' ? shape : null;
  const textBox = note ? stickyTextBox(note) : null;
  const fit = note && textBox ? fitText(note.text, textBox.w, textBox.h, STICKY_PAD, measureText) : null;
  const size = shape.type === 'frame' ? 14 : shape.type === 'text' ? fontFor(shape).size : (fit?.size ?? 14);
  const center = { x: tl.x + w / 2, y: tl.y + h / 2 };
  // A textarea has no vertical alignment, so the space above the text is
  // padding, worked out the same way the renderer places the block.
  const block =
    fit && note && textBox
      ? layoutTextBlock({ x: 0, y: 0, w: textBox.w, h: textBox.h }, STICKY_PAD, fit.lines.length, fit.lineHeight, note.align, note.valign)
      : null;
  const formattable = hasText(shape);
  /** Put the caret back after a button in the format bar took focus. */
  const restore = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(range.from, range.to);
  };

  const area = (
    <textarea
      ref={ref as React.RefObject<HTMLTextAreaElement>}
      data-testid="text-editor"
      className="text-editor"
      value={editor.editingText()}
      onChange={(e) => editor.setEditingText(e.target.value)}
      onBlur={(e) => {
        // Reaching for the format bar is not leaving the text, so focus
        // landing inside it must not end the edit.
        if (barRef.current?.contains(e.relatedTarget as Node | null)) return;
        editor.finishEditing();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (isFrame || e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          editor.finishEditing();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: center.x - w / 2,
        top: center.y - h / 2,
        width: w,
        height: h,
        padding: pad * cam.zoom,
        // The textarea covers the whole note; `block.y` is measured from the
        // top of the text box, which starts below the tag row.
        paddingTop: (block && note ? block.y + tagInset(note.tags) : pad) * cam.zoom,
        textAlign: block ? block.textAlign : undefined,
        fontSize: size * cam.zoom,
        lineHeight: 1.25,
        transform: isFrame ? undefined : `rotate(${shape.rotation}rad)`,
        transformOrigin: 'center',
        background: shape.type === 'sticky' ? shape.fill : 'rgba(255,255,255,0.9)',
        color: shape.type === 'text' ? shape.color : '#222',
      }}
    />
  );

  if (!formattable || editor.readOnly) return area;
  return (
    <>
      {area}
      <FormatBar editor={editor} barRef={barRef} at={{ x: tl.x, y: Math.max(4, tl.y - 44) }} range={range} restore={restore} />
    </>
  );
}
