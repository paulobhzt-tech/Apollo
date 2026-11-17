import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './mesas', outputDir: './test-results/mesas', workers: 1, timeout: 45000,
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.002 } },
  reporter: [['list'], ['json', { outputFile: './test-results/mesas/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:3018', timezoneId: 'America/Sao_Paulo', locale: 'pt-BR',
    launchOptions: { ...(process.env.MESAS_CHROMIUM ? { executablePath: process.env.MESAS_CHROMIUM } : {}) },
    trace: 'retain-on-failure' },
  projects: [375, 390, 768, 1366, 1920].map(width => ({ name: `width-${width}`, use: { viewport: { width, height: 900 } } })),
});
