/** Boards this browser has opened, newest first. Stored locally; no accounts yet. */
export interface RecentBoard {
  id: string;
  title: string;
  token: string;
  role: 'edit' | 'view';
  openedAt: number;
}

const KEY = 'whiteboard.recent';
const LIMIT = 50;

export function listRecentBoards(): RecentBoard[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b): b is RecentBoard => typeof b === 'object' && b !== null && typeof (b as RecentBoard).id === 'string' && typeof (b as RecentBoard).token === 'string')
      .sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

function save(boards: RecentBoard[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(boards.slice(0, LIMIT)));
  } catch {
    // Storage unavailable: the list just will not persist.
  }
}

/** Record a board as opened now. An edit link replaces a view link for the same board, never the reverse. */
export function rememberBoard(board: Omit<RecentBoard, 'openedAt'>): void {
  const boards = listRecentBoards();
  const existing = boards.find((b) => b.id === board.id);
  const keepEditLink = existing?.role === 'edit' && board.role === 'view';
  const next: RecentBoard = {
    ...board,
    token: keepEditLink ? existing.token : board.token,
    role: keepEditLink ? 'edit' : board.role,
    openedAt: Date.now(),
  };
  save([next, ...boards.filter((b) => b.id !== board.id)]);
}

export function updateRecentTitle(id: string, title: string): void {
  const boards = listRecentBoards();
  const target = boards.find((b) => b.id === id);
  if (!target || target.title === title) return;
  target.title = title;
  save(boards);
}

export function forgetBoard(id: string): void {
  save(listRecentBoards().filter((b) => b.id !== id));
}
