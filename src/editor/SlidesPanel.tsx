import { Button, IconButton } from '../ui';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';

/** Header control: start the deck from the top. */
export function PresentButton({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  return (
    <Button size="sm" icon="present" data-action="present-from-panel" disabled={editor.slides().length === 0} onClick={() => editor.startPresenting(0)}>
      Present
    </Button>
  );
}

/**
 * The deck: every frame on the board, in the order it will be presented in.
 * Reordering is a pair of buttons rather than a drag, which costs a little
 * speed and buys a list that works from the keyboard and reads properly out
 * loud. Dragging can be added over the top of the same `moveSlide` call.
 */
export function SlidesBody({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const deck = editor.slides();
  const readOnly = editor.readOnly;

  if (deck.length === 0) {
    return (
      <div className="slides-body" data-testid="slides-panel">
        <p className="slides-empty" data-testid="slides-empty">
          A frame is a slide. Draw one with the Frame tool (F) and it appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="slides-body" data-testid="slides-panel">
      <ol className="slide-list">
        {deck.map((frame, i) => (
          <li key={frame.id} className="slide-row" data-slide={frame.id}>
            <button
              type="button"
              className="slide-open"
              data-action={`open-slide-${i}`}
              onClick={() => {
                editor.select([frame.id]);
                editor.zoomToSelection();
              }}
              onDoubleClick={() => editor.startPresenting(i)}
            >
              <span className="slide-number">{i + 1}</span>
              <span className="slide-title">{frame.title || 'Untitled frame'}</span>
            </button>
            <IconButton
              icon="moveUp"
              label={`Move ${frame.title || `slide ${i + 1}`} earlier`}
              variant="ghost"
              size="sm"
              data-action={`slide-up-${i}`}
              disabled={readOnly || i === 0}
              onClick={() => editor.moveSlide(frame.id, i - 1)}
            />
            <IconButton
              icon="moveDown"
              label={`Move ${frame.title || `slide ${i + 1}`} later`}
              variant="ghost"
              size="sm"
              data-action={`slide-down-${i}`}
              disabled={readOnly || i === deck.length - 1}
              onClick={() => editor.moveSlide(frame.id, i + 1)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
