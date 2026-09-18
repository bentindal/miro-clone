import { useEffect, useRef } from 'react';
import { worldToScreen } from '../model/geometry';
import { FRAME_TITLE_HEIGHT } from '../model/scene';
import { fontFor } from '../render/renderer';
import { hasText } from '../model/types';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';

/** A textarea positioned over the shape being edited. */
export function TextEditorOverlay({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const editing = editor.editing;
  const shape = editing ? editor.scene.get(editing.id) : undefined;

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
  const pad = shape.type === 'sticky' ? 10 : 0;
  const top = isFrame ? shape.y - FRAME_TITLE_HEIGHT : shape.y;
  const tl = worldToScreen(cam, { x: shape.x, y: top });
  const w = shape.w * cam.zoom;
  const h = (isFrame ? FRAME_TITLE_HEIGHT : shape.h) * cam.zoom;
  const size = shape.type === 'frame' ? 14 : fontFor(shape).size;
  const center = { x: tl.x + w / 2, y: tl.y + h / 2 };
  return (
    <textarea
      ref={ref as React.RefObject<HTMLTextAreaElement>}
      data-testid="text-editor"
      className="text-editor"
      value={editor.editingText()}
      onChange={(e) => editor.setEditingText(e.target.value)}
      onBlur={() => editor.finishEditing()}
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
        fontSize: size * cam.zoom,
        lineHeight: 1.25,
        transform: isFrame ? undefined : `rotate(${shape.rotation}rad)`,
        transformOrigin: 'center',
        background: shape.type === 'sticky' ? shape.fill : 'rgba(255,255,255,0.9)',
        color: shape.type === 'text' ? shape.color : '#222',
      }}
    />
  );
}
