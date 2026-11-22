import {test,expect} from '@playwright/test';
const base = process.env.APOLLO_E2E_BASE_URL || 'https://127.0.0.1:8001';
test('manifest, static application cache and emulated offline boundary',async({page,context}, info)=>{
 await page.goto(base);
 const manifest=await page.evaluate(async()=>{
   const link=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
   if(!link) throw new Error('Missing manifest');
   const response=await fetch(link.href);
   if(!response.ok) throw new Error('Manifest HTTP failure');
   return response.json();
 });
 expect(manifest.name).toBeTruthy();
 expect(manifest.start_url).toBeTruthy();
 expect(manifest.display).toBe('standalone');
 expect(manifest.icons.length).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:20000}).toBe(true);
 const paths=await page.evaluate(async()=>{
   const entries:string[]=[];
   for(const key of await caches.keys())
     for(const request of await (await caches.open(key)).keys()) entries.push(new URL(request.url).pathname);
   return entries.sort();
 });
 expect(paths).toEqual(expect.arrayContaining(['/index.html','/manifest.webmanifest','/offline.html']));
 expect(paths.some(path => path.endsWith('.js'))).toBe(true);
 expect(paths.filter(path => !path.startsWith('/assets/'))).toEqual([
   '/apple-touch-icon.png', '/index.html', '/manifest.webmanifest', '/offline.html',
 ]);
 await context.setOffline(true);
 const navigation = await page.goto(base + '/pdv');
 await info.attach('emulation', { body: JSON.stringify({
   browser: info.project.use.browserName, online: await page.evaluate(() => navigator.onLine),
   status: navigation?.status(), fallback: await navigation?.headerValue('x-apollo-offline-fallback'),
 }), contentType: 'application/json' });
 expect(await navigation?.headerValue('x-apollo-offline-fallback')).toBe('shell');
 await expect(page.getByLabel('Usuário',{exact:true})).toBeVisible();
 expect(await page.evaluate(async () => {
   try { await fetch('/api/auth/me', { cache: 'no-store' }); return true; } catch { return false; }
 })).toBe(false);
 const reloaded = await page.reload();
 expect(await reloaded?.headerValue('x-apollo-offline-fallback')).toBe('shell');
 await context.setOffline(false);
 const restored = await page.reload();
 expect(await restored?.headerValue('x-apollo-offline-fallback')).toBeNull();
 await expect(page.getByLabel('Usuário',{exact:true})).toBeVisible();
});
