import { expect, test } from '@playwright/test';

const base = process.env.APOLLO_E2E_BASE_URL || 'https://127.0.0.1:8001';
const routes = [
  '', 'pdv', 'mesas', 'comanda-mobile', 'caixa', 'delivery', 'produtos', 'estoque',
  'fornecedores', 'clientes', 'funcionarios', 'financeiro', 'contas-pagar', 'contas-receber',
  'fiado', 'vendas', 'cozinha', 'qrcodes', 'config', 'impressao', 'apollo-ia', 'auditoria',
  'notas', 'admin-mobile', 'musica-ao-vivo', 'categorias-contas', 'formas-pagamento',
];

for (const theme of ['dark', 'light'] as const) {
  test(`audit the Apollo routes in ${theme} theme`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    async function capture(name: string) {
      await expect.poll(() => page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ), { message: `${name} overflows the viewport` }).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
    }

    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await page.goto(base + '/login');
    await expect(page.getByLabel('Usuário', { exact: true })).toBeVisible();
    await capture('login');
    await page.getByLabel('Usuário', { exact: true }).fill('p40admin');
    await page.getByLabel('Senha', { exact: true }).fill('P40-Fictitious-Password!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
    const html = page.locator('html');
    if (!(await html.evaluate((element, value) => element.classList.contains(value), theme))) {
      await page.getByTestId('theme-toggle').click();
    }

    for (const route of routes) {
      await test.step(route || 'painel', async () => {
        expect((await page.goto(base + '/' + route))?.ok()).toBe(true);
        await expect(page.getByTestId('apollo-ribbon')).toBeVisible();
        await expect(page).toHaveURL(base + '/' + route);
        await expect(html).toHaveClass(new RegExp(`(?:^| )${theme}(?: |$)`));
        await capture(route || 'painel');
      });
    }
    if (theme === 'dark') {
      if (["feat/p64-6-finalizacao-interface-homologacao-operacional", "feat/p64-7-reconstrucao-completa-interface-consumer"].includes(process.env.GITHUB_REF_NAME ?? "") && info.project.use.browserName === "chromium") {
        for (const [width, height] of [[1024, 768], [1280, 720], [1366, 768], [1440, 900], [1600, 900], [1920, 1080], [2560, 1440]]) {
          await page.setViewportSize({ width, height });
          for (const route of ["", "pdv", "mesas", "estoque", "caixa", "financeiro", "config?tab=backup"]) {
            await page.goto(base + "/" + route, { waitUntil: "domcontentloaded" });
            await expect(page.getByTestId("apollo-ribbon")).toBeVisible();
            await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
              { message: `${route || "painel"} ${width}×${height}` }).toBe(true);
          }
        }
        await capture("backup-desktop");
      }
      for (const width of [390, 768, 1366]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base + '/');
        await expect(page.getByTestId('stat-revenue')).toBeVisible();
        await expect(page.getByTestId('daily-goal-value')).toBeVisible();
        await capture(`painel-${width}`);

        await page.goto(base + '/caixa');
        const start = page.getByLabel('Fechados a partir de');
        const end = page.getByLabel('Fechados até');
        await expect(start).toBeVisible();
        await start.fill('2001-01-03');
        await end.fill('2001-01-02');
        await expect(page.getByRole('alert')).toContainText('A data inicial deve');
        await end.fill('2001-01-03');
        await expect(page.getByText('Nenhum turno encerrado no período.')).toBeVisible();
        await capture(`caixa-periodo-${width}`);

        await page.goto(base + '/financeiro');
        await page.getByRole('button', { name: 'Comparar anos' }).click();
        const annual = page.getByRole('table', { name: 'Comparação anual do DRE' });
        await expect(annual.getByRole('row')).toHaveCount(6);
        await capture(`dre-anual-${width}`);
      }
    }
    expect(errors).toEqual([]);
  });
}
