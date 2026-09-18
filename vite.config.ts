import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SYNC_TARGET = process.env.SYNC_PROXY_TARGET ?? 'http://localhost:8787';

/** Same-origin `/api` and `/ws` reach the sync server in dev and preview. */
const proxy = {
  '/api': { target: SYNC_TARGET, changeOrigin: true },
  '/ws': { target: SYNC_TARGET.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022' },
  server: { proxy },
  preview: { proxy },
});
