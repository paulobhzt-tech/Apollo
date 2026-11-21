import {test,expect} from '@playwright/test';
test('P47 manifest, real service worker and public offline boundary',async({page,context})=>{
 await page.goto('https://127.0.0.1:8001');
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
 expect(paths).toEqual(['/manifest.webmanifest','/offline.html']);
 await context.setOffline(true);
 await page.goto('https://127.0.0.1:8001/pdv');
 await expect(page.getByRole('heading',{name:'Apollo sem conexão'})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Apollo sem conexão'})).toBeVisible();
 await context.setOffline(false);
 await page.reload();
 await expect(page.getByLabel('Usuário',{exact:true})).toBeVisible();
});
