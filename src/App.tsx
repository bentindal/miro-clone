import { useEffect, useMemo, useState } from 'react';
import { Board } from './editor/Board';
import { CommandPalette } from './editor/CommandPalette';
import { Editor } from './editor/Editor';
import { Minimap } from './editor/Minimap';
import { Dock } from './editor/Dock';
import { ToolRail } from './editor/ToolRail';
import { TopBar } from './editor/TopBar';
import { ZoomCluster } from './editor/ZoomCluster';
import { Toaster, appearance } from './ui';
import { Home } from './Home';
import { ApiError, NoSyncServerError, createBoard, getBoard, parseBoardLocation } from './sync/api';
import { rememberBoard, updateRecentTitle } from './sync/recent';
import { SyncSession, loadUser } from './sync/session';
import { installTestHooks } from './testHooks';
import './app.css';

type Boot =
  | { kind: 'home' }
  | { kind: 'loading' }
  | { kind: 'local'; reason: string }
  | { kind: 'error'; message: string }
  | { kind: 'online'; session: SyncSession };

/**
 * Decides what to show:
 * - `/` lists the boards this browser has opened;
 * - `/new` asks the server for a new board and moves to its edit link;
 * - `/b/:id#token` joins that board through the sync server;
 * - if the server cannot be reached the board stays in this tab only.
 */
export default function App() {
  const editor = useMemo(() => {
    const e = new Editor();
    installTestHooks(e);
    return e;
  }, []);
  const [boot, setBoot] = useState<Boot>(() => (window.location.pathname === '/' ? { kind: 'home' } : { kind: 'loading' }));

  // The canvas cannot read CSS variables, so it re-resolves them whenever the
  // theme changes: by choice, or because the system changed under 'system'.
  useEffect(() => {
    const refresh = () => editor.refreshTheme();
    const unsubscribe = appearance.subscribe(refresh);
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    system.addEventListener('change', refresh);
    return () => {
      unsubscribe();
      system.removeEventListener('change', refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (boot.kind === 'home') return;
    let cancelled = false;
    let session: SyncSession | null = null;
    let unsubscribeTitle: (() => void) | null = null;
    (async () => {
      try {
        let loc = parseBoardLocation();
        if (!loc) {
          const created = await createBoard();
          window.history.replaceState(null, '', `/b/${created.id}#${created.editToken}`);
          loc = { id: created.id, token: created.editToken };
        }
        const info = await getBoard(loc.id, loc.token);
        if (cancelled) return;
        const links = SyncSession.links(info.id, info.role, info.role === 'edit' ? loc.token : null, info.role === 'edit' ? (info.viewToken ?? null) : loc.token);
        session = new SyncSession(editor, { boardId: info.id, role: info.role, ...links }, loc.token, loadUser());
        installTestHooks(editor, session);
        rememberBoard({ id: info.id, title: info.title, token: loc.token, role: info.role });
        const boardId = info.id;
        unsubscribeTitle = editor.subscribe(() => updateRecentTitle(boardId, editor.title));
        setBoot({ kind: 'online', session });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          // The server answered: this really is a bad board or a bad token.
          setBoot({ kind: 'error', message: err.status === 404 ? 'This board does not exist.' : err.status === 403 ? 'This link is not valid for this board.' : err.message });
        } else if (err instanceof NoSyncServerError) {
          // Nothing is serving the API here. Keep working, in this tab only.
          editor.adoptDocument();
          setBoot({ kind: 'local', reason: 'No sync server reachable; this board lives in this tab only.' });
        } else {
          setBoot({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    // A different token or board in the fragment means a different session: start over.
    const onHashChange = () => window.location.reload();
    window.addEventListener('hashchange', onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHashChange);
      unsubscribeTitle?.();
      session?.destroy();
    };
    // The boot kind is fixed at mount: the page reloads on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (boot.kind === 'home') {
    return (
      <div className="app">
        <Home />
      </div>
    );
  }

  if (boot.kind === 'error') {
    return (
      <div className="app">
        <div className="boot-message" role="alert" data-testid="boot-error">
          <h1>Cannot open board</h1>
          <p>{boot.message}</p>
          <a href="/new">Start a new board</a> or <a href="/">see your boards</a>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar editor={editor} session={boot.kind === 'online' ? boot.session : null} mode={boot.kind} />
      {boot.kind === 'loading' ? (
        <div className="boot-message" data-testid="boot-loading">
          Opening board…
        </div>
      ) : (
        // The canvas fills the workspace; the rail, the view controls and the
        // dock float above it rather than eating into it.
        <div className="workspace">
          <Board editor={editor} />
          <ToolRail editor={editor} />
          <ZoomCluster editor={editor} />
          <Minimap editor={editor} />
          <Dock editor={editor} />
        </div>
      )}
      <CommandPalette editor={editor} />
      <Toaster />
    </div>
  );
}
