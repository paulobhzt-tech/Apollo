import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./p5',outputDir:'./test-results/p5',workers:1,timeout:30000,
 reporter:[['list'],['json',{outputFile:'./test-results/p5/results.json'}]],
 use:{baseURL:process.env.P5_BASE_URL||'http://127.0.0.1:3001',launchOptions:{...(process.env.P5_CHROMIUM ? {executablePath:process.env.P5_CHROMIUM} : {})},screenshot:'on'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},{name:'tablet',use:{viewport:{width:820,height:1180},hasTouch:true}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]
});
