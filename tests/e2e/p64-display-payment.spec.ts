import { expect, test } from "@playwright/test";

const base = process.env.APOLLO_E2E_BASE_URL || "https://127.0.0.1:8001";
const levels = Array.from({ length: 26 }, (_, index) => 50 + index * 5);
const sizes = [[800, 600], [1024, 768], [1280, 720], [1366, 768], [1600, 900], [1920, 1080]];

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
