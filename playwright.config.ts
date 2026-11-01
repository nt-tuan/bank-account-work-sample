import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** Isolated E2E services: their own databases under .e2e-data, short configured delays, one worker (spec §13). */
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command:
      "npm run build && node -e \"require('fs').rmSync('.e2e-data',{recursive:true,force:true})\" && tsx server/main.ts",
    url: `${ORIGIN}/api/session`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      APP_ORIGIN: ORIGIN,
      DATA_DIR: '.e2e-data',
      SERVE_STATIC: 'true',
      EXECUTION_DELAY_MS: '400',
      PARTNER_LATENCY_MIN_MS: '0',
      PARTNER_LATENCY_MAX_MS: '20',
    },
  },
});
