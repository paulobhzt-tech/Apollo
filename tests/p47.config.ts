import { defineConfig, devices } from '@playwright/test';
const engine = process.env.P47_BROWSER || 'chrome';
const use = engine === 'webkit'
  ? {...devices['iPhone 13'], browserName:'webkit' as const}
  : engine === 'android'
    ? {...devices['Pixel 5'], browserName:'chromium' as const, channel:'chrome'}
    : {...devices['Desktop Chrome'], browserName:'chromium' as const, channel:engine};
export default defineConfig({
 testDir:'./e2e', outputDir:'./test-results/p47', workers:1,retries:0,
 timeout:60000,reporter:[['list'],['junit',{outputFile:'../evidence/p47-browser.xml'}]],
 use:{...use,ignoreHTTPSErrors:true,trace:'on',baseURL:'https://127.0.0.1:8001'},
 projects:[{name:'desktop'}]
});
