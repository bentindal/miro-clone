import { Fragment } from 'react';
import { Divider } from '../ui';
import { CommandIconButton } from './CommandButton';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';

/**
 * Bottom-left: history and viewport. Neither belongs in the top bar. The
 * cluster is a layout, not a set of actions: what each button does, whether it
 * is available and which key runs it all come from the command registry.
 */
const CLUSTER: (string | 'divider' | 'zoom')[] = ['undo', 'redo', 'divider', 'zoom-out', 'zoom', 'zoom-in', 'zoom-fit', 'divider', 'toggle-grid'];

export function ZoomCluster({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  return (
    <div className="zoom-cluster" role="toolbar" aria-label="View" onMouseDown={(e) => e.preventDefault()}>
      {CLUSTER.map((entry, i) => (
        <Fragment key={entry === 'divider' ? `divider-${i}` : entry}>
          {entry === 'divider' ? (
            <Divider />
          ) : entry === 'zoom' ? (
            <span className="zoom" data-testid="zoom-level" aria-label="Zoom level">
              {Math.round(editor.camera.zoom * 100)}%
            </span>
          ) : (
            <CommandIconButton editor={editor} id={entry} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
