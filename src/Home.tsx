import { useState } from 'react';
import { boardLink } from './sync/api';
import { type RecentBoard, forgetBoard, listRecentBoards } from './sync/recent';
import { IconButton } from './ui';

/** Landing page: boards opened in this browser, and a way to start a new one. */
export function Home() {
  const [boards, setBoards] = useState<RecentBoard[]>(() => listRecentBoards());
  const remove = (id: string) => {
    forgetBoard(id);
    setBoards(listRecentBoards());
  };
  return (
    <div className="home" data-testid="home">
      <header className="home-header">
        <h1>Whiteboard</h1>
        <a className="button primary" href="/new" data-testid="new-board">
          New board
        </a>
      </header>
      {boards.length === 0 ? (
        <p className="home-empty" data-testid="home-empty">
          No boards yet. Boards you open in this browser will be listed here.
        </p>
      ) : (
        <ul className="board-list" aria-label="Recent boards">
          {boards.map((b) => (
            <li key={b.id} data-testid="board-entry" data-board-id={b.id}>
              <a href={boardLink(b.id, b.token)} className="board-link">
                <span className="board-name">{b.title || 'Untitled board'}</span>
                <span className="board-meta">
                  {b.role === 'view' ? 'View only · ' : ''}
                  {formatWhen(b.openedAt)}
                </span>
              </a>
              <IconButton
                icon="close"
                label={`Remove ${b.title || 'Untitled board'} from this list`}
                variant="ghost"
                size="sm"
                title="Remove from this list"
                onClick={() => remove(b.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="home-note">Boards are shared by link. Anyone with an edit link can change the board; a view link only lets people look.</p>
    </div>
  );
}

function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ts).toLocaleDateString();
}
