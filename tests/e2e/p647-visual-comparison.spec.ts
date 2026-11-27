import { expect, test } from "@playwright/test";

const base = process.env.APOLLO_E2E_BASE_URL || "https://127.0.0.1:8001";
const side = process.env.APOLLO_P647_SIDE;
test.skip(!["p646", "p647", "p648", "p649"].includes(side ?? ""), "Executar somente na comparação com banco descartável.");

test("captures the same populated screens in each version", async ({ page }, info) => {
  test.setTimeout(120_000);
  expect(new URL(base).hostname).toBe("127.0.0.1");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(base + "/login");
  if (side === "p649") {
    const login = page.getByTestId("pin-panel");
    await expect(login).toBeVisible();
    expect(await login.evaluate((element) => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
    await page.screenshot({ path: info.outputPath("p649-login.png"), animations: "disabled" });
  }
  await page.getByLabel("Usuário", { exact: true }).fill("p40admin");
  await page.getByLabel("Senha", { exact: true }).fill("P40-Fictitious-Password!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByTestId("apollo-ribbon")).toBeVisible();

  async function post(path: string, data: object) {
    const response = await page.request.post(base + "/api" + path, { headers: { Origin: base }, data });
    expect(response.ok(), `${path}: ${response.status()}`).toBe(true);
    return response.json();
  }
  async function capture(name: string, fullPage = false) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${side}-${name}.png`), animations: "disabled", fullPage });
  }

  await post("/cash/open", { opening_amount: 50 });
  await post("/cash/movement", { type: "suprimento", amount: 10, note: "Conferência visual fictícia", client_ref: crypto.randomUUID() });
  const table = await post("/tables/p40table401/open", { people: 2, customer_name: "Cliente fictício" });
  await post("/tables/p40table401/items", {
    order_id: table.order_id,
    client_ref: crypto.randomUUID(),
    items: [{ product_id: "p40product", qty: 2 }, { product_id: "p41drink", qty: 1 }, { product_id: "p41portion", qty: 1 }],
  });
  await post("/pdv/sale", {
    client_ref: crypto.randomUUID(),
    items: [{ product_id: "p40product", qty: 1 }],
    payments: [{ method: "dinheiro", amount: 5 }, { method: "pix", amount: 5 }],
    emit_invoice: false,
  });
  await page.goto(base + "/");
  await expect(page.getByTestId("stat-revenue")).toContainText("10,00");
  await expect(page.getByTestId("daily-goal-value")).toBeVisible();
  await expect(page.getByTestId("executive-metric-1")).toBeVisible();
  await capture("painel-gerencial", true);
  await page.goto(base + "/mesas");
  await expect(page.getByTestId("table-card-401")).toBeVisible();
  await capture("mesas");
  await page.getByTestId("table-card-401").click();
  await expect(page.getByTestId("table-order-total")).toContainText("40,00");
  await page.getByTestId("add-items-button").click();
  await expect(page.getByTestId("product-card-p40product")).toBeVisible();
  await capture("atendimento");
  await page.getByTestId("close-table-button").click();
  const popup = page.getByTestId("payment-dialog");
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: /^R\$\s*10,00$/ }).click();
  await popup.getByTestId("payment-add-button").click();
  await popup.getByTestId("payment-method-credito").click();
  await popup.getByTestId("card-brand-visa").click();
  await popup.getByTestId("payment-add-button").click();
  await expect(popup.getByTestId("payment-confirm-button")).toBeEnabled();
  await capture("pagamento-misto");
  await popup.getByRole("button", { name: "Cancelar", exact: true }).click();

  if (side !== "p646") {
    await page.getByRole("button", { name: "Mais opções" }).click();
    if (side === "p649") {
      const options = page.getByTestId("table-more-options");
      await expect(options).toBeInViewport({ ratio: 1 });
      expect(await options.evaluate((element) => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
      await capture("mais-opcoes");
    }
    await page.getByRole("menuitem", { name: "Dividir por cliente ou itens" }).click();
  } else {
    await page.getByRole("button", { name: "Dividir por cliente ou itens" }).click();
  }
  const split = page.getByRole("dialog", { name: "Divisão da conta por itens" });
  await split.getByRole("spinbutton").first().fill("1");
  await split.getByRole("button", { name: "Calcular divisão" }).click();
  await expect(split.getByRole("button", { name: "Receber itens selecionados" })).toBeVisible();
  await capture("divisao");
  await split.getByRole("button", { name: "Fechar", exact: true }).click();

  await page.goto(base + "/pdv");
  await page.getByTestId("product-card-p40product").click();
  await expect(page.getByTestId("pdv-subtotal")).toContainText("10,00");
  await capture("balcao");
  await page.goto(base + "/caixa");
  await expect(page.getByRole("table", { name: "Movimentações manuais do turno" })).toContainText("Conferência visual fictícia");
  await capture("caixa");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/(?:^| )light(?: |$)/);
  await capture("caixa-claro");
  await page.goto(base + "/estoque");
  await expect(page.getByTestId("ingredient-row-p40ing")).toBeVisible();
  await capture("estoque");
  await page.getByTestId("tab-compras").click();
  await expect(page.getByRole("heading", { name: "Registrar compra" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Fornecedor fictício" })).toHaveCount(3);
  await capture("compras");
  await page.goto(base + "/cozinha");
  await expect(page.getByTestId("kds-column-novo").getByText("Espetinho P40", { exact: true }).first()).toBeVisible();
  await capture("kds");
  await page.goto(base + "/financeiro");
  await expect(page.getByTestId("dre-gross")).toContainText("10,00");
  await capture("financeiro");
  await page.goto(base + "/config");
  await expect(page.getByTestId("config-tab-printers")).toBeVisible();
  await capture("configuracoes");
  if (side === "p649") {
    const printer = await post("/printers", { name: "Impressora fictícia", device_name: "Fila de laboratório", active: false });
    await page.reload();
    const row = page.getByTestId(`printer-card-${printer.id}`);
    await expect(row).toContainText("Fila de laboratório");
    await row.getByRole("button", { name: "Editar" }).click();
    const printerDialog = page.getByTestId("printer-dialog");
    await expect(printerDialog).toBeVisible();
    await printerDialog.getByRole("button", { name: "Fechar", exact: true }).click();
    await capture("configuracoes-impressoras");

    await page.goto(base + "/produtos");
    const search = page.getByTestId("products-search");
    await search.fill("Espetinho P40");
    const product = page.getByRole("row").filter({ hasText: "Espetinho P40" });
    await expect(product).toBeVisible();
    await product.getByRole("checkbox").check();
    await expect(product).toHaveAttribute("data-state", "selected");
    await capture("produtos-selecao");
    await page.setViewportSize({ width: 1024, height: 640 });
    await capture("produtos-1024");
    await page.goto(base + "/vendas");
    await page.getByTestId("history-search-input").fill("Espetinho P40");
    await expect(page.getByRole("row").filter({ hasText: "Espetinho P40" }).first()).toBeVisible();
    await capture("historico-vendas");

    await page.setViewportSize({ width: 1024, height: 640 });
    const newTable = await post("/tables", { number: 6491 });
    const attending = await post(`/tables/${newTable.id}/open`, { people: 2 });
    await post(`/tables/${newTable.id}/items`, {
      order_id: attending.order_id, client_ref: crypto.randomUUID(),
      items: [{ product_id: "p40product", qty: 1 }],
    });
    await page.goto(base + "/mesas");
    await page.getByTestId("table-card-6491").click();
    const openOptions = async () => {
      await page.getByRole("button", { name: "Mais opções" }).click();
      await page.getByRole("menuitem", { name: "Receber por valor ou percentual" }).click();
    };
    const acceptInstallment = async () => {
      await page.getByRole("button", { name: "Receber parcela", exact: true }).click();
      await page.getByTestId("payment-add-button").click();
      await page.getByRole("button", { name: "Registrar parcela", exact: true }).click();
      await expect(page.getByTestId("payment-dialog")).toBeHidden();
    };
    await openOptions();
    await page.getByLabel("Forma de cálculo").selectOption("percentage");
    await page.getByLabel("Percentual (%)", { exact: true }).fill("25");
    await capture("parcela-percentual");
    await acceptInstallment();
    await expect(page.getByTestId("table-remaining-balance")).toContainText("7,50");

    await openOptions();
    await page.getByLabel("Valor (R$)", { exact: true }).fill("1,50");
    await capture("parcela-valor-livre");
    await acceptInstallment();
    await expect(page.getByTestId("table-remaining-balance")).toContainText("6,00");
    await page.getByTestId("close-table-button").click();
    await expect(page.getByTestId("payment-remaining")).toContainText("7,00");
    await capture("fechamento-com-parcelas");
    await page.getByTestId("payment-add-button").click();
    const settled = page.waitForResponse((response) =>
      response.url().endsWith(`/api/tables/${newTable.id}/pay`) && response.request().method() === "POST");
    await page.getByTestId("payment-confirm-button").click();
    const settlement = await settled;
    expect(settlement.ok()).toBe(true);
    expect((await settlement.json()).order).toMatchObject({ total: 11, advance_paid: 4, change: 0 });
    const register = await page.request.get(base + "/api/cash/current");
    expect((await register.json()).expected_cash).toBe(76);

    await page.goto(base + `/auditoria?registro=${attending.order_id}`);
    const audited = page.getByRole("row").filter({ hasText: "Parcela por valor" });
    await expect(audited).toHaveCount(2);
    await audited.first().getByText("Ver detalhes", { exact: true }).click();
    await expect(audited.first()).toContainText("Saldo:");
    await capture("auditoria-parcelas");

    const person = await post("/customers", { name: "Pessoa fictícia P64.9" });
    await page.goto(base + "/clientes");
    await page.getByTestId("customer-search-input").fill("Pessoa fictícia P64.9");
    await expect(page.getByTestId(`customer-row-${person.id}`)).toBeVisible();
    await capture("clientes-lista");
    await page.getByTestId(`customer-edit-${person.id}`).click();
    await expect(page.getByTestId("customer-dialog")).toBeVisible();
    await capture("cliente-edicao");
    await page.goto(base + "/fornecedores");
    await page.getByTestId("supplier-search-input").fill("Fornecedor fictício");
    await expect(page.getByTestId("supplier-row-p40supplier")).toBeVisible();
    await capture("fornecedores-busca");
  }
});
