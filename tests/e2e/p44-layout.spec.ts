import {test,expect} from '@playwright/test';
const base='https://127.0.0.1:8001';
for (const width of [1440,1024,390]) for (const zoom of [100,125,150]) {
  test('real screens width '+width+' with interface zoom '+zoom,async({browser},info)=>{
    test.setTimeout(120000);
    const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true});
    try {
      await context.addInitScript(value=>localStorage.setItem('apollo-display-zoom',String(value)),zoom);
      const page=await context.newPage();
      await page.goto(base);
      await page.getByLabel('Usuário',{exact:true}).fill('p40admin');
      await page.getByLabel('Senha',{exact:true}).fill('P40-Fictitious-Password!');
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
      for(const route of ['/pdv','/mesas','/caixa','/estoque','/cozinha','/impressao']){
        await page.goto(base+route);
        await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
        await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
          {message:route+' overflow at '+width+' / '+zoom}).toBe(true);
      }
      await info.attach('layout-'+width+'-'+zoom,{body:await page.screenshot(),contentType:'image/png'});
    } finally {await context.close();}
  });
}
