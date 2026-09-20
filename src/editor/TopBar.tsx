import { useEffect, useRef, useState } from 'react';
import { Button, Icon, IconButton, Panel, toast } from '../ui';
import { type SyncSession, saveUser } from '../sync/session';
import { downloadBlob } from './download';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';

const STATUS_LABEL: Record<string, string> = {
  local: 'Local only',
  connecting: 'Connecting…',
  connected: 'Live',
  offline: 'Reconnecting…',
};

export interface TopBarProps {
  editor: Editor;
  session: SyncSession | null;
  mode: 'loading' | 'local' | 'online';
}

/** Who and what, nothing else. Tools are on the rail, view controls bottom-left. */
export function TopBar({ editor, session, mode }: TopBarProps) {
  useEditorVersion(editor);
  const [, force] = useState(0);
  const [open, setOpen] = useState<'share' | 'menu' | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!session) return;
    return session.subscribe(() => force((n) => n + 1));
  }, [session]);

  // A popover closes when the next click lands outside it, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const status = mode === 'local' ? 'local' : session ? session.status : 'connecting';

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable; the field is selectable anyway.
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  const exportPNG = () => {
    const canvas = editor.exportPNGCanvas(2);
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, 'board.png');
        toast('Exported board.png', 'success');
      } else {
        toast('Could not export this board as a PNG', 'error');
      }
    }, 'image/png');
    setOpen(null);
  };

  const saveJSON = () => {
    const json = JSON.stringify(editor.toBoardFile(), null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), 'board.json');
    toast('Saved board.json', 'success');
    setOpen(null);
  };

  const loadJSON = (file: File | undefined) => {
    setOpen(null);
    if (!file) return;
    file.text().then((text) => {
      try {
        editor.loadBoardFile(JSON.parse(text));
        editor.zoomToFit();
        toast('Board loaded', 'success');
      } catch (err) {
        // A native alert blocked the tab until it was dismissed, and there was
        // nowhere to put the successful cases beside it.
        toast(`Could not load board: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    });
  };

  return (
    <header className="top-bar" ref={barRef} data-testid="top-bar">
      <input
        className="ui-input board-title"
        data-testid="board-title"
        aria-label="Board title"
        placeholder="Untitled board"
        value={editor.title}
        readOnly={editor.readOnly}
        onChange={(e) => editor.setTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className={`sync-status ${status}`} data-testid="sync-status" data-status={status} title={STATUS_LABEL[status]}>
        {STATUS_LABEL[status]}
      </span>
      {editor.readOnly && (
        <span className="badge" data-testid="read-only-badge">
          View only
        </span>
      )}
      <span className="top-bar-spacer" />
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
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
            }}
          />
          <Button
            icon="share"
            variant="primary"
            data-action="share"
            aria-expanded={open === 'share'}
            onClick={() => setOpen((o) => (o === 'share' ? null : 'share'))}
          >
            Share
          </Button>
        </>
      )}
      <IconButton icon="more" label="Board menu" variant="ghost" data-action="board-menu" aria-expanded={open === 'menu'} onClick={() => setOpen((o) => (o === 'menu' ? null : 'menu'))} />
      {open === 'share' && session && (
        <Panel className="share-panel" data-testid="share-panel">
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
      {open === 'menu' && (
        <Panel className="board-menu" data-testid="board-menu" role="menu">
          <Button icon="image" variant="ghost" role="menuitem" data-action="export-png" onClick={exportPNG}>
            Export as PNG
          </Button>
          <Button icon="save" variant="ghost" role="menuitem" data-action="save-json" onClick={saveJSON}>
            Save board
          </Button>
          <label className={`ui-button file-button${editor.readOnly ? ' disabled' : ''}`} data-variant="ghost" data-size="md" role="menuitem">
            <Icon name="load" />
            Load board
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Load board file"
              disabled={editor.readOnly}
              data-action="load-json"
              onChange={(e) => {
                loadJSON(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </Panel>
      )}
    </header>
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
