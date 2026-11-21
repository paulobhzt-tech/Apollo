import { test, expect } from '@playwright/test';
const base = 'https://127.0.0.1:8001';
test('public offline notice survives navigation; private API and authenticated HTML stay uncached', async ({browser}, info) => {
  const context = await browser.newContext({ignoreHTTPSErrors:true});
  try {
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
    });
    const cached = await page.evaluate(async () => {
      const result:string[]=[];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) result.push(new URL(request.url).pathname);
      }
      return result.sort();
    });
    expect(cached).toEqual(['/manifest.webmanifest','/offline.html']);
    await context.setOffline(true);
    await page.goto(base+'/pdv');
    await expect(page.getByRole('heading',{name:'Apollo sem conexão'})).toBeVisible();
    await expect(page.getByText('Esta tela não permite registrar vendas.',{exact:false})).toBeVisible();
    expect(await page.evaluate(async()=>{try {await fetch('/api/auth/me');return true;} catch {return false;}})).toBe(false);
    await page.reload();
    await expect(page.getByRole('heading',{name:'Apollo sem conexão'})).toBeVisible();
    await info.attach('offline-public-notice',{body:await page.screenshot(),contentType:'image/png'});
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByLabel('Usuário',{exact:true})).toBeVisible();
  } finally { await context.close(); }
});
test('first ever opening without network has no installed application or fake sale UI',async({browser})=>{
  const context=await browser.newContext({ignoreHTTPSErrors:true,offline:true});
  try {
    const page=await context.newPage();
    let failed=false;
    try {await page.goto(base);} catch {failed=true;}
    expect(failed).toBe(true);
    expect(await context.serviceWorkers()).toHaveLength(0);
  } finally {await context.close();}
});
