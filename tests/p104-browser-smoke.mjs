// Final exported image only, loopback TLS alias; credentials arrive on stdin.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
const owner=JSON.parse(fs.readFileSync(0,'utf8'));
const output=process.env.P104_BROWSER_EVIDENCE;
if(process.env.GITHUB_ACTIONS!=='true'||!output)throw new Error('Disposable CI only');
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({args:['--host-resolver-rules=MAP homolog.apollo-pdv.com 127.0.0.1','--no-proxy-server']});
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:768}});
 const page=await context.newPage();
 await page.goto('https://homolog.apollo-pdv.com/login');
 await page.getByLabel('Usuário',{exact:true}).fill(owner.username);
 await page.getByLabel('Senha',{exact:true}).fill(owner.password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByTestId('page-title').waitFor();
 if(!(await page.getByTestId('demo-notice').innerText()).includes('HOMOLOGAÇÃO'))throw new Error('Environment banner missing');
 await page.reload();
 if((await page.evaluate(async()=> (await fetch('/api/auth/me')).status))!==200)throw new Error('Session lost on reload');
 await page.goto('https://homolog.apollo-pdv.com/produtos');
 await page.getByText('Fictício produto',{exact:true}).first().waitFor();
 await page.screenshot({path:path.join(output,'final-image-products.png'),fullPage:true});
 await page.goto('https://homolog.apollo-pdv.com/pdv');await page.getByRole('button',{name:/Fictício produto/}).first().waitFor().catch(async()=>{await page.getByText('Fictício produto',{exact:true}).first().waitFor();});
 await page.screenshot({path:path.join(output,'final-image-pdv.png'),fullPage:true});
 const logout=await page.evaluate(async()=> (await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status);
 if(logout!==200||(await page.evaluate(async()=> (await fetch('/api/auth/me')).status))!==401)throw new Error('Logout failed');
 fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify({verdict:'PASS',final_exported_image:true,origin_mapped_to_loopback:true,login:true,session_reload:true,product_ui:true,pdv_ui:true,logout:true,browser_cert_exception:'lab self-signed only; HTTP preflight verifies CA',vps_tested:false},null,2));
}catch(error){console.error('P104 browser smoke failed: '+error.name);process.exitCode=1;}finally{await browser.close();}
