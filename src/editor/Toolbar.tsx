import { useEffect, useState } from 'react';
import { type Editor, type Tool, TOOLS } from './Editor';
import { useEditorVersion } from './useEditor';
import { downloadBlob } from './download';
import { type SyncSession, saveUser } from '../sync/session';
import { Button, Divider, Icon, type IconName, IconButton, Panel, Tooltip } from '../ui';

const TOOL_META: Record<Tool, { label: string; key: string; icon: IconName }> = {
  select: { label: 'Select', key: 'V', icon: 'select' },
  hand: { label: 'Hand', key: 'H', icon: 'hand' },
  rect: { label: 'Rectangle', key: 'R', icon: 'rect' },
  ellipse: { label: 'Ellipse', key: 'O', icon: 'ellipse' },
  line: { label: 'Line', key: 'L', icon: 'line' },
  sticky: { label: 'Sticky', key: 'N', icon: 'sticky' },
  text: { label: 'Text', key: 'T', icon: 'text' },
  pen: { label: 'Pen', key: 'P', icon: 'pen' },
  connector: { label: 'Connector', key: 'C', icon: 'connector' },
  frame: { label: 'Frame', key: 'F', icon: 'frame' },
  comment: { label: 'Comment', key: 'M', icon: 'comment' },
};

/** Editing actions, in the order they appear. Each is one entry, not one block of JSX. */
type ActionId = 'undo' | 'redo' | 'delete' | 'group' | 'ungroup' | 'bring-forward' | 'send-backward' | 'bring-to-front' | 'send-to-back';

const ACTIONS: { id: ActionId; label: string; icon: IconName; shortcut?: string; run: (e: Editor) => void; enabled: (e: Editor) => boolean }[] = [
  { id: 'undo', label: 'Undo', icon: 'undo', shortcut: 'Ctrl+Z', run: (e) => e.undo(), enabled: (e) => e.canUndo },
  { id: 'redo', label: 'Redo', icon: 'redo', shortcut: 'Ctrl+Shift+Z', run: (e) => e.redo(), enabled: (e) => e.canRedo },
  { id: 'delete', label: 'Delete', icon: 'trash', shortcut: 'Delete', run: (e) => e.deleteSelection(), enabled: (e) => e.selection.length > 0 },
  { id: 'group', label: 'Group', icon: 'group', shortcut: 'Ctrl+G', run: (e) => e.groupSelection(), enabled: (e) => e.selection.length >= 2 },
  {
    id: 'ungroup',
    label: 'Ungroup',
    icon: 'ungroup',
    shortcut: 'Ctrl+Shift+G',
    run: (e) => e.ungroupSelection(),
    enabled: (e) => e.selection.some((id) => e.scene.get(id)?.type === 'group'),
  },
  { id: 'bring-forward', label: 'Forward', icon: 'forward', shortcut: ']', run: (e) => e.bringForward(), enabled: (e) => e.selection.length > 0 },
  { id: 'send-backward', label: 'Backward', icon: 'backward', shortcut: '[', run: (e) => e.sendBackward(), enabled: (e) => e.selection.length > 0 },
  { id: 'bring-to-front', label: 'To front', icon: 'front', shortcut: '}', run: (e) => e.bringToFront(), enabled: (e) => e.selection.length > 0 },
  { id: 'send-to-back', label: 'To back', icon: 'back', shortcut: '{', run: (e) => e.sendToBack(), enabled: (e) => e.selection.length > 0 },
];

interface ToolbarProps {
  editor: Editor;
  session: SyncSession | null;
  mode: 'loading' | 'local' | 'online';
}

export function Toolbar({ editor, session, mode }: ToolbarProps) {
  useEditorVersion(editor);
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
  const openComments = editor.comments.openCount;

  return (
    <div className="toolbar" role="toolbar" aria-label="Tools" onMouseDown={noFocus}>
      <BoardHeader editor={editor} session={session} mode={mode} />
      <Divider />
      <div className="toolbar-group">
        {TOOLS.map((tool) => {
          const meta = TOOL_META[tool];
          return (
            <Tooltip key={tool} label={meta.label} shortcut={meta.key}>
              <IconButton
                icon={meta.icon}
                label={meta.label}
                data-tool={tool}
                aria-keyshortcuts={meta.key}
                active={editor.tool === tool}
                disabled={readOnly && tool !== 'select' && tool !== 'hand'}
                onClick={() => editor.setTool(tool)}
              />
            </Tooltip>
          );
        })}
      </div>
      <Divider />
      <div className="toolbar-group">
        {ACTIONS.map((a) => (
          <Tooltip key={a.id} label={a.label} shortcut={a.shortcut}>
            <IconButton icon={a.icon} label={a.label} variant="ghost" data-action={a.id} disabled={!a.enabled(editor) || readOnly} onClick={() => a.run(editor)} />
          </Tooltip>
        ))}
      </div>
      <Divider />
      <div className="toolbar-group">
        <Tooltip label="Zoom out" shortcut="−">
          <IconButton icon="zoomOut" label="Zoom out" variant="ghost" data-action="zoom-out" onClick={() => editor.zoomBy(0.8)} />
        </Tooltip>
        <span className="zoom" data-testid="zoom-level" aria-label="Zoom level">
          {Math.round(editor.camera.zoom * 100)}%
        </span>
        <Tooltip label="Zoom in" shortcut="+">
          <IconButton icon="zoomIn" label="Zoom in" variant="ghost" data-action="zoom-in" onClick={() => editor.zoomBy(1.25)} />
        </Tooltip>
        <Tooltip label="Zoom to fit" shortcut="Shift+1">
          <IconButton icon="fit" label="Fit" variant="ghost" data-action="zoom-fit" onClick={() => editor.zoomToFit()} />
        </Tooltip>
        <Tooltip label="Snap to grid" shortcut="G">
          <IconButton icon="grid" label="Grid" variant="ghost" data-action="toggle-grid" active={editor.gridSnap} onClick={() => editor.setGridSnap(!editor.gridSnap)} />
        </Tooltip>
      </div>
      <Divider />
      <div className="toolbar-group">
        <Tooltip label={openComments > 0 ? `Comments (${openComments} open)` : 'Comments'}>
          <Button
            icon="comment"
            variant="ghost"
            data-action="toggle-comments"
            aria-label={openComments > 0 ? `Comments, ${openComments} open` : 'Comments'}
            active={editor.commentsOpen}
            onClick={() => editor.setCommentsOpen(!editor.commentsOpen)}
          >
            {openComments > 0 ? openComments : null}
          </Button>
        </Tooltip>
        <Tooltip label="Export as PNG">
          <IconButton icon="image" label="Export PNG" variant="ghost" data-action="export-png" onClick={exportPNG} />
        </Tooltip>
        <Tooltip label="Save board as JSON">
          <IconButton icon="save" label="Save" variant="ghost" data-action="save-json" onClick={saveJSON} />
        </Tooltip>
        <Tooltip label="Load a board file">
          <label className={`ui-button ui-icon-button file-button${readOnly ? ' disabled' : ''}`} data-variant="ghost" data-size="md">
            <Icon name="load" />
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
        </Tooltip>
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
        className="ui-input board-title"
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
            className="ui-input user-name"
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
          <Button icon="share" data-action="share" aria-expanded={shareOpen} onClick={() => setShareOpen((o) => !o)}>
            Share
          </Button>
          {shareOpen && (
            <Panel className="share-panel" data-testid="share-panel" onMouseDown={(e) => e.stopPropagation()}>
              {session.info.editLink && (
                <label>
                  Anyone with this link can edit
                  <span className="share-row">
                    <input className="ui-input" readOnly value={session.info.editLink} data-testid="share-edit-link" onFocus={(e) => e.target.select()} />
                    <Button size="sm" icon={copied === 'edit' ? 'check' : undefined} onClick={() => copy('edit', session.info.editLink!)}>
                      {copied === 'edit' ? 'Copied' : 'Copy'}
                    </Button>
                  </span>
                </label>
              )}
              {session.info.viewLink && (
                <label>
                  Anyone with this link can view
                  <span className="share-row">
                    <input className="ui-input" readOnly value={session.info.viewLink} data-testid="share-view-link" onFocus={(e) => e.target.select()} />
                    <Button size="sm" icon={copied === 'view' ? 'check' : undefined} onClick={() => copy('view', session.info.viewLink!)}>
                      {copied === 'view' ? 'Copied' : 'Copy'}
                    </Button>
                  </span>
                </label>
              )}
            </Panel>
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
