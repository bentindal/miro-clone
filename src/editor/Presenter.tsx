import { Button, IconButton } from '../ui';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';

/**
 * The only chrome a presentation has: which slide this is, how to get to the
 * next one, and how to stop. Everything else in the editor is hidden while
 * this is up, so the bar has to carry the whole mode on its own.
 *
 * The keys are handled in the editor rather than here, because the canvas
 * holds focus and a presentation has to answer the arrow keys wherever the
 * pointer happens to be.
 */
export function Presenter({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const index = editor.presenting;
  if (index === null) return null;
  const deck = editor.slides();
  const frame = deck[index];

  return (
    <div className="presenter" data-testid="presenter" role="region" aria-label="Presentation">
      <div className="presenter-bar">
        <IconButton icon="backward" label="Previous slide" variant="ghost" data-action="slide-prev" disabled={index === 0} onClick={() => editor.gotoSlide(index - 1)} />
        <span className="presenter-count" data-testid="slide-count" aria-live="polite">
          {index + 1} / {deck.length}
        </span>
        <IconButton
          icon="forward"
          label="Next slide"
          variant="ghost"
          data-action="slide-next"
          disabled={index === deck.length - 1}
          onClick={() => editor.gotoSlide(index + 1)}
        />
        <span className="presenter-title" data-testid="slide-title">
          {frame?.title || 'Untitled frame'}
        </span>
        <Button icon="close" data-action="slide-exit" onClick={() => editor.exitPresenting()}>
          Exit
        </Button>
      </div>
    </div>
  );
}
