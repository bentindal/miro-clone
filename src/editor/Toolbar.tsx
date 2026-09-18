import { useEffect, useState } from 'react';
import { type Editor, type Tool, TOOLS } from './Editor';
import { useEditorVersion } from './useEditor';
import { downloadBlob } from './download';
import { type SyncSession, saveUser } from '../sync/session';

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

interface ToolbarProps {
  editor: Editor;
  session: SyncSession | null;
  mode: 'loading' | 'local' | 'online';
}

export function Toolbar({ editor, session, mode }: ToolbarProps) {
  useEditorVersion(editor);
  const hasSelection = editor.selection.length > 0;
  const selectedGroup = editor.selection.some((id) => editor.scene.get(id)?.type === 'group');
  const readOnly = editor.readOnly;

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
      <BoardHeader editor={editor} session={session} mode={mode} />
      <div className="toolbar-group">
        {TOOLS.map((tool) => (
          <button
            key={tool}
            type="button"
            data-tool={tool}
            className={editor.tool === tool ? 'active' : ''}
            title={`${TOOL_LABELS[tool].label} (${TOOL_LABELS[tool].key})`}
            aria-keyshortcuts={TOOL_LABELS[tool].key}
            aria-pressed={editor.tool === tool}
            disabled={readOnly && tool !== 'select' && tool !== 'hand'}
            onClick={() => editor.setTool(tool)}
          >
            {TOOL_LABELS[tool].label}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <button type="button" data-action="undo" disabled={!editor.canUndo || readOnly} onClick={() => editor.undo()} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" data-action="redo" disabled={!editor.canRedo || readOnly} onClick={() => editor.redo()} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button type="button" data-action="delete" disabled={!hasSelection || readOnly} onClick={() => editor.deleteSelection()} title="Delete">
          Delete
        </button>
        <button type="button" data-action="group" disabled={editor.selection.length < 2 || readOnly} onClick={() => editor.groupSelection()} title="Group (Ctrl+G)">
          Group
        </button>
        <button type="button" data-action="ungroup" disabled={!selectedGroup || readOnly} onClick={() => editor.ungroupSelection()} title="Ungroup (Ctrl+Shift+G)">
          Ungroup
        </button>
        <button type="button" data-action="bring-forward" disabled={!hasSelection || readOnly} onClick={() => editor.bringForward()} title="Bring forward (])">
          Forward
        </button>
        <button type="button" data-action="send-backward" disabled={!hasSelection || readOnly} onClick={() => editor.sendBackward()} title="Send backward ([)">
          Backward
        </button>
        <button type="button" data-action="bring-to-front" disabled={!hasSelection || readOnly} onClick={() => editor.bringToFront()} title="Bring to front (})">
          To front
        </button>
        <button type="button" data-action="send-to-back" disabled={!hasSelection || readOnly} onClick={() => editor.sendToBack()} title="Send to back ({)">
          To back
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" data-action="zoom-out" aria-label="Zoom out" onClick={() => editor.zoomBy(0.8)} title="Zoom out (-)">
          −
        </button>
        <span className="zoom" data-testid="zoom-level" aria-label="Zoom level">
          {Math.round(editor.camera.zoom * 100)}%
        </span>
        <button type="button" data-action="zoom-in" aria-label="Zoom in" onClick={() => editor.zoomBy(1.25)} title="Zoom in (+)">
          +
        </button>
        <button type="button" data-action="zoom-fit" onClick={() => editor.zoomToFit()} title="Zoom to fit (Shift+1)">
          Fit
        </button>
        <button
          type="button"
          data-action="toggle-grid"
          className={editor.gridSnap ? 'active' : ''}
          aria-pressed={editor.gridSnap}
          onClick={() => editor.setGridSnap(!editor.gridSnap)}
          title="Snap to grid (G)"
        >
          Grid
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" data-action="export-png" onClick={exportPNG} title="Export PNG">
          Export PNG
        </button>
        <button type="button" data-action="save-json" onClick={saveJSON} title="Save board">
          Save
        </button>
        <label className={`file-button${readOnly ? ' disabled' : ''}`} title="Load board">
          Load
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Load board file"
            disabled={readOnly}
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

function BoardHeader({ editor, session, mode }: ToolbarProps) {
  const [, force] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    return session.subscribe(() => force((n) => n + 1));
  }, [session]);

  const status = mode === 'local' ? 'local' : session ? session.status : 'connecting';
  const statusLabel: Record<string, string> = { local: 'Local only', connecting: 'Connecting…', connected: 'Live', offline: 'Reconnecting…' };
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable; the field is selectable anyway.
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  return (
    <div className="toolbar-group board-header">
      <input
        className="board-title"
        data-testid="board-title"
        aria-label="Board title"
        placeholder="Untitled board"
        value={editor.title}
        readOnly={editor.readOnly}
        onChange={(e) => editor.setTitle(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className={`sync-status ${status}`} data-testid="sync-status" data-status={status} title={statusLabel[status]}>
        {statusLabel[status]}
      </span>
      {editor.readOnly && (
        <span className="badge" data-testid="read-only-badge">
          View only
        </span>
      )}
      {session && (
        <>
          <div className="peers" data-testid="peers" aria-label="People on this board">
            <span className="peer self" style={{ background: session.user.color }} title={`${session.user.name} (you)`}>
              {initials(session.user.name)}
            </span>
            {editor.peers.map((p) => (
              <span key={p.clientId} className="peer" data-testid="peer" data-name={p.name} style={{ background: p.color }} title={p.name}>
                {initials(p.name)}
              </span>
            ))}
          </div>
          <input
            className="user-name"
            data-testid="user-name"
            aria-label="Your name"
            value={session.user.name}
            onChange={(e) => {
              const user = { ...session.user, name: e.target.value };
              session.setUser(user);
              saveUser(user);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
            }}
          />
          <button type="button" data-action="share" aria-expanded={shareOpen} onClick={() => setShareOpen((o) => !o)} title="Share this board">
            Share
          </button>
          {shareOpen && (
            <div className="share-panel" data-testid="share-panel" onMouseDown={(e) => e.stopPropagation()}>
              {session.info.editLink && (
                <label>
                  Anyone with this link can edit
                  <span className="share-row">
                    <input readOnly value={session.info.editLink} data-testid="share-edit-link" onFocus={(e) => e.target.select()} />
                    <button type="button" onClick={() => copy('edit', session.info.editLink!)}>
                      {copied === 'edit' ? 'Copied' : 'Copy'}
                    </button>
                  </span>
                </label>
              )}
              {session.info.viewLink && (
                <label>
                  Anyone with this link can view
                  <span className="share-row">
                    <input readOnly value={session.info.viewLink} data-testid="share-view-link" onFocus={(e) => e.target.select()} />
                    <button type="button" onClick={() => copy('view', session.info.viewLink!)}>
                      {copied === 'view' ? 'Copied' : 'Copy'}
                    </button>
                  </span>
                </label>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
