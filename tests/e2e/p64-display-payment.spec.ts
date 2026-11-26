import { expect, test } from "@playwright/test";

const base = process.env.APOLLO_E2E_BASE_URL || "https://127.0.0.1:8001";
const levels = Array.from({ length: 26 }, (_, index) => 50 + index * 5);
const sizes = [[800, 600], [1024, 768], [1280, 720], [1366, 768], [1440, 900], [1600, 900], [1920, 1080], [2560, 1440]];

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
  await page.getByTestId("payment-add-button").click();
  await expect(page.getByTestId("payment-remaining")).toContainText("0,00");
  const sale = page.waitForResponse((response) => response.url().endsWith("/api/pdv/sale") && response.request().method() === "POST");
  await confirm.click();
  expect((await sale).ok()).toBe(true);
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
