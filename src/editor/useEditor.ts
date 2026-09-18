import { useSyncExternalStore } from 'react';
import type { Editor } from './Editor';

/** Re-render the calling component whenever the editor changes. */
export function useEditorVersion(editor: Editor): number {
  return useSyncExternalStore(
    (fn) => editor.subscribe(fn),
    () => editor.getVersion(),
    () => editor.getVersion(),
  );
}
