import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const base = process.env.APOLLO_E2E_BASE_URL || 'https://127.0.0.1:8001';

test('links a registered customer and moves and copies selected items without duplicate stock movements', async ({ page }, info) => {
  await page.goto(base);
  await page.getByLabel('Usuário', { exact: true }).fill('p40admin');
  await page.getByLabel('Senha', { exact: true }).fill('P40-Fictitious-Password!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('apollo-ribbon')).toBeVisible();

  async function post(path: string, data: object) {
    const response = await page.request.post(base + '/api' + path, { data, headers: { Origin: base } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  async function read(path: string) {
    const response = await page.request.get(base + '/api' + path);
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }

  const customerName = 'Cliente P63 ' + randomUUID();
  const customer = await post('/customers', { name: customerName });
  const origin = await post('/tables', { number: 9631, kind: 'mesa' });
  const destination = await post('/tables', { number: 9632, kind: 'comanda' });
  const source = await post('/tables/' + origin.id + '/open', {});
  const target = await post('/tables/' + destination.id + '/open', {});
  const order = await post('/tables/' + origin.id + '/items', {
    order_id: source.order_id,
    items: [
      { product_id: 'p40product', qty: 2 },
      { product_id: 'p41drink', qty: 1 },
    ],
  });
  const originalStock = (await read('/ingredients')).find((row: { id: string }) => row.id === 'p40ing').stock;

  await page.goto(base + '/mesas');
  await page.getByTestId('table-card-9631').click();
  const more = page.getByRole('button', { name: 'Mais opções', exact: true });
  await more.click();
  await page.getByRole('menuitem', { name: 'Vincular cliente cadastrado' }).click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill(customerName);
  await page.getByRole('radio', { name: customerName }).check();
  await page.getByRole('button', { name: 'Vincular ao atendimento' }).click();
  await expect(page.getByTestId('table-registered-customer-dialog')).toBeHidden();
  expect((await read('/tables/' + origin.id + '/order')).registered_customer_id).toBe(customer.id);

  for (const operation of ['copy', 'transfer'] as const) {
    await more.click();
    await page.getByRole('menuitem', {
      name: operation === 'copy' ? 'Copiar parte do pedido' : 'Transferir itens selecionados',
    }).click();
    const dialog = page.getByTestId('table-selected-items-dialog');
    await dialog.getByLabel('Atendimento de destino').selectOption(destination.id);
    await dialog.getByRole('checkbox', { name: /Espetinho P40/ }).check();
    await dialog.screenshot({ path: info.outputPath(operation + '.png') });
    const sent = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/selected-items'));
    await dialog.getByRole('button', { name: operation === 'copy' ? 'Confirmar cópia' : 'Confirmar transferência' }).click();
    const payload = (await sent).postDataJSON();
    expect(payload.target_order_id).toBe(target.order_id);
    await expect(dialog).toBeHidden();
    await post('/tables/' + origin.id + '/selected-items', payload);
    const conflict = await page.request.post(base + '/api/tables/' + origin.id + '/selected-items', {
      headers: { Origin: base }, data: { ...payload, item_quantities: { [order.items[1].id]: 1 } },
    });
    expect(conflict.status()).toBe(409);
  }

  const from = await read('/tables/' + origin.id + '/order');
  const to = await read('/tables/' + destination.id + '/order');
  expect(from.items.map((item: { id: string }) => item.id)).toEqual([order.items[1].id]);
  expect(to.items).toHaveLength(2);
  expect(to.items[1].id).toBe(order.items[0].id);
  expect(to.items[0].stock_ref).not.toBe(to.items[1].stock_ref);
  expect(to.total).toBe(40);
  expect(to.audit_events.map((event: { action: string }) => event.action)).toEqual(
    expect.arrayContaining(['table_items_copied', 'table_items_transferred']),
  );
  expect((await read('/ingredients')).find((row: { id: string }) => row.id === 'p40ing').stock).toBe(originalStock - 2);
  expect(await read('/tables/' + origin.id + '/item-progress')).not.toHaveProperty(order.items[0].id);
  expect(await read('/tables/' + destination.id + '/item-progress')).toHaveProperty(order.items[0].id, 'novo');
});
