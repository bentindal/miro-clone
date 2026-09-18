import { WebsocketProvider } from 'y-websocket';
import type { Editor, Peer } from '../editor/Editor';
import { boardLink, wsBase } from './api';

export type SyncStatus = 'connecting' | 'connected' | 'offline';

export interface SessionInfo {
  boardId: string;
  role: 'edit' | 'view';
  editLink: string | null;
  viewLink: string | null;
}

export const PEER_COLORS = ['#e53935', '#8e24aa', '#1e88e5', '#00897b', '#fb8c00', '#3949ab', '#d81b60', '#6d4c41'];

interface AwarenessUser {
  name: string;
  color: string;
}

interface AwarenessState {
  user?: AwarenessUser;
  cursor?: { x: number; y: number } | null;
  selection?: string[];
}

/**
 * Connects an editor to a board room: document sync through y-websocket and
 * presence (name, colour, cursor, selection) through the awareness protocol.
 */
export class SyncSession {
  readonly provider: WebsocketProvider;
  status: SyncStatus = 'connecting';
  synced = false;
  private listeners = new Set<() => void>();
  private cursorTimer: number | null = null;
  private lastCursor: { x: number; y: number } | null = null;
  private lastSelection = '';
  private unsubscribeEditor: () => void;

  constructor(
    readonly editor: Editor,
    readonly info: SessionInfo,
    token: string,
    user: AwarenessUser,
  ) {
    this.provider = new WebsocketProvider(wsBase(), info.boardId, editor.doc, { params: { token }, disableBc: true });
    this.provider.awareness.setLocalStateField('user', user);
    this.provider.on('status', ({ status }: { status: string }) => {
      this.status = status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'offline';
      this.emit();
    });
    this.provider.on('sync', (isSynced: boolean) => {
      if (isSynced && !this.synced) {
        this.synced = true;
        editor.adoptDocument();
      }
      this.emit();
    });
    this.provider.awareness.on('change', () => this.publishPeers());
    const unsubChange = editor.subscribe(() => this.publishLocalState());
    const unsubPointer = editor.onPointer(() => this.publishLocalState());
    this.unsubscribeEditor = () => {
      unsubChange();
      unsubPointer();
    };
    editor.setReadOnly(info.role === 'view');
  }

  static links(boardId: string, role: 'edit' | 'view', editToken: string | null, viewToken: string | null): Pick<SessionInfo, 'editLink' | 'viewLink'> {
    return {
      editLink: role === 'edit' && editToken ? boardLink(boardId, editToken) : null,
      viewLink: viewToken ? boardLink(boardId, viewToken) : null,
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get user(): AwarenessUser {
    return (this.provider.awareness.getLocalState() as AwarenessState | null)?.user ?? { name: '', color: PEER_COLORS[0] };
  }

  setUser(user: AwarenessUser): void {
    this.provider.awareness.setLocalStateField('user', user);
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Throttled publish of cursor and selection from editor state. */
  private publishLocalState(): void {
    const selection = this.editor.selection.join(',');
    if (selection !== this.lastSelection) {
      this.lastSelection = selection;
      this.provider.awareness.setLocalStateField('selection', this.editor.selection);
    }
    const cursor = this.editor.pointerWorld;
    if (cursor === this.lastCursor) return;
    this.lastCursor = cursor;
    if (this.cursorTimer !== null) return;
    this.cursorTimer = window.setTimeout(() => {
      this.cursorTimer = null;
      this.provider.awareness.setLocalStateField('cursor', this.lastCursor ? { x: this.lastCursor.x, y: this.lastCursor.y } : null);
    }, 40);
  }

  private publishPeers(): void {
    const peers: Peer[] = [];
    const local = this.provider.awareness.clientID;
    for (const [clientId, raw] of this.provider.awareness.getStates()) {
      if (clientId === local) continue;
      const state = raw as AwarenessState;
      if (!state.user) continue;
      peers.push({
        clientId,
        name: state.user.name || 'Guest',
        color: state.user.color || PEER_COLORS[clientId % PEER_COLORS.length],
        cursor: state.cursor ?? null,
        selection: Array.isArray(state.selection) ? state.selection : [],
      });
    }
    peers.sort((a, b) => a.clientId - b.clientId);
    this.editor.setPeers(peers);
  }

  destroy(): void {
    this.unsubscribeEditor();
    if (this.cursorTimer !== null) window.clearTimeout(this.cursorTimer);
    this.provider.awareness.setLocalState(null);
    this.provider.destroy();
    this.editor.setPeers([]);
  }
}

/** A stable per-browser guest identity. */
export function loadUser(): AwarenessUser {
  try {
    const raw = window.localStorage.getItem('whiteboard.user');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AwarenessUser>;
      if (typeof parsed.name === 'string' && typeof parsed.color === 'string') return { name: parsed.name, color: parsed.color };
    }
  } catch {
    // Storage unavailable: fall through to a fresh guest.
  }
  const user = { name: `Guest ${Math.floor(1000 + Math.random() * 9000)}`, color: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)] };
  saveUser(user);
  return user;
}

export function saveUser(user: AwarenessUser): void {
  try {
    window.localStorage.setItem('whiteboard.user', JSON.stringify(user));
  } catch {
    // Ignore: identity just will not persist.
  }
}
