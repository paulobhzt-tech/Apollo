import { test, expect, type Page } from '@playwright/test';

async function fakeApi(page: Page, role = 'caixa', authenticated = true) {
  const calls: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    const data: Record<string, unknown> = {
      '/api/auth/me': { id: 'synthetic-operator', name: 'Operador fictício', role, active: true },
      '/api/demo-status': { demo: true }, '/api/branding': { trade_name: 'Apollo · Homologação', logo_url: '' },
      '/api/auth/profiles': [], '/api/products': [], '/api/categories': [],
    };
    await route.fulfill({ status: !authenticated && path === '/api/auth/me' ? 401 : 200,
      contentType: 'application/json', body: JSON.stringify(data[path] ?? []) });
  });
  return calls;
}

test('login responsive, keyboard skip link, no password persistence', async ({ page }) => {
  await fakeApi(page, 'caixa', false);
  await page.goto('/login');
  await expect(page.getByTestId('login-brand')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByText('Ir para o conteúdo')).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeDisabled();
  await page.getByLabel('Senha', {exact:true}).fill('synthetic-unsaved-password');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('synthetic-unsaved-password');
  await page.screenshot({path:`test-results/p5/login-${test.info().project.name}.png`,fullPage:true});
});

test('unauthenticated direct route never mounts protected module', async ({page}) => {
  const calls = await fakeApi(page, 'caixa', false);
  await page.goto('/produtos');
  await expect(page.getByRole('alert')).toContainText('validar sua sessão');
  expect(calls).not.toContain('/api/products');
});

test('cashier direct admin URL does not fetch admin data', async ({page}) => {
  const calls = await fakeApi(page);
  await page.goto('/produtos');
  await expect(page.getByRole('heading', {name:'Acesso restrito'})).toBeVisible();
  expect(calls).not.toContain('/api/products');
  await page.reload();
  await expect(page.getByRole('heading', {name:'Acesso restrito'})).toBeVisible();
});

test('PDV navigation, logout visible, web contingency unavailable', async ({page}) => {
  await fakeApi(page);
  await page.goto('/pdv');
  await expect(page.getByTestId('page-title')).toHaveText('Frente de Caixa');
  await expect(page.getByRole('button', {name:'Trocar operador',exact:true}).first()).toBeVisible();
  await expect(page.getByTestId('offline-toggle')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({path:`test-results/p5/pdv-${test.info().project.name}.png`,fullPage:true});
});
