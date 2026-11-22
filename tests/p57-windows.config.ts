import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const preview = 'http://127.0.0.1:3000';

export default defineConfig(base, {
  use: { ...base.use, baseURL: preview },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 3000 --strictPort',
    cwd: '../frontend',
    url: preview,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
