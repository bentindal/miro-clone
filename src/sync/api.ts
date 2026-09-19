/** Base URL of the sync server; empty means same origin (the dev/preview proxy). */
export const SYNC_BASE: string = (import.meta.env.VITE_SYNC_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface CreatedBoard {
  id: string;
  title: string;
  editToken: string;
  viewToken: string;
}

export interface BoardInfo {
  id: string;
  title: string;
  role: 'edit' | 'view';
  viewToken?: string;
}

/** The sync server answered, and the answer was no. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Nothing is serving the API at this origin.
 *
 * This is not the same as a board being missing, and telling them apart
 * matters: a static host with no sync server answers `/api/boards` with its
 * own HTML 404, which read as "this board does not exist" and left the only
 * way out — starting a new board — failing the same way. What separates them
 * is the content type: the API always answers in JSON.
 */
export class NoSyncServerError extends Error {
  constructor(readonly cause?: unknown) {
    super('No sync server at this origin');
  }
}

function isJSON(res: Response): boolean {
  return (res.headers.get('content-type') ?? '').toLowerCase().includes('application/json');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SYNC_BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  } catch (err) {
    // Offline, DNS failure, the server refusing the connection.
    throw new NoSyncServerError(err);
  }
  if (!isJSON(res)) throw new NoSyncServerError();
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (body === null) throw new NoSyncServerError();
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function createBoard(title = ''): Promise<CreatedBoard> {
  return request<CreatedBoard>('/api/boards', { method: 'POST', body: JSON.stringify({ title }) });
}

export function getBoard(id: string, token: string): Promise<BoardInfo> {
  return request<BoardInfo>(`/api/boards/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
}

/** WebSocket endpoint derived from the API base (or the page origin). */
export function wsBase(): string {
  if (SYNC_BASE) return `${SYNC_BASE.replace(/^http/, 'ws')}/ws`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

/** Link to open this board, with the token in the fragment so it never reaches a server log. */
export function boardLink(id: string, token: string): string {
  return `${window.location.origin}/b/${id}#${token}`;
}

/** Parse `/b/:id#token` from the current location. */
export function parseBoardLocation(loc: Location = window.location): { id: string; token: string } | null {
  const m = loc.pathname.match(/^\/b\/([A-Za-z0-9_-]+)\/?$/);
  if (!m) return null;
  return { id: m[1], token: loc.hash.replace(/^#/, '') };
}
