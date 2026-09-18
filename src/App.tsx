import { useEffect, useMemo, useState } from 'react';
import { Board } from './editor/Board';
import { Editor } from './editor/Editor';
import { Toolbar } from './editor/Toolbar';
import { ApiError, createBoard, getBoard, parseBoardLocation } from './sync/api';
import { SyncSession, loadUser } from './sync/session';
import { installTestHooks } from './testHooks';
import './app.css';

type Boot =
  | { kind: 'loading' }
  | { kind: 'local'; reason: string }
  | { kind: 'error'; message: string }
  | { kind: 'online'; session: SyncSession };

/**
 * Decides how the editor is backed:
 * - `/b/:id#token` joins that board through the sync server;
 * - `/` asks the server for a new board and moves to its edit link;
 * - if the server cannot be reached the board stays in this tab only.
 */
export default function App() {
  const editor = useMemo(() => {
    const e = new Editor();
    installTestHooks(e);
    return e;
  }, []);
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let session: SyncSession | null = null;
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
        setBoot({ kind: 'online', session });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setBoot({ kind: 'error', message: err.status === 404 ? 'This board does not exist.' : err.status === 403 ? 'This link is not valid for this board.' : err.message });
        } else {
          // Network failure: no sync server. Keep working locally.
          editor.adoptDocument();
          setBoot({ kind: 'local', reason: 'No sync server reachable; this board lives in this tab only.' });
        }
      }
    })();
    // A different token or board in the fragment means a different session: start over.
    const onHashChange = () => window.location.reload();
    window.addEventListener('hashchange', onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHashChange);
      session?.destroy();
    };
  }, [editor]);

  if (boot.kind === 'error') {
    return (
      <div className="app">
        <div className="boot-message" role="alert" data-testid="boot-error">
          <h1>Cannot open board</h1>
          <p>{boot.message}</p>
          <a href="/">Start a new board</a>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Toolbar editor={editor} session={boot.kind === 'online' ? boot.session : null} mode={boot.kind} />
      {boot.kind === 'loading' ? <div className="boot-message" data-testid="boot-loading">Opening board…</div> : <Board editor={editor} />}
    </div>
  );
}
