import { Divider, IconButton, Tooltip } from '../ui';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';

/** Bottom-left: history and viewport. Neither belongs in the top bar. */
export function ZoomCluster({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const readOnly = editor.readOnly;
  return (
    <div className="zoom-cluster" role="toolbar" aria-label="View" onMouseDown={(e) => e.preventDefault()}>
      <Tooltip label="Undo" shortcut="Ctrl+Z" placement="top">
        <IconButton icon="undo" label="Undo" variant="ghost" data-action="undo" disabled={!editor.canUndo || readOnly} onClick={() => editor.undo()} />
      </Tooltip>
      <Tooltip label="Redo" shortcut="Ctrl+Shift+Z" placement="top">
        <IconButton icon="redo" label="Redo" variant="ghost" data-action="redo" disabled={!editor.canRedo || readOnly} onClick={() => editor.redo()} />
      </Tooltip>
      <Divider />
      <Tooltip label="Zoom out" shortcut="−" placement="top">
        <IconButton icon="zoomOut" label="Zoom out" variant="ghost" data-action="zoom-out" onClick={() => editor.zoomBy(0.8)} />
      </Tooltip>
      <span className="zoom" data-testid="zoom-level" aria-label="Zoom level">
        {Math.round(editor.camera.zoom * 100)}%
      </span>
      <Tooltip label="Zoom in" shortcut="+" placement="top">
        <IconButton icon="zoomIn" label="Zoom in" variant="ghost" data-action="zoom-in" onClick={() => editor.zoomBy(1.25)} />
      </Tooltip>
      <Tooltip label="Zoom to fit" shortcut="Shift+1" placement="top">
        <IconButton icon="fit" label="Fit" variant="ghost" data-action="zoom-fit" onClick={() => editor.zoomToFit()} />
      </Tooltip>
      <Divider />
      <Tooltip label="Snap to grid" shortcut="G" placement="top">
        <IconButton icon="grid" label="Grid" variant="ghost" data-action="toggle-grid" active={editor.gridSnap} onClick={() => editor.setGridSnap(!editor.gridSnap)} />
      </Tooltip>
    </div>
  );
}
