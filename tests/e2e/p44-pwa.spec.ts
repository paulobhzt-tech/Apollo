import { test, expect } from '@playwright/test';
const base = 'https://127.0.0.1:8001';
test('public application shell survives navigation; private API stays uncached', async ({browser}, info) => {
  const context = await browser.newContext({ignoreHTTPSErrors:false});
  try {
    const page = await context.newPage();
    await page.goto(base);
    await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)), {
      timeout:15000, message:'Production service worker must control the page with trusted test TLS'
    }).toBe(true);
    const cached = await page.evaluate(async () => {
      const result:string[]=[];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) result.push(new URL(request.url).pathname);
      }
      return result.sort();
    });
    expect(cached).toContain('/index.html');
    expect(cached.filter(path => !path.startsWith('/assets/'))).toEqual([
      '/apple-touch-icon.png', '/index.html', '/manifest.webmanifest', '/offline.html',
    ]);
    await context.setOffline(true);
    const navigation = await page.goto(base+'/pdv');
    expect(await navigation?.headerValue('x-apollo-offline-fallback')).toBe('shell');
    await expect(page.getByLabel('Usuário',{exact:true})).toBeVisible();
    expect(await page.evaluate(async()=>{try {await fetch('/api/auth/me');return true;} catch {return false;}})).toBe(false);
    await page.reload();
    await expect(page.getByLabel('Usuário',{exact:true})).toBeVisible();
    await info.attach('offline-public-notice',{body:await page.screenshot(),contentType:'image/png'});
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByLabel('Usuário',{exact:true})).toBeVisible();
  } finally { await context.close(); }
});
test('first ever opening without network has no installed application or fake sale UI',async({browser})=>{
  const context=await browser.newContext({ignoreHTTPSErrors:false,offline:true});
  try {
    const page=await context.newPage();
    let failed=false;
    try {await page.goto(base);} catch {failed=true;}
    expect(failed).toBe(true);
    expect(await context.serviceWorkers()).toHaveLength(0);
  } finally {await context.close();}
});
