import { expect, test, request } from "@playwright/test";

const base = process.env.APOLLO_E2E_BASE_URL || "https://127.0.0.1:8001";

// Test credentials are transient and must stay out of the browser trace.
test.use({ trace: "off" });

test("enrolls a terminal and dispatches a PWA order only to its bound sector", async ({ page }, info) => {
  await page.goto(base);
  await page.getByLabel("Usuário", { exact: true }).fill("p40admin");
  await page.getByLabel("Senha", { exact: true }).fill("P40-Fictitious-Password!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByTestId("apollo-ribbon")).toBeVisible();

  async function post(path: string, data: object) {
    const res = await page.request.post(base + "/api" + path, { data, headers: { Origin: base } });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  }

  const printer = await post("/printers", {
    name: "Epson simulada P64.3", purpose: "cozinha", device_name: "Fila de homologação",
    paper: "80mm", copies: 2, active: true,
  });
  await page.goto(base + "/config?tab=impressoras");
  await page.getByText("Terminais de impressão Windows", { exact: true }).click();
  await page.getByLabel("Nome do terminal").fill("Terminal fictício P64.3");
  await page.getByLabel("Fila de 80 mm").selectOption(printer.id);
  await page.getByRole("button", { name: "Gerar credencial" }).click();
  const credential = page.getByLabel("Credencial do terminal", { exact: true });
  await expect(credential).toBeVisible();
  const token = await credential.inputValue();
  await page.getByRole("button", { name: "Ocultar credencial" }).click();

  const agent = await request.newContext({
    baseURL: base, ignoreHTTPSErrors: true, extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  try {
    const table = await post("/tables", { number: 90000 + Math.floor(Math.random() * 9000), kind: "mesa" });
    const opening = await post(`/tables/${table.id}/open`, {});
    const order = await post(`/tables/${table.id}/items`, {
      order_id: opening.order_id,
      items: [{ product_id: "p40product", qty: 2 }, { product_id: "p41drink", qty: 1 }],
    });
    const poll = await agent.post("/api/print-agents/jobs/next", { data: { queue: "Fila de homologação" } });
    expect(poll.ok()).toBe(true);
    const job = await poll.json();
    expect(job).toMatchObject({ station: "cozinha", copies: 2, queue: "Fila de homologação" });
    expect(job.lines).toContain(`Pedido #${order.number}`);
    expect(job.lines).toContain("2x Espetinho P40");
    expect(job.lines).not.toContain("1x Bebida P41");
    const result = await agent.post(`/api/print-agents/jobs/${job.ticket_id}/result`, {
      data: { station: job.station, attempt_id: job.attempt_id, outcome: "spooler_accepted" },
    });
    expect(result.ok()).toBe(true);

    await page.goto(base + "/cozinha");
    const ticket = page.getByTestId(`kds-ticket-${order.number}`);
    await expect(ticket.getByText("Aceito pelo spooler")).toBeVisible();
    await expect(ticket.getByText("Conferido no papel")).toHaveCount(0);
    await ticket.screenshot({ path: info.outputPath("kds-envio-spooler-simulado.png") });
  } finally {
    await agent.dispose();
  }
});
