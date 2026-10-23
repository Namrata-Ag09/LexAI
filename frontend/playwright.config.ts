import { defineConfig } from '@playwright/test'

// Starts the real backend (serving the built frontend) with a throw-away data folder and NO Gemini key.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5055', trace: 'retain-on-failure' },
  webServer: {
    command: 'node e2e/start-backend.mjs',
    url: 'http://127.0.0.1:5055/api/health',
    reuseExistingServer: false,
    timeout: 90_000,
  },
})
