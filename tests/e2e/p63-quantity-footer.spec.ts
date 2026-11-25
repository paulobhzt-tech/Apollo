import { expect, test } from '@playwright/test';

const base = process.env.APOLLO_E2E_BASE_URL || 'https://127.0.0.1:8001';

test('accepts typed whole quantities and keeps table payment in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('apollo-display-zoom', '150'));
  await page.goto(base);
  await page.getByLabel('Usuário', { exact: true }).fill('p40admin');
  await page.getByLabel('Senha', { exact: true }).fill('P40-Fictitious-Password!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
  await page.goto(base + '/mesas');
  await page.getByTestId('table-card-401').click();
  const open = page.getByTestId('open-table-button');
  if (await open.isVisible()) await open.click();

  await expect(page.getByTestId('table-order-total')).toBeInViewport();
  await expect(page.getByTestId('close-table-button')).toBeInViewport();
  await page.getByTestId('add-items-button').click();
  await page.getByTestId('product-card-p40product').click();

  const quantity = page.getByRole('textbox', { name: 'Quantidade em un' });
  await quantity.fill('50');
  await quantity.press('Enter');
  await expect(quantity).toHaveValue('50');
  await quantity.fill('1,5');
  await quantity.press('Enter');
  await expect(quantity).toHaveValue('50');
  await expect(page.getByTestId('table-order-total')).toBeInViewport();
  await expect(page.getByTestId('close-table-button')).toBeInViewport();
  await page.getByTestId('send-to-kitchen-button').click();
  await expect(page.getByTestId('waiter-review-dialog')).toContainText('50 × Espetinho P40');
});
