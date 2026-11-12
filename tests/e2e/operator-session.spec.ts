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
  await page.getByTestId("top-menu-shortcuts").getByRole("link", { name: "Caixa/PDV" }).click();
  await expect(page.getByTestId("cart-line-0")).toHaveCount(0);
  await lock(page);
  await signIn(page, "caixa-teste");
  await expect(page.getByTestId("cart-line-0")).toContainText("Produto fictício");
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

test("faixa, tema, zoom e atendimento em mesa e comanda", async ({ page }) => {
  await mockServer(page);
  await page.goto("/login");
  await signIn(page, "admin-teste");
  const menu = page.getByTestId("top-menu-groups");
  for (const label of ["Principal", "Produtos", "Marketing", "Financeiro", "Relatórios", "Apps", "Configurações"]) {
    await expect(menu.getByRole("button", { name: label, exact: true })).toBeVisible();
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
  await expect(shortcuts.getByRole("link", { name: "Fila de Atendimento" })).toHaveAttribute("href", "/comanda-mobile?fila=1");
  await expect(shortcuts.getByText("Agendados")).toBeVisible();
  await shortcuts.getByRole("link", { name: "Mesas/Comandas" }).click();
  await page.getByTestId("table-card-12").click();
  const mesa = page.getByRole("dialog", { name: "Atendimento — Mesa 12" });
  await expect(mesa).toBeVisible();
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
  await comanda.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(comanda).toBeHidden();
});
