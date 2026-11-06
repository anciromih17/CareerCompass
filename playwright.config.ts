import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1, // One isolated database; each test resets its own starting state.
  retries: 0, // Failures stay visible in the assignment report.
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'], ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4300',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
});
