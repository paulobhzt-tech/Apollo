import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
const evidence = process.env.MESAS_EVIDENCE_DIR || path.resolve('../docs/web/mesas-layout-2026-11-17/evidence');
const longName = 'FICTÍCIO Espetinho especial com acompanhamentos e observação sem espaços ' + 'NomeMuitoLongo'.repeat(7);
const customer = 'FICTÍCIO Cliente ' + 'SobrenomeSemEspacos'.repeat(3);
const items = Array.from({ length: 12 }, (_, i) => ({ id: `item-${i}`, product_id: `product-${i}`, name: `${longName} ${i + 1}`,
  qty: 1, unit_price: 99123.45, options: ['FICTÍCIO adicional ' + 'Acompanhamento'.repeat(5)],
  notes: 'FICTÍCIO observação ' + 'SemSal'.repeat(14), cancelled: false, customer_name: customer, ordered_by: 'Operador fictício' }));
const total = Math.round(items.reduce((s, x) => s + x.qty * x.unit_price, 0) * 100) / 100;
const table = { id: 'fixture-table', number: 1, kind: 'mesa', name: 'FICTÍCIO Varanda ' + 'MesaSemEspacos'.repeat(4),
  status: 'ocupada', order_id: 'fixture-order', seats: 4, people: 2, total, customer_name: customer,
  customers: [customer], waiter_name: 'FICTÍCIO Garçom ' + 'Atendimento'.repeat(4), opened_at: '2026-01-01T12:00:00Z' };
const available = { ...table, id: 'fixture-free', number: 2, name: 'FICTÍCIO Destino ' + 'Comprido'.repeat(8), status: 'livre', order_id: null, total: 0 };
async function fixture(page: Page, role = 'caixa') {
  const mutations: string[] = [];
  await page.clock.setFixedTime(new Date('2026-01-01T12:30:00Z'));
  await page.route('**/api/**', async route => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      mutations.push(`${request.method()} ${pathname}`);
      await route.fulfill({ status: 405, contentType: 'application/json', body: '{"detail":"Read-only synthetic fixture"}' }); return;
    }
    const data: Record<string, unknown> = {
      '/api/auth/me': { id: 'fixture-operator', name: 'Operador fictício', role, active: true },
      '/api/demo-status': { demo: true }, '/api/branding': { trade_name: 'Apollo · FICTÍCIO' },
      '/api/tables': [table, available], '/api/tables/fixture-table/order': { id: 'fixture-order', items, subtotal: total, total, payments: [] },
      '/api/products': [{ id: 'fixture-product', code: 'FIXTURE', name: longName, price: 99123.45, active: true, options: [] }],
      '/api/categories': [{ id: 'category', name: 'FICTÍCIO Categoria ' + 'Longa'.repeat(16) }],
      '/api/settings': { pix_key: '', address: '' },
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data[pathname] ?? []) });
  });
  await page.goto('/mesas');
  await page.evaluate(() => document.fonts.ready);
  const opener = page.getByTestId('table-card-1');
  await opener.focus(); await page.keyboard.press('Enter');
  const panel = page.getByTestId('table-sheet');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('grouped-line')).toHaveCount(items.length);
  await panel.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
  return { mutations, panel, opener };
}
async function geometry(panel: Locator) {
  return panel.evaluate(el => {
    const p = el.getBoundingClientRect();
    const overflowing = [...el.querySelectorAll<HTMLElement>('button,input,select,p,span,[data-testid="grouped-line"]')]
      .filter(n => n.getClientRects().length && getComputedStyle(n).position !== 'absolute')
      // Base UI select exposes a clipped, fixed 1px form input at (0,0), outside the popup.
      .filter(n => !(n.matches('input[aria-hidden=true]') && getComputedStyle(n).clipPath !== 'none' && n.getBoundingClientRect().width <= 1))
      .filter(n => { const r=n.getBoundingClientRect(); return r.left < p.left - 1 || r.right > p.right + 1 || (!n.matches('input,select,[data-slot=checkbox],[data-slot=checkbox-indicator]') && n.scrollWidth > n.clientWidth + 2); })
      .map(n => ({ id: n.dataset.testid || n.getAttribute('aria-label') || n.tagName, text: n.textContent?.slice(0, 60), width: n.getBoundingClientRect().width, scrollWidth: n.scrollWidth, clientWidth: n.clientWidth })).slice(0, 30);
    const controls = [...el.querySelectorAll<HTMLElement>('button,input:not([type=hidden]),select,[role=combobox]')].filter(n => {
      const r = n.getBoundingClientRect();
      if (getComputedStyle(n).position === 'absolute' && r.width <= 1) return false;
      if (!r.width || !r.height || r.top < p.top || r.bottom > p.bottom) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (n.contains(hit) || n.parentElement?.contains(hit));
    });
    const overlappingControls: string[] = [];
    for (let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) {
      const a=controls[i],b=controls[j];if(a.contains(b)||b.contains(a))continue;
      const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
      if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1 && Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)
        overlappingControls.push(`${a.dataset.testid||a.tagName}/${b.dataset.testid||b.tagName}`);
    }
    return { overlappingControls, viewport: innerWidth, panelWidth: p.width, panelScrollWidth: el.scrollWidth, panelClientWidth: el.clientWidth,
      pageWidth: document.documentElement.scrollWidth, overflowing };
  });
}

test('panel geometry, long text, money and all main actions', async ({ page }, info) => {
  const { mutations, panel } = await fixture(page);
  const before = process.env.MESAS_CAPTURE === 'before';
  const metrics = await geometry(panel);
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, `${before ? 'before' : 'after'}-${info.project.name}.json`), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: path.join(evidence, `${before ? 'before' : 'after'}-${info.project.name}.png`), animations: 'disabled' });
  if (before) { expect(metrics.overflowing.length).toBeGreaterThan(0); return; }
  expect(metrics.pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(metrics.panelScrollWidth).toBeLessThanOrEqual(metrics.panelClientWidth + 1);
  expect(metrics.overflowing).toEqual([]);
  expect(metrics.overlappingControls).toEqual([]);
  await expect(page.getByTestId('table-order-total')).toHaveText(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total));
  await expect(page.getByTestId('close-table-button')).toBeInViewport();
  await expect(panel.locator('[data-slot="sheet-close"]')).toBeInViewport();
  await expect(panel).toHaveScreenshot(`panel-${info.project.name}.png`);
  await page.getByTestId('table-toggle-status-button').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('table-cancel-button')).toBeInViewport();
  await expect(page.getByTestId('close-table-button')).toBeInViewport();
  await expect(panel.locator('[data-slot="sheet-close"]')).toBeInViewport();
  await page.screenshot({ path: path.join(evidence, `after-bottom-${info.project.name}.png`), animations: 'disabled' });
  expect(mutations).toEqual([]);
});

test('keyboard trap, close/return focus and nested actions without writes', async ({ page }) => {
  test.skip(process.env.MESAS_CAPTURE === 'before', 'baseline capture only');
  const { panel, mutations, opener } = await fixture(page);
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab');
    await expect.poll(() => panel.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.getByTestId('close-table-button').focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('payment-dialog')).toBeVisible();
  expect((await geometry(page.getByTestId('payment-dialog'))).overflowing).toEqual([]);
  await page.keyboard.press('Escape'); await expect(page.getByTestId('payment-dialog')).toBeHidden();
  await expect(page.getByTestId('close-table-button')).toBeFocused();
  await page.getByTestId('request-bill-button').click();
  await expect(page.getByTestId('prebill-dialog')).toBeVisible();
  expect((await geometry(page.getByTestId('prebill-dialog'))).overflowing).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Dividir conta por itens', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Divisão da conta por itens' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Divisão da conta por itens' })).toBeHidden();
  await expect(panel).toBeVisible();
  await page.getByTestId('table-qr-button').click();
  await expect(page.getByTestId('qr-dialog')).toBeVisible();
  expect((await geometry(page.getByTestId('qr-dialog'))).overflowing).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('qr-dialog')).toBeHidden();
  await expect(panel).toBeVisible();
  await page.getByTestId('toggle-group-items').click();
  expect((await geometry(panel)).overflowing).toEqual([]);
  await page.getByTestId('transfer-select').click();
  await page.getByRole('option', { name: /FICTÍCIO Destino/ }).click();
  await expect(page.getByTestId('transfer-button')).toBeEnabled();
  expect((await geometry(panel)).overflowing).toEqual([]);
  await page.getByTestId('add-items-button').click();
  await page.getByTestId('product-card-FIXTURE').click();
  await expect(page.getByTestId('pending-line-0')).toBeVisible();
  expect((await geometry(panel)).overflowing).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(opener).toBeFocused();
  expect(mutations).toEqual([]);
});

test('waiter cannot close the bill', async ({ page }) => {
  test.skip(process.env.MESAS_CAPTURE === 'before', 'baseline capture only');
  const { mutations } = await fixture(page, 'garcom');
  await expect(page.getByTestId('close-table-button')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Dividir conta por itens', exact: true })).toBeHidden();
  expect(mutations).toEqual([]);
});


test('accessibility audit of order panel and nested controls', async ({ page }, info) => {
  test.skip(process.env.MESAS_CAPTURE === 'before', 'candidate accessibility audit');
  const { panel, mutations } = await fixture(page);
  const audits: { state: string; violations: unknown[]; incomplete: unknown[] }[] = [];
  async function audit(state: string, scope: Locator) {
    await expect(scope).toBeVisible();
    await scope.evaluate(el => el.setAttribute('data-review-scope', 'true'));
    const result = await new AxeBuilder({ page }).include('[data-review-scope="true"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    audits.push({ state, violations: result.violations, incomplete: result.incomplete });
    await scope.evaluate(el => el.removeAttribute('data-review-scope'));
  }
  await audit('panel', panel);
  await page.getByTestId('add-items-button').click();
  await page.getByTestId('product-card-FIXTURE').click();
  await audit('pending-product', panel);
  await page.getByTestId('close-table-button').click();
  await audit('payment', page.getByTestId('payment-dialog'));
  await page.keyboard.press('Escape');
  await page.getByTestId('request-bill-button').click();
  await audit('prebill', page.getByTestId('prebill-dialog'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Dividir conta por itens', exact: true }).click();
  const partial = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Divisão da conta por itens', exact: true }) });
  await audit('partial', partial);
  await page.keyboard.press('Escape');
  await page.getByTestId('table-qr-button').click();
  await audit('qr', page.getByTestId('qr-dialog'));
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, `accessibility-${info.project.name}.json`), JSON.stringify(audits, null, 2));
  expect(mutations).toEqual([]);
  expect(audits.flatMap(a => a.violations.map(v => ({ state: a.state, violation: v })))).toEqual([]);
});
