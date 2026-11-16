import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./p6',outputDir:'./test-results/p6',workers:1,maxFailures:1,timeout:60000,
 reporter:[['list'],['json',{outputFile:'./test-results/p6/results.json'}]],
 use:{baseURL:'http://127.0.0.1:3001',launchOptions:{...(process.env.P6_CHROMIUM?{executablePath:process.env.P6_CHROMIUM}:{})},screenshot:'on',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},{name:'notebook',use:{viewport:{width:1366,height:768}}},{name:'tablet',use:{viewport:{width:820,height:1180},hasTouch:true}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]
});
