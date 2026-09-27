import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.visual.ts',
  outputDir: './test-results/ai-visual-review',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    trace: 'off',
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    stdout: 'ignore',
    timeout: 60_000,
  },
})
