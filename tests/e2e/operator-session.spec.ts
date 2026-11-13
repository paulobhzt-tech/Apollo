import { expect, test, type Page } from "@playwright/test";

if (process.env.APOLLO_CHROMIUM) {
  test.use({ launchOptions: { executablePath: process.env.APOLLO_CHROMIUM } });
}

const operators = [
  { id: "a", username: "admin-teste", name: "Admin Teste", role: "admin" },
  { id: "c", username: "caixa-teste", name: "Caixa Teste", role: "caixa" },
  { id: "g", username: "garcom-teste", name: "Garçom Teste", role: "garcom" },
];
const tables = [
  { id: "m1", kind: "mesa", number: 12, status: "livre", seats: 4 },
  { id: "c1", kind: "comanda", number: 23, status: "livre", seats: 1 },
];

async function mockServer(page: Page) {
  let active: (typeof operators)[number] | undefined;
  let authorized = false;
  let offline = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    const method = route.request().method();
    if (offline) return route.abort("internetdisconnected");
    let status = 200;
    let json: unknown = [];
    switch (path) {
      case "/auth/me": status = active ? 200 : 401; json = active ?? { detail: "Não autenticado" }; break;
      case "/auth/login": {
        const { username, password } = route.request().postDataJSON();
        const candidate = operators.find((operator) => operator.username === username);
        if (!candidate || password !== "senha-ficticia") { status = 401; json = { detail: "Credenciais inválidas" }; break; }
        active = candidate;
        json = candidate;
        break;
      }
      case "/auth/logout": active = undefined; json = { ok: true }; break;
      case "/auth/operator-terminal":
        if (method === "PUT") {
          if (active?.role !== "admin") { status = 403; json = { detail: "Acesso restrito" }; break; }
          authorized = route.request().postDataJSON().authorized;
        }
        json = { authorized };
        break;
      case "/auth/profiles": json = authorized ? operators : []; break;
      case "/auth/sync-context": status = 503; json = { detail: "Fila de teste isolada" }; break;
      case "/suppliers": json = [{ id: "s1", name: "Frigorífico São João", phone: "31999990000", doc: "", supplies: "Carnes", contact: "", cpf: "", cnpj: "" }]; break;
      case "/tables": json = tables; break;
      case "/products": json = [{ id: "prod", code: "TESTE", name: "Produto fictício", price: 5, active: true }]; break;
      case "/bills/alerts": json = { overdue: [], due_today: [], due_tomorrow: [] }; break;
      case "/cash/current": json = null; break;
      case "/reports/dashboard":
      case "/reports/executive":
      case "/reports/daily-performance": status = 503; json = { detail: "Relatórios fora do cenário" }; break;
    }
    await route.fulfill({ status, json: json === null ? undefined : json, ...(json === null ? { body: "null", contentType: "application/json" } : {}) });
  });
  return { setOffline: (value: boolean) => { offline = value; } };
}

async function signIn(page: Page, username: string) {
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill("senha-ficticia");
  await page.getByLabel("Senha", { exact: true }).press("Enter");
  await expect(page.getByTestId("apollo-ribbon")).toBeVisible();
}

async function lock(page: Page) {
  await page.getByRole("button", { name: "Bloquear ou trocar operador" }).click();
  await page.getByRole("dialog", { name: "Operador atual" }).getByRole("button", { name: "Bloquear ou trocar operador" }).click();
  await expect(page.getByRole("dialog", { name: "Bem-vindo de volta" })).toBeVisible();
}

test("login, recuperação, memorização e troca entre perfis", async ({ page }) => {
  await mockServer(page);
  await page.addInitScript(() => Object.defineProperty(window, "pdvDesktop", {
    value: { version: "3.0.1", kvGet: () => null, kvSet: () => true },
  }));
  await page.goto("/pdv");
  const login = page.getByRole("dialog", { name: "Bem-vindo de volta" });
  await expect(login).toBeVisible();
  await expect(login.getByText("Versão 3.0.1")).toBeVisible();
  await expect(login.getByRole("button", { name: "Selecionar usuário" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Apollo PDV bloqueado")).toBeVisible();
  await page.getByRole("button", { name: "Abrir login" }).click();
  await login.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByTestId("apollo-ribbon")).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir login" }).click();
  await page.getByTestId("forgot-password-link").click();
  const recovery = page.getByRole("dialog", { name: "Recuperar acesso" });
  await expect(recovery.getByText(/Solicite ao administrador/)).toBeVisible();
  await recovery.getByRole("button", { name: "Fechar" }).click();
  await page.getByLabel("Usuário", { exact: true }).fill("admin-teste");
  const password = page.getByLabel("Senha", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("incorreta");
  await password.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Usuário ou senha incorretos.");
  await password.fill("senha-ficticia");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await password.fill("incorreta");
  await password.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Usuário ou senha incorretos.");
  await page.getByLabel("Usuário", { exact: true }).fill("caixa-teste");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Usuário", { exact: true }).fill("admin-teste");
  const remember = page.getByRole("checkbox", { name: "Memorizar usuário" });
  await remember.click();
  await page.getByRole("button", { name: "Não", exact: true }).click();
  await expect(remember).not.toBeChecked();
  await remember.click();
  await page.getByRole("button", { name: "Sim", exact: true }).click();
  await signIn(page, "admin-teste");
  await page.getByRole("button", { name: "Bloquear ou trocar operador" }).click();
  await page.getByRole("button", { name: "Autorizar lista neste terminal" }).click();
  await expect(page.getByRole("button", { name: "Desautorizar lista neste terminal" })).toBeVisible();
  await page.getByRole("dialog", { name: "Operador atual" }).getByRole("button", { name: "Bloquear ou trocar operador" }).click();
  await expect(login).toBeVisible();
  await expect(page.getByLabel("Usuário", { exact: true })).toHaveValue("admin-teste");
  await expect(password).toHaveValue("");
  await page.getByRole("button", { name: "Selecionar usuário" }).click();
  await expect(page.getByText("Login", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /caixa-teste Caixa Teste/ }).click();
  await expect(page.getByLabel("Usuário", { exact: true })).toHaveValue("caixa-teste");
  await signIn(page, "caixa-teste");
  await expect(page).toHaveURL(/\/pdv$/);
  await page.keyboard.press("F3");
  await expect(page.getByTestId("product-search-input")).toBeFocused();
  await page.getByTestId("product-card-TESTE").click();
  await expect(page.getByTestId("cart-line-0")).toContainText("Produto fictício");
  await page.goto("/funcionarios");
  await expect(page.getByTestId("no-permission")).toBeVisible();
  await lock(page);
  await signIn(page, "garcom-teste");
  await expect(page).toHaveURL(/\/comanda-mobile$/);
  await page.goto("/pdv");
  await expect(page.getByTestId("no-permission")).toBeVisible();
  await page.getByRole("button", { name: "Bloquear ou trocar operador" }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(login).toBeVisible();
  await expect(password).toHaveValue("");
  await signIn(page, "admin-teste");
  const shortcutRow = page.getByTestId("top-menu-shortcuts");
  const pdvShortcut = shortcutRow.getByRole("link", { name: "Caixa/PDV" });
  if (await pdvShortcut.isVisible()) {
    await pdvShortcut.click();
  } else {
    await shortcutRow.getByRole("button", { name: "Mais atalhos" }).click();
    await page.getByRole("dialog", { name: "Atalhos da seção" }).getByRole("link", { name: "Caixa/PDV" }).click();
  }
  await expect(page.getByTestId("cart-line-0")).toHaveCount(0);
  await lock(page);
  await signIn(page, "caixa-teste");
  await expect(page.getByTestId("cart-line-0")).toContainText("Produto fictício");
});

test("cancelar cadastro de usuário não redireciona o administrador", async ({ page }) => {
  await mockServer(page);
  await page.goto("/login");
  await page.getByTestId("register-user-link").click();
  await page.getByRole("dialog", { name: "Cadastrar usuário" })
    .getByRole("button", { name: "Entrar como administrador" }).click();
  await page.getByRole("button", { name: "Entrar com PIN" }).click();
  await page.getByRole("button", { name: "Entrar com usuário e senha" }).click();
  await signIn(page, "admin-teste");
  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/\/funcionarios$/);
});

test("bloqueio continua exigindo autenticação sem rede e após recarregar", async ({ page }) => {
  const server = await mockServer(page);
  await page.goto("/login");
  await signIn(page, "admin-teste");
  server.setOffline(true);
  await lock(page);
  await page.reload();
  await page.goto("/pdv");
  await expect(page.getByRole("dialog", { name: "Bem-vindo de volta" })).toBeVisible();
  await page.getByLabel("Usuário", { exact: true }).fill("admin-teste");
  await page.getByLabel("Senha", { exact: true }).fill("senha-ficticia");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Servidor indisponível");
  await expect(page.getByTestId("apollo-ribbon")).toHaveCount(0);
  server.setOffline(false);
  await signIn(page, "admin-teste");
});

test("atalhos salvos ignoram duplicatas e páginas sem permissão", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("apollo-menu-shortcuts:c", JSON.stringify(["/mesas", "/mesas", "/funcionarios", "/rota-inexistente"]));
  });
  await mockServer(page);
  await page.goto("/login");
  await signIn(page, "caixa-teste");
  const ribbon = page.getByTestId("apollo-ribbon");
  await expect(ribbon.getByRole("link", { name: "Mesas/Comandas" })).toHaveCount(1);
  await expect(ribbon.getByRole("link", { name: "Funcionários" })).toHaveCount(0);
});

test("faixa, tema, zoom e atendimento em mesa e comanda", async ({ page }) => {
  await mockServer(page);
  await page.goto("/login");
  await signIn(page, "admin-teste");
  await page.getByRole("button", { name: "Personalizar menu" }).click();
  const preferences = page.getByRole("dialog", { name: "Atalhos do meu menu" });
  await page.setViewportSize({ width: 390, height: 500 });
  const options = preferences.getByTestId("menu-preferences-options");
  await expect(options).toHaveCSS("overflow-y", "auto");
  await expect.poll(() => options.evaluate((element) => element.clientHeight <= 500)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  const stockShortcut = preferences.getByRole("checkbox", { name: "Estoque & Insumos", exact: true });
  await expect(stockShortcut).toBeChecked();
  await stockShortcut.uncheck();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("apollo-menu:a") ?? "{}").shortcuts as string[]
  )).not.toContain("/estoque");
  await stockShortcut.check();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("apollo-menu:a") ?? "{}").shortcuts as string[]
  )).toContain("/estoque");
  await preferences.getByRole("button", { name: "Fechar", exact: true }).click();
  const menu = page.getByTestId("top-menu-groups");
  for (const label of ["Principal", "Produtos", "Marketing", "Financeiro", "Relatórios", "Apps", "Configurações"]) {
    await expect(menu.getByRole("button", { name: new RegExp(`^${label}$`, "i") })).toBeVisible();
  }
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await page.getByTestId("menu-search").fill("cardapio digital");
  await expect(page.getByTestId("nav-qrcodes")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ativar modo claro" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  const viewport = page.viewportSize()!;
  for (const width of [viewport.width, 768]) {
    await page.setViewportSize({ width, height: viewport.height });
    await page.getByLabel("Zoom da interface").selectOption("175");
    await expect.poll(() => page.evaluate(() => {
      const element = document.querySelector("[data-testid=apollo-ribbon]")!;
      return element.scrollWidth <= element.clientWidth + 1;
    })).toBe(true);
  }
  await page.setViewportSize(viewport);
  await page.getByLabel("Zoom da interface").selectOption("100");
  const shortcuts = page.getByTestId("top-menu-shortcuts");
  await expect(shortcuts.getByRole("link", { name: "Abrir/Fechar Caixa" })).toHaveAttribute("href", "/caixa");
  await shortcuts.getByRole("button", { name: "Mais atalhos" }).click();
  const sectionShortcuts = page.getByRole("dialog", { name: "Atalhos da seção" });
  await expect(sectionShortcuts.getByRole("link", { name: "Fila de Atendimento" })).toHaveAttribute("href", "/comanda-mobile?fila=1");
  await sectionShortcuts.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(shortcuts.getByText("Agendados")).toHaveCount(0);
  await shortcuts.getByRole("link", { name: "Mesas/Comandas" }).click();
  await page.getByTestId("table-card-12").click();
  const mesa = page.getByRole("dialog", { name: "Atendimento — Mesa 12" });
  await expect(mesa).toBeVisible();
  await expect(mesa).toHaveCSS("overflow-y", "auto");
  await expect(mesa.getByTestId("table-qr-button")).toBeVisible();
  await mesa.getByTestId("open-table-name-input").fill("Cliente de teste");
  page.once("dialog", (dialog) => dialog.dismiss());
  await mesa.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(mesa).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(mesa).toBeHidden();
  await page.getByTestId("kind-tab-comanda").click();
  await page.getByTestId("comanda-card-23").click();
  const comanda = page.getByRole("dialog", { name: "Atendimento — Comanda 23" });
  await expect(comanda).toBeVisible();
  await expect(comanda).toHaveCSS("overflow-y", "auto");
  await comanda.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(comanda).toBeHidden();
});


test("mesa e comanda permanecem acessíveis em tela pequena", async ({ page }) => {
  await mockServer(page);
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/login");
  await signIn(page, "admin-teste");
  await page.goto("/mesas");

  for (const [tab, card, title] of [
    ["mesa", "table-card-12", "Atendimento — Mesa 12"],
    ["comanda", "comanda-card-23", "Atendimento — Comanda 23"],
  ] as const) {
    await page.getByTestId(`kind-tab-${tab}`).click();
    await page.getByTestId(card).click();
    const dialog = page.getByRole("dialog", { name: title });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("overflow-y", "auto");
    await expect.poll(async () => {
      const box = await dialog.boundingBox();
      return Boolean(box && box.y >= 0 && box.y + box.height <= 501);
    }).toBe(true);
    await dialog.getByTestId("table-workspace-close").click();
    await expect(dialog).toBeHidden();
  }
});

test("busca de fornecedores ignora acentos e diferenças de maiúsculas", async ({ page }) => {
  await mockServer(page);
  await page.goto("/login");
  await signIn(page, "admin-teste");
  await page.goto("/fornecedores");
  await expect(page.getByTestId("supplier-row-s1")).toBeVisible();
  await page.getByTestId("supplier-search-input").fill("FRIGORIFICO SAO");
  await expect(page.getByTestId("supplier-row-s1")).toBeVisible();
  await page.getByTestId("supplier-search-input").fill("outro fornecedor");
  await expect(page.getByTestId("supplier-row-s1")).toHaveCount(0);
});

test("garçom consulta pedidos prontos e a conta sem acesso ao pagamento", async ({ page }) => {
  await mockServer(page);
  await page.route("**/api/tables", (route) => route.fulfill({ json: [
    { ...tables[0], status: "ocupada", order_id: "order-1", total: 10, waiter_id: "g" },
    { ...tables[1], status: "conta", order_id: "order-2", total: 20 },
    { id: "c2", kind: "comanda", number: 24, status: "livre", seats: 1 },
  ] }));
  await page.route("**/api/kds/tickets", (route) => route.fulfill({ json: [
    { id: "ready-1", status: "pronto", order_id: "order-1", order_number: 17 },
    { id: "ready-2", status: "pronto", order_id: "closed-order", order_number: 18 },
  ] }));
  await page.route("**/api/tables/m1/order", (route) => route.fulfill({ json: {
    id: "order-1", subtotal: 10, total: 10,
    items: [
      { id: "i1", product_id: "prod", name: "Produto fictício", qty: 1, unit_price: 5, ordered_at: "2026-11-12T23:15:00Z" },
      { id: "i2", product_id: "prod", name: "Produto fictício", qty: 1, unit_price: 5, ordered_at: "2026-11-12T23:30:00Z" },
    ],
  } }));
  await page.goto("/login");
  await signIn(page, "garcom-teste");

  const ready = page.getByTestId("mobile-ready-orders");
  await expect(ready.getByRole("button")).toHaveCount(1);
  await ready.getByRole("button", { name: /Mesa 12.*#17/ }).click();
  const workspace = page.getByRole("dialog", { name: "Atendimento — Mesa 12" });
  await expect(workspace.getByTestId("close-table-button")).toHaveCount(0);
  await workspace.getByRole("button", { name: "Ver conta", exact: true }).click();
  const bill = page.getByTestId("prebill-dialog");
  await expect(bill.getByTestId("prebill-line")).toHaveCount(1);
  await expect(bill.getByText(/Horário:/)).toHaveCount(0);
  await bill.getByRole("checkbox", { name: "Mostrar horário dos lançamentos" }).click();
  await expect(bill.getByTestId("prebill-line")).toContainText(/Horário: (?=.*:15)(?=.*:30)/);
  await bill.getByRole("checkbox", { name: /Agrupar produtos iguais/ }).click();
  await expect(bill.getByTestId("prebill-line")).toHaveCount(2);
  await bill.getByRole("button", { name: "Fechar", exact: true }).click();

  await workspace.getByTestId("transfer-select").click();
  await expect(page.getByRole("option", { name: "Comanda 23" })).toHaveCount(0);
  await page.getByRole("option", { name: "Comanda 24" }).click();
  const confirmation = page.waitForEvent("dialog").then(async (dialog) => {
    const message = dialog.message();
    await dialog.dismiss();
    return message;
  });
  await workspace.getByTestId("transfer-button").click();
  expect(await confirmation).toContain("Mesa 12 para Comanda 24");
  await expect(workspace).toBeVisible();

  await workspace.getByTestId("table-workspace-close").click();

  await page.getByTestId("waiter-tab-fechar").click();
  await expect(page.getByTestId("table-card-12")).toBeVisible();
  await expect(page.getByTestId("comanda-card-23")).toBeVisible();
});

test("indicadores financeiros mobile respeitam o perfil administrativo", async ({ page }) => {
  await mockServer(page);
  const requested: string[] = [];
  await page.route("**/api/reports/{dre,forecast}*", (route) => {
    const path = new URL(route.request().url()).pathname;
    requested.push(path);
    return route.fulfill({ json: path.endsWith("/dre") ? { gross_revenue: 150, expenses: 60 } : { average_monthly_profit: 75 } });
  });
  await page.goto("/admin-mobile");
  await signIn(page, "garcom-teste");
  await page.goto("/admin-mobile");
  await expect(page.getByTestId("no-permission")).toBeVisible();
  expect(requested).toEqual([]);

  await lock(page);
  await signIn(page, "admin-teste");
  await page.goto("/admin-mobile");
  await expect(page.getByTestId("admin-month-revenue")).toContainText("150,00");
  await expect(page.getByTestId("admin-month-expenses")).toContainText("60,00");
  await expect(page.getByTestId("admin-profit-forecast")).toContainText("75,00");
});


test("menu compacto mantém duas faixas e acesso aos atalhos em várias resoluções", async ({ page }) => {
  await mockServer(page);
  await page.goto("/login");
  await signIn(page, "admin-teste");
  await page.goto("/mesas");

  const groups = page.getByTestId("top-menu-groups");
  const shortcuts = page.getByTestId("top-menu-shortcuts");
  for (const [width, height] of [[1366, 768], [1600, 900], [1920, 1080], [2560, 1440], [900, 640], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    if (width >= 1366) {
      await expect(groups.getByRole("button")).toHaveCount(7);
      await expect(shortcuts.getByRole("link", { name: "Clientes", exact: true })).toBeVisible();
      await expect(shortcuts.getByRole("link", { name: "Fila de Atendimento" })).toBeVisible();
    }
    for (const [bar, selector] of [[groups, "button"], [shortcuts, "a"]] as const) {
      await expect.poll(() => bar.evaluate((element, selector) => {
        const bounds = element.getBoundingClientRect();
        const visible = [...element.querySelectorAll(selector)]
          .filter((item) => item.getClientRects().length)
          .map((item) => item.getBoundingClientRect());
        return element.scrollWidth <= element.clientWidth + 1 &&
          visible.every((item) => Math.abs(item.top - visible[0].top) <= 1 && item.left >= bounds.left && item.right <= bounds.right + 1);
      }, selector)).toBe(true);
    }
  }
  await expect(groups.getByRole("combobox", { name: "Seção do menu" })).toHaveValue("Principal");
  await expect(shortcuts.getByRole("link", { name: "Cardápio Digital" })).toHaveCount(0);
  await shortcuts.getByRole("button", { name: "Mais atalhos" }).click();
  const more = page.getByRole("dialog", { name: "Atalhos da seção" });
  await expect(more.getByRole("link", { name: "Cardápio Digital" })).toHaveAttribute("href", "/qrcodes");
  await more.getByRole("button", { name: "Fechar" }).click();
  await groups.getByRole("combobox", { name: "Seção do menu" }).selectOption("Produtos");
  await expect(shortcuts.getByRole("link", { name: "Estoque & Insumos" })).toBeVisible();
});

test("personalização do menu persiste por operador e pode ser restaurada", async ({ page }) => {
  await mockServer(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  await signIn(page, "admin-teste");
  const ribbon = page.getByTestId("apollo-ribbon");
  const shortcuts = page.getByTestId("top-menu-shortcuts");
  const openPreferences = () => page.getByRole("button", { name: "Personalizar menu" }).click();
  const preferences = page.getByRole("dialog", { name: "Atalhos do meu menu" });
  await openPreferences();
  await preferences.getByRole("button", { name: "Subir Mesas/Comandas" }).click();
  await preferences.getByRole("checkbox", { name: "Delivery", exact: true }).uncheck();
  await preferences.getByLabel("Tamanho dos ícones").selectOption("large");
  await preferences.getByLabel("Tamanho dos botões").selectOption("large");
  await preferences.getByLabel("Cor do menu").selectOption("blue");
  await preferences.getByLabel("Tema").selectOption("light");
  await preferences.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await expect(ribbon).toHaveAttribute("data-menu-accent", "blue");
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(shortcuts.getByRole("link").first()).toHaveText("Mesas/Comandas");
  await expect(shortcuts.getByRole("link", { name: "Mesas/Comandas" }).locator("svg")).toHaveCSS("width", "32px");
  await expect(shortcuts.getByRole("link", { name: "Mesas/Comandas" })).toHaveCSS("min-height", "68px");
  await expect(shortcuts.getByRole("link", { name: "Delivery" })).toHaveCount(0);

  await lock(page);
  await signIn(page, "caixa-teste");
  await expect(ribbon).toHaveAttribute("data-menu-accent", "apollo");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await openPreferences();
  await expect(preferences.getByRole("checkbox", { name: "Funcionários", exact: true })).toHaveCount(0);
  await preferences.getByRole("button", { name: "Fechar", exact: true }).click();
  await lock(page);
  await signIn(page, "admin-teste");
  await expect(ribbon).toHaveAttribute("data-menu-accent", "blue");
  await openPreferences();
  await preferences.getByRole("button", { name: "Restaurar padrão" }).click();
  await expect(preferences.getByLabel("Tamanho dos ícones")).toHaveValue("medium");
  await expect(preferences.getByLabel("Tamanho dos botões")).toHaveValue("medium");
  await expect(preferences.getByRole("checkbox", { name: "Delivery", exact: true })).toBeChecked();
  await preferences.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(ribbon).toHaveAttribute("data-menu-accent", "apollo");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("ações por item editam o rascunho e repetem o envio com a mesma referência", async ({ page }) => {
  await mockServer(page);
  const item = { id: "sent-1", product_id: "prod", name: "Produto fictício", qty: 2, unit_price: 5, notes: "Sem sal", ordered_by: "Garçom Teste" };
  const order = { id: "order-1", number: 17, status: "aberto", subtotal: 10, total: 10, items: [item] };
  await page.route("**/api/tables", (route) => route.fulfill({ json: [{ ...tables[0], status: "ocupada", order_id: order.id, total: 10, waiter_name: "Garçom Teste", customer_name: "Cliente Teste", opened_at: "2026-11-12T23:10:00Z" }] }));
  await page.route("**/api/tables/m1/order", (route) => route.fulfill({ json: order }));
  await page.route("**/api/tables/m1/item-progress", (route) => route.fulfill({ json: { "sent-1": "pronto" } }));
  const requests: { client_ref: string; order_id: string; items: unknown[] }[] = [];
  await page.route("**/api/tables/m1/items", (route) => {
    requests.push(route.request().postDataJSON());
    return requests.length === 1 ? route.abort("connectionreset") : route.fulfill({ json: order });
  });
  await page.goto("/login");
  await signIn(page, "garcom-teste");
  await page.getByTestId("table-card-12").click();
  const workspace = page.getByRole("dialog", { name: "Atendimento — Mesa 12" });
  await expect(workspace.getByText("Pronto para entrega", { exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: "Ações de Produto fictício" }).click();
  await page.getByRole("menuitem", { name: "Duplicar e editar" }).click();
  const editor = page.getByRole("dialog", { name: "Editar · Produto fictício" });
  await editor.getByRole("button", { name: "Aumentar quantidade" }).click();
  await editor.getByLabel("Observação do rascunho").fill("Sem pimenta");
  await editor.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(workspace.getByTestId("pending-line-0")).toBeVisible();
  await expect(workspace.getByTestId("close-table-button")).toHaveCount(0);
  await workspace.getByTestId("send-to-kitchen-button").click();
  const review = page.getByTestId("waiter-review-dialog");
  await expect(review).toContainText("3 × Produto fictício");
  await expect(review).toContainText("Sem pimenta");
  await review.getByTestId("waiter-confirm-send").click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(review.getByRole("button", { name: "Editar itens" })).toBeDisabled();
  await review.getByTestId("waiter-confirm-send").click();
  await expect(review).toBeHidden();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  expect(requests[0].order_id).toBe(order.id);
});

test("conta fiado seleciona extrato e filtra clientes sem saldo", async ({ page }) => {
  await mockServer(page);
  await page.route("**/api/customers", (route) => route.fulfill({ json: [
    { id: "c1", name: "João Teste", phone: "", balance: 60, credit_limit: 100 },
    { id: "c2", name: "Maria Teste", phone: "", balance: 0, credit_limit: 0 },
  ] }));
  await page.route("**/api/customers/*/moves", (route) => route.fulfill({ json: [] }));
  await page.goto("/login");
  await signIn(page, "caixa-teste");
  await page.goto("/fiado");
  await expect(page.getByRole("heading", { name: "Extrato · João Teste" })).toBeVisible();
  await page.getByTestId("fiado-history-c2").click();
  await expect(page.getByRole("heading", { name: "Extrato · Maria Teste" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Ocultar clientes com saldo zerado" }).check();
  await expect(page.getByTestId("fiado-customer-c2")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Extrato · João Teste" })).toBeVisible();
  await page.getByTestId("fiado-search-input").fill("joao");
  await expect(page.getByTestId("fiado-customer-c1")).toBeVisible();
});

test("DRE simula custo e meta diária sem lançar movimentação", async ({ page }) => {
  await mockServer(page);
  await page.route("**/api/reports/dre?**", (route) => route.fulfill({ json: {
    gross_revenue: 10000, net_revenue: 8000, cmv: 2500, commissions: 500, expenses: 0,
    daily: [], by_payment: [], by_source: [], top_products: [], expenses_by_category: [], commission_list: [],
  } }));
  await page.route("**/api/reports/{product-profit,sales-intelligence,forecast,cashflow,sales-trends,sales-stock-forecast,intelligent-insights}*", (route) =>
    route.fulfill({ status: 503, json: { detail: "Fora do cenário" } }));
  await page.goto("/login");
  await signIn(page, "admin-teste");
  await page.goto("/financeiro");
  const panel = page.getByTestId("break-even-panel");
  await panel.getByLabel("Custos fixos mensais").fill("3000");
  await panel.getByLabel("Dias abertos no mês").fill("20");
  await expect(panel).toContainText("50%");
  await expect(panel).toContainText("150,00");
  await expect(panel).toContainText("6.000,00");
  await expect(panel).toContainText("300,00");
});
