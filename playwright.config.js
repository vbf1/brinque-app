import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium-mobile', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'node tests/server.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 15000 }
});