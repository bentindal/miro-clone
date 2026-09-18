import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    // Everything against the Node sync server.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The collaboration suite again, against the Cloudflare Worker running on wrangler's local runtime.
    { name: 'chromium-worker', testMatch: /collab\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174' } },
  ],
  webServer: [
    {
      command: 'pnpm --filter whiteboard-server exec tsx src/index.ts',
      url: 'http://localhost:8787/healthz',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: '8787' },
    },
    {
      command: 'pnpm --filter whiteboard-worker exec wrangler dev --port 8788 --log-level warn',
      url: 'http://localhost:8788/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm build && pnpm preview',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Separate output directory so this build never races the one above.
      command: 'pnpm exec vite build --outDir dist-worker && pnpm exec vite preview --outDir dist-worker --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { SYNC_PROXY_TARGET: 'http://localhost:8788' },
    },
  ],
});
