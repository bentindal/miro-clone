import { type Editor, type Tool, TOOLS } from './Editor';
import { useEditorVersion } from './useEditor';
import { downloadBlob } from './download';

const TOOL_LABELS: Record<Tool, { label: string; key: string }> = {
  select: { label: 'Select', key: 'V' },
  hand: { label: 'Hand', key: 'H' },
  rect: { label: 'Rectangle', key: 'R' },
  ellipse: { label: 'Ellipse', key: 'O' },
  line: { label: 'Line', key: 'L' },
  sticky: { label: 'Sticky', key: 'N' },
  text: { label: 'Text', key: 'T' },
  pen: { label: 'Pen', key: 'P' },
  connector: { label: 'Connector', key: 'C' },
  frame: { label: 'Frame', key: 'F' },
};

export function Toolbar({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const hasSelection = editor.selection.length > 0;
  const selectedGroup = editor.selection.some((id) => editor.scene.get(id)?.type === 'group');

  const exportPNG = () => {
    const canvas = editor.exportPNGCanvas(2);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, 'board.png');
    }, 'image/png');
  };

  const saveJSON = () => {
    const json = JSON.stringify(editor.toBoardFile(), null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), 'board.json');
  };

  const loadJSON = (file: File | undefined) => {
    if (!file) return;
    file.text().then((text) => {
      try {
        editor.loadBoardFile(JSON.parse(text));
        editor.zoomToFit();
      } catch (err) {
        window.alert(`Could not load board: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  // Buttons never take focus so keyboard shortcuts keep reaching the board.
  const noFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="toolbar" role="toolbar" aria-label="Tools" onMouseDown={noFocus}>
      <div className="toolbar-group">
        {TOOLS.map((tool) => (
          <button
            key={tool}
            type="button"
            data-tool={tool}
            className={editor.tool === tool ? 'active' : ''}
            title={`${TOOL_LABELS[tool].label} (${TOOL_LABELS[tool].key})`}
            aria-pressed={editor.tool === tool}
            onClick={() => editor.setTool(tool)}
          >
            {TOOL_LABELS[tool].label}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button type="button" data-action="undo" disabled={!editor.history.canUndo} onClick={() => editor.undo()} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" data-action="redo" disabled={!editor.history.canRedo} onClick={() => editor.redo()} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button type="button" data-action="delete" disabled={!hasSelection} onClick={() => editor.deleteSelection()} title="Delete">
          Delete
        </button>
        <button type="button" data-action="group" disabled={editor.selection.length < 2} onClick={() => editor.groupSelection()} title="Group (Ctrl+G)">
          Group
        </button>
        <button type="button" data-action="ungroup" disabled={!selectedGroup} onClick={() => editor.ungroupSelection()} title="Ungroup (Ctrl+Shift+G)">
          Ungroup
        </button>
        <button type="button" data-action="bring-forward" disabled={!hasSelection} onClick={() => editor.bringForward()} title="Bring forward (])">
          Forward
        </button>
        <button type="button" data-action="send-backward" disabled={!hasSelection} onClick={() => editor.sendBackward()} title="Send backward ([)">
          Backward
        </button>
        <button type="button" data-action="bring-to-front" disabled={!hasSelection} onClick={() => editor.bringToFront()} title="Bring to front (})">
          To front
        </button>
        <button type="button" data-action="send-to-back" disabled={!hasSelection} onClick={() => editor.sendToBack()} title="Send to back ({)">
          To back
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" data-action="zoom-out" onClick={() => editor.zoomBy(0.8)} title="Zoom out (-)">
          −
        </button>
        <span className="zoom" data-testid="zoom-level">
          {Math.round(editor.camera.zoom * 100)}%
        </span>
        <button type="button" data-action="zoom-in" onClick={() => editor.zoomBy(1.25)} title="Zoom in (+)">
          +
        </button>
        <button type="button" data-action="zoom-fit" onClick={() => editor.zoomToFit()} title="Zoom to fit (Shift+1)">
          Fit
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" data-action="export-png" onClick={exportPNG} title="Export PNG">
          Export PNG
        </button>
        <button type="button" data-action="save-json" onClick={saveJSON} title="Save board">
          Save
        </button>
        <label className="file-button" title="Load board">
          Load
          <input
            type="file"
            accept="application/json,.json"
            data-action="load-json"
            onChange={(e) => {
              loadJSON(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
