import { expect, test } from "@playwright/test";

const base = process.env.APOLLO_E2E_BASE_URL || "https://127.0.0.1:8001";
const side = process.env.APOLLO_P647_SIDE;
test.skip(side !== "p646" && side !== "p647", "Executar somente na comparação com banco descartável.");

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
  async function capture(name: string) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${side}-${name}.png`), animations: "disabled" });
  }

  await post("/cash/open", { opening_amount: 50 });
  await post("/cash/movement", { type: "suprimento", amount: 10, note: "Conferência visual fictícia", client_ref: crypto.randomUUID() });
  const table = await post("/tables/p40table401/open", { people: 2, customer_name: "Cliente fictício" });
  await post("/tables/p40table401/items", {
    order_id: table.order_id,
    client_ref: crypto.randomUUID(),
    items: [{ product_id: "p40product", qty: 2 }, { product_id: "p41drink", qty: 1 }, { product_id: "p41portion", qty: 1 }],
  });
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

  if (side === "p647") {
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
  await capture("compras");
});
