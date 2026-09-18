import { randomBytes, randomUUID } from 'node:crypto';
import { type Role, safeEqual } from './protocol.js';

export type { Role };

/** The subset of a pg client (or PGlite) the store needs. */
export interface Queryable {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface BoardRecord {
  id: string;
  title: string;
  editToken: string;
  viewToken: string;
  createdAt: Date;
}

interface BoardRow {
  id: string;
  title: string;
  edit_token: string;
  view_token: string;
  created_at: Date;
}

/**
 * Board metadata plus the Yjs document, stored as a compacted state blob and
 * an append-only log of updates since the last compaction.
 */
export class BoardStore {
  constructor(private readonly db: Queryable) {}

  async migrate(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        edit_token TEXT NOT NULL UNIQUE,
        view_token TEXT NOT NULL UNIQUE,
        state BYTEA,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS board_updates (
        id BIGSERIAL PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        update BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await this.db.query('CREATE INDEX IF NOT EXISTS board_updates_board_id ON board_updates(board_id, id)');
  }

  async createBoard(title = ''): Promise<BoardRecord> {
    const id = randomUUID().replace(/-/g, '').slice(0, 20);
    const editToken = token();
    const viewToken = token();
    const { rows } = await this.db.query<BoardRow>(
      'INSERT INTO boards (id, title, edit_token, view_token) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, title, editToken, viewToken],
    );
    return toRecord(rows[0]);
  }

  async getBoard(id: string): Promise<BoardRecord | null> {
    const { rows } = await this.db.query<BoardRow>('SELECT * FROM boards WHERE id = $1', [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** The role a token grants on a board, or null when it matches neither link. */
  roleFor(board: BoardRecord, tokenValue: string | null | undefined): Role | null {
    if (!tokenValue) return null;
    if (safeEqual(tokenValue, board.editToken)) return 'edit';
    if (safeEqual(tokenValue, board.viewToken)) return 'view';
    return null;
  }

  async setTitle(id: string, title: string): Promise<void> {
    await this.db.query('UPDATE boards SET title = $2, updated_at = now() WHERE id = $1', [id, title]);
  }

  /** Compacted state plus every update logged since, in order. */
  async loadDocument(id: string): Promise<{ state: Uint8Array | null; updates: Uint8Array[] }> {
    const board = await this.db.query<{ state: Uint8Array | null }>('SELECT state FROM boards WHERE id = $1', [id]);
    if (board.rows.length === 0) throw new Error(`Unknown board ${id}`);
    const log = await this.db.query<{ update: Uint8Array }>('SELECT update FROM board_updates WHERE board_id = $1 ORDER BY id', [id]);
    return { state: board.rows[0].state ? toBytes(board.rows[0].state) : null, updates: log.rows.map((r) => toBytes(r.update)) };
  }

  async appendUpdate(id: string, update: Uint8Array): Promise<void> {
    await this.db.query('INSERT INTO board_updates (board_id, update) VALUES ($1, $2)', [id, Buffer.from(update)]);
    await this.db.query('UPDATE boards SET updated_at = now() WHERE id = $1', [id]);
  }

  /** Replace the state blob with a full snapshot and drop the update log. */
  async compact(id: string, state: Uint8Array): Promise<void> {
    await this.db.query('UPDATE boards SET state = $2, updated_at = now() WHERE id = $1', [id, Buffer.from(state)]);
    await this.db.query('DELETE FROM board_updates WHERE board_id = $1', [id]);
  }

  async countUpdates(id: string): Promise<number> {
    const { rows } = await this.db.query<{ n: string | number }>('SELECT count(*) AS n FROM board_updates WHERE board_id = $1', [id]);
    return Number(rows[0].n);
  }
}

function toRecord(r: BoardRow): BoardRecord {
  return { id: r.id, title: r.title, editToken: r.edit_token, viewToken: r.view_token, createdAt: new Date(r.created_at) };
}

function toBytes(v: Uint8Array | Buffer | ArrayBuffer): Uint8Array {
  if (v instanceof Uint8Array) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return new Uint8Array(v);
}

function token(): string {
  return randomBytes(18).toString('base64url');
}
