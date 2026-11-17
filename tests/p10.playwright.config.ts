import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./p10',outputDir:'./test-results/p10',workers:1,timeout:90000,
 reporter:[['list'],['json',{outputFile:'./test-results/p10/results.json'}]],
 use:{launchOptions:{...(process.env.P10_CHROMIUM?{executablePath:process.env.P10_CHROMIUM}: {})},baseURL:'https://127.0.0.1:8444',ignoreHTTPSErrors:true,screenshot:'on',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},
 {name:'notebook',use:{viewport:{width:1366,height:768}}},
 {name:'tablet',use:{viewport:{width:820,height:1180},hasTouch:true}},
 {name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]
});
