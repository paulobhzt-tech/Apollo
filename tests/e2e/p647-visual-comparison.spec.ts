import { expect, test } from "@playwright/test";

const base = process.env.APOLLO_E2E_BASE_URL || "https://127.0.0.1:8001";
const side = process.env.APOLLO_P647_SIDE;
test.skip(!["p646", "p647", "p648"].includes(side ?? ""), "Executar somente na comparação com banco descartável.");

test("captures the same populated screens in each version", async ({ page }, info) => {
  test.setTimeout(120_000);
  expect(new URL(base).hostname).toBe("127.0.0.1");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(base + "/login");
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
  if (side === "p648") {
    for (const [width, height] of [[1024, 768], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await expect(page.getByTestId("close-table-button")).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Dividir conta", exact: true })).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.keyboard.press("F3");
    await expect(page.getByTestId("table-product-search")).toBeFocused();
  }
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
  if (side === "p648") {
    await popup.getByRole("button", { name: /^Consumo e ajustes/ }).click();
    await expect(popup.getByTestId("payment-line-0")).toContainText("Dinheiro");
    await expect(popup.getByTestId("payment-line-1")).toContainText("Visa");
    await expect(popup.getByTestId("payment-total")).toBeInViewport({ ratio: 1 });
    await capture("pagamento-conferencia");
  }
  await popup.getByRole("button", { name: "Cancelar", exact: true }).click();

  if (side !== "p646") {
    await page.getByRole("button", { name: "Mais opções" }).click();
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
});
