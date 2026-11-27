import { defineConfig, devices } from '@playwright/test';
const engine = process.env.P47_BROWSER || 'chrome';
const use = engine === 'webkit'
  ? {...devices['iPhone 13'], browserName:'webkit' as const}
  : engine === 'firefox'
    ? {...devices['Desktop Firefox'], browserName:'firefox' as const}
    : engine === 'chromium'
      ? {...devices['Desktop Chrome'], browserName:'chromium' as const}
      : engine === 'android'
    ? {...devices['Pixel 5'], browserName:'chromium' as const, channel:'chrome'}
    : {...devices['Desktop Chrome'], browserName:'chromium' as const, channel:engine};
const tlsSpki = process.env.APOLLO_TEST_TLS_SPKI;
const launchOptions = {
 executablePath: process.env.APOLLO_BROWSER_EXECUTABLE,
 args: tlsSpki && use.browserName === 'chromium' ? ['--ignore-certificate-errors-spki-list=' + tlsSpki] : undefined,
};
export default defineConfig({
 testDir:'./e2e', outputDir:'./test-results/p47', workers:1,retries:0,
 timeout:60000,reporter:[['list'],['junit',{outputFile:'../evidence/p47-browser.xml'}]],
 use:{...use,ignoreHTTPSErrors:true,launchOptions,trace:'on',baseURL:process.env.APOLLO_E2E_BASE_URL || 'https://127.0.0.1:8001'},
 projects:[{name:'desktop'}]
});
