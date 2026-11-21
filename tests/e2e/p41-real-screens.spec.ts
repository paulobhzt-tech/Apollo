import {test,expect} from '@playwright/test';

test('real admin screens render without browser exceptions or server errors', async ({browser},info)=>{
  test.setTimeout(240000);
  const context = await browser.newContext({...info.project.use,baseURL:'https://127.0.0.1:8001',ignoreHTTPSErrors:true});
  const page = await context.newPage();
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.url().includes('/api/') && response.status()>=500)errors.push(response.status()+' '+new URL(response.url()).pathname);});
  const results:unknown[]=[];
  try {
    await page.goto('https://127.0.0.1:8001');
    await page.getByLabel('Usuário',{exact:true}).fill('p40admin');
    await page.getByLabel('Senha',{exact:true}).fill('P40-Fictitious-Password!');
    const login = page.waitForResponse(r=>r.url().endsWith('/api/auth/login') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    expect((await login).status()).toBe(200);
    await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
    const routes=['/','/pdv','/mesas','/comanda-mobile','/cozinha','/impressao','/delivery','/caixa',
      '/vendas','/fiado','/notas','/produtos','/estoque','/clientes','/contas-pagar','/contas-receber',
      '/categorias-contas','/formas-pagamento','/financeiro','/musica-ao-vivo','/funcionarios','/qrcodes','/auditoria','/config','/admin-mobile','/apollo-ia'];
    for(const [index,route] of routes.entries()){
      const before = errors.length;
      await page.goto('https://127.0.0.1:8001'+route);
      await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
      await page.waitForTimeout(150);
      const label = String(index).padStart(2,'0')+'-'+(route.replaceAll('/','')||'painel');
      await info.attach(label,{body:await page.screenshot(),contentType:'image/png'});
      const overflow = await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
      results.push({route,overflow,errors:errors.slice(before)});
    }
    await info.attach('real-screen-matrix',{body:JSON.stringify(results,null,2),contentType:'application/json'});
    expect(results.filter((x:any)=>x.overflow),'Routes with horizontal overflow').toEqual([]);
    expect(errors,'Uncaught browser errors or backend 5xx').toEqual([]);
  }finally{await context.close();}
});
