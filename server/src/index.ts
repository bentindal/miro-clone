import { createApp } from './app.js';
import { openDatabase } from './db.js';
import { BoardStore } from './store.js';

const port = Number(process.env.PORT ?? 8787);
const { db, close, kind } = await openDatabase(process.env.DATABASE_URL, process.env.PGLITE_DIR);
const store = new BoardStore(db);
await store.migrate();
const app = createApp({ store, corsOrigin: process.env.CORS_ORIGIN ?? '*' });
app.server.listen(port, () => {
  console.log(`whiteboard sync server listening on :${port} (${kind})`);
});

const shutdown = async () => {
  console.log('shutting down');
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
