// End-to-end suite for Read Your MD.
//   npm test                 → Chromium project (all functional checks)
//   npm run test:e2e:all     → + Firefox / WebKit fallback checks (@xbrowser)
//   npm run test:e2e:report  → open the HTML report
// Servers are started automatically (dev on 5199, production preview on 4199)
// unless they are already running.
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..');
const DEV_PORT = 5199;
const PREVIEW_PORT = 4199;

module.exports = defineConfig({
  testDir: './specs',
  timeout: 90000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/results.json' }],
    ['html', { open: 'never', outputFolder: 'results/html' }],
  ],
  outputDir: 'results/artifacts',
  use: {
    baseURL: `http://127.0.0.1:${DEV_PORT}/`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  webServer: [
    {
      command: `npx vite --port ${DEV_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${DEV_PORT}/`,
      cwd: ROOT,
      reuseExistingServer: true,
      timeout: 90000,
      env: { NO_OPEN: '1' },
    },
    {
      command: `npx vite build && npx vite preview --port ${PREVIEW_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${PREVIEW_PORT}/`,
      cwd: ROOT,
      reuseExistingServer: true,
      timeout: 240000,
      env: { NO_OPEN: '1' },
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 900 } }, grep: /@xbrowser/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 900 } }, grep: /@xbrowser/ },
  ],
});
