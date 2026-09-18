import type { Queryable } from './store.js';

/**
 * A real Postgres pool when DATABASE_URL is set, otherwise PGlite (Postgres
 * compiled to WebAssembly) in memory or in a directory. The store runs the
 * same SQL against either.
 */
export async function openDatabase(databaseUrl: string | undefined, pgliteDir?: string): Promise<{ db: Queryable; close(): Promise<void>; kind: string }> {
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl });
    return { db: pool, close: () => pool.end(), kind: 'postgres' };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const pglite = pgliteDir ? new PGlite(pgliteDir) : new PGlite();
  await pglite.waitReady;
  const db: Queryable = {
    async query<R>(sql: string, params: unknown[] = []) {
      const result = await pglite.query<R>(sql, params);
      return { rows: result.rows };
    },
  };
  return { db, close: () => pglite.close(), kind: pgliteDir ? `pglite:${pgliteDir}` : 'pglite:memory' };
}
