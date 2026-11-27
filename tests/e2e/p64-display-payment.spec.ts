import { expect, test } from "@playwright/test";

const base = process.env.APOLLO_E2E_BASE_URL || "https://127.0.0.1:8001";
const levels = [50, 60, 70, 80, 90, 100, 110, 125, 150, 175];
const sizes = [[800, 600], [1024, 768], [1280, 720], [1280, 800], [1366, 768], [1440, 900], [1600, 900], [1920, 1080], [2560, 1440]];

test("keeps payment totals and actions in the viewport across zoom settings", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.goto(base);
  await page.getByLabel("Usuário", { exact: true }).fill("p40admin");
  await page.getByLabel("Senha", { exact: true }).fill("P40-Fictitious-Password!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByTestId("apollo-ribbon")).toBeVisible();
  const open = await page.request.post(base + "/api/cash/open", {
    data: { opening_amount: 0, note: "P64 layout fixture" }, headers: { Origin: base },
  });
  // The existing visual suite can share this fictitious operator's open shift.
  expect([200, 400, 409]).toContain(open.status());
  await page.goto(base + "/pdv");
  await page.getByTestId("product-card-p40product").click();

  await page.getByTestId("display-controls-trigger").click();
  const zoom = page.getByLabel("Zoom da interface", { exact: true });
  const checkout = page.getByTestId("pdv-checkout-button");
  const popup = page.getByTestId("payment-dialog");
  const confirm = page.getByTestId("payment-confirm-button");

  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const level of levels) {
      await zoom.selectOption(String(level));
      await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--apollo-display-zoom"))).toBe(`${level}%`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
        `PDV ${width}×${height} / ${level}%`).toBe(true);
      // Opening the dialog exercises the portal and its fixed footer at the new root scale.
      await checkout.click();
      await expect(popup).toBeVisible();
      await expect(confirm).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId("payment-total")).toBeInViewport({ ratio: 1 });
      expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth + 2), `${width}×${height} / ${level}%`).toBe(true);
      if (width === 1366 && level === 100) {
        const methods = await popup.getByRole("navigation", { name: "Formas de pagamento" }).boundingBox();
        const summary = await popup.getByTestId("payment-footer").boundingBox();
        expect(methods).not.toBeNull();
        expect(summary).not.toBeNull();
        expect(summary!.x).toBeGreaterThan(methods!.x + methods!.width);
        expect(Math.abs(summary!.y - methods!.y)).toBeLessThan(25);
      }
      if ((width === 800 && level === 175) || (width === 1366 && level === 100)) {
        await popup.screenshot({ path: info.outputPath(`pagamento-${width}-${level}.png`) });
      }
      await popup.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(popup).toBeHidden();
    }
  }

  await page.getByRole("button", { name: "Ajustar zoom à tela" }).click();
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(zoom).toHaveValue("auto");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--apollo-display-zoom"))).toBe("75%");
  await page.getByLabel("Densidade da interface").selectOption("compact");
  await page.getByRole("button", { name: "Reduzir efeitos" }).click();
  await page.reload();
  await page.getByTestId("display-controls-trigger").click();
  await expect(zoom).toHaveValue("auto");
  await expect(page.getByLabel("Densidade da interface")).toHaveValue("compact");
  await expect(page.getByRole("button", { name: "Reduzir efeitos" })).toHaveAttribute("aria-pressed", "true");

  await checkout.click();
  const consumption = popup.getByRole("button", { name: "Consumo e ajustes" });
  const narrow = await consumption.isVisible();
  if (narrow) await consumption.click();
  await popup.getByText("Itens do pedido (1)").click();
  await expect(popup.getByText(/1 × Espetinho P40/)).toBeVisible();
  await page.getByTestId("payment-emit-invoice-checkbox").uncheck();
  if (narrow) await popup.getByRole("button", { name: "Pagamento", exact: true }).click();

  await popup.getByRole("button", { name: /^R\$\s*5,00$/ }).click();
  await page.getByTestId("payment-add-button").click();
  await page.getByTestId("payment-method-credito").click();
  await page.getByTestId("card-brand-visa").click();
  await popup.getByLabel("Operadora", { exact: true }).fill("Operadora fictícia");
  await popup.getByLabel("Parcelas", { exact: true }).selectOption("3");
  await page.getByTestId("payment-add-button").click();
  await expect(page.getByTestId("payment-remaining")).toContainText("0,00");
  const sale = page.waitForResponse((response) => response.url().endsWith("/api/pdv/sale") && response.request().method() === "POST");
  await confirm.click();
  const settled = await sale;
  expect(settled.ok()).toBe(true);
  expect((await settled.json()).order.payments).toContainEqual(expect.objectContaining({
    method: "credito", details: expect.objectContaining({ acquirer: "Operadora fictícia", installments: 3 }),
  }));
  await expect(popup).toBeHidden();
});

test("adapts the cash and stock records and keeps their actions reachable at 175%", async ({ page }, info) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto(base);
  await page.getByLabel("Usuário", { exact: true }).fill("p40admin");
  await page.getByLabel("Senha", { exact: true }).fill("P40-Fictitious-Password!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByTestId("apollo-ribbon")).toBeVisible();
  await page.goto(base + "/caixa");
  const response = await page.request.post(base + "/api/cash/open", {
    data: { opening_amount: 0, note: "P64.2 layout fixture" }, headers: { Origin: base },
  });
  expect([200, 400, 409]).toContain(response.status());
  await page.reload();
  await page.getByTestId("cash-move-type-suprimento").click();
  await page.getByTestId("cash-move-amount-input").fill("1000");
  const note = `Suprimento fictício P64.2 ${Date.now()}`;
  await page.getByTestId("cash-move-note-input").fill(note);
  await page.getByTestId("cash-move-button").click();
  const movements = page.getByRole("table", { name: "Movimentações manuais do turno" });
  await expect(movements).toContainText(note);

  await page.getByRole("button", { name: "Recolher atalhos" }).click();
  await expect(page.locator("#apollo-ribbon-shortcuts")).toBeHidden();
  await page.getByRole("button", { name: "Mostrar atalhos" }).click();
  await expect(page.locator("#apollo-ribbon-shortcuts")).toBeVisible();
  await page.getByTestId("display-controls-trigger").click();
  await page.getByLabel("Zoom da interface", { exact: true }).selectOption("175");
  const movementRow = movements.getByRole("row").filter({ hasText: note });
  await expect(movementRow.locator(".apollo-cell-label").first()).toBeVisible();
  expect(await movements.evaluate((table) => table.scrollWidth <= table.clientWidth + 2)).toBe(true);
  await movementRow.screenshot({ path: info.outputPath("caixa-adaptativo.png") });

  await page.goto(base + "/estoque");
  const ingredient = page.getByTestId("ingredient-row-p40ing");
  await expect(ingredient.locator(".apollo-cell-label").first()).toBeVisible();
  const stockTable = page.locator(".apollo-adaptive-table").filter({ has: ingredient });
  expect(await stockTable.evaluate((element) => element.scrollWidth <= element.clientWidth + 2)).toBe(true);
  await ingredient.screenshot({ path: info.outputPath("estoque-adaptativo.png") });
  await ingredient.getByTestId("move-ingredient-p40ing").click();
  await expect(page.getByRole("dialog")).toBeVisible();
});


test("keeps each operator's zoom and supports the table workspace shortcuts", async ({ page }) => {
  async function signIn(username: string) {
    await page.getByLabel("Usuário", { exact: true }).fill(username);
    await page.getByLabel("Senha", { exact: true }).fill("P40-Fictitious-Password!");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByTestId("apollo-ribbon")).toBeVisible();
  }

  async function switchOperator() {
    await page.getByRole("button", { name: "Bloquear ou trocar operador" }).click();
    await page.getByRole("dialog", { name: "Operador atual" }).getByTestId("logout-button").click();
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await signIn("p40admin");
  await page.getByTestId("display-controls-trigger").click();
  const zoom = page.getByLabel("Zoom da interface", { exact: true });
  await zoom.selectOption("80");
  await page.goto(base + "/mesas");
  await page.getByTestId("table-card-401").click();
  const open = page.getByTestId("open-table-button");
  if (await open.isVisible()) await open.click();
  await expect(page.getByTestId("table-product-search")).toBeEnabled();
  const workspace = page.getByRole("region", { name: "Atendimento — Mesa 401" });
  await expect(workspace.getByRole("region", { name: "Catálogo de produtos" })).toBeVisible();
  await expect(workspace.getByRole("region", { name: "Itens do pedido" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Atendimento — Mesa 401" })).toHaveCount(0);
  for (const [width, height] of [[1366, 768], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    const catalog = await workspace.getByRole("region", { name: "Catálogo de produtos" }).boundingBox();
    const order = await workspace.getByRole("region", { name: "Itens do pedido" }).boundingBox();
    expect(catalog && order && order.x >= catalog.x + catalog.width - 1 && Math.abs(order.y - catalog.y) < 1).toBeTruthy();
    await expect(workspace.getByTestId("close-table-button")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  }
  await page.keyboard.press("F3");
  await expect(page.getByTestId("table-product-search")).toBeFocused();
  await page.getByRole("button", { name: "Centralizar área de atendimento" }).click();
  await expect(workspace).toHaveAttribute("data-layout", "centered");
  await page.getByRole("button", { name: "Expandir área de atendimento" }).click();
  await expect(workspace).toHaveAttribute("data-layout", "wide");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByTestId("product-card-p40product").click();
  await page.getByTestId("product-card-p40product").click();
  await expect(workspace.getByTestId("pending-line-0")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("atendimento-p647-desktop.png") });
  await page.getByTestId("table-workspace-close").click();
  await switchOperator();
  await signIn("p40caixa1");
  await expect(zoom).toHaveValue("100");
  await page.getByTestId("display-controls-trigger").click();
  await zoom.selectOption("125");
  await switchOperator();
  await signIn("p40admin");
  await expect(zoom).toHaveValue("80");

  const adminProducts = await (await page.request.get(base + "/api/products")).json();
  expect(adminProducts.find((product: { id: string }) => product.id === "p40product").cost).toBe(4);
  await switchOperator();
  await signIn("p40garcom");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("waiter-mobile-navigation")).toBeVisible();
  await expect(page.getByTestId("top-menu-groups")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bloquear ou trocar operador" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("garcom-mobile.png") });
  for (const endpoint of ["/backups/cloud", "/cash/current", "/reports/executive", "/ingredients", "/employees"]) {
    expect((await page.request.get(base + "/api" + endpoint)).status(), endpoint).toBe(403);
  }
  const products = await (await page.request.get(base + "/api/products")).json();
  expect(products.find((product: { id: string }) => product.id === "p40product")).toMatchObject({
    price: 10, cost: 0, cost_price: 0, margin_pct: 0, recipe: [], stock_ingredient_id: null,
  });
  const tablePath = base + "/api/tables/p40table401";
  const order = await (await page.request.get(tablePath + "/order")).json();
  const launch = await page.request.post(tablePath + "/items", {
    headers: { Origin: base },
    data: { order_id: order.id, client_ref: crypto.randomUUID(), items: [{ product_id: "p40product", qty: 1 }] },
  });
  expect(launch.ok()).toBe(true);
  for (const response of [launch, await page.request.get(tablePath + "/order")]) {
    const body = await response.json();
    expect(body.cmv).toBe(0);
    expect(body.items).toContainEqual(expect.objectContaining({
      product_id: "p40product", unit_cost: 0, stock_ref: null, stock_recipe: null,
    }));
  }
});
