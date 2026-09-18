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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter whiteboard-server exec tsx src/index.ts',
      url: 'http://localhost:8787/healthz',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: '8787' },
    },
    {
      command: 'pnpm build && pnpm preview',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
