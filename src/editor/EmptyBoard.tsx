import type { Editor } from './Editor';
import { TOOL_META } from './tools';
import { useEditorVersion } from './useEditor';

/**
 * What an empty board says. It names the first action rather than offering a
 * button, because a button here would sit exactly where the first drag starts
 * and would swallow it.
 */
export function EmptyBoard({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  if (editor.scene.all().length > 0 || editor.editing) return null;
  return (
    <div className="empty-board" data-testid="empty-board" aria-hidden="true">
      <strong>{editor.readOnly ? 'Nothing on this board yet' : 'Start with a sticky note'}</strong>
      {!editor.readOnly && (
        <span>
          Press <kbd>{TOOL_META.sticky.key}</kbd> and click, or pick a tool from the left.
        </span>
      )}
    </div>
  );
}
