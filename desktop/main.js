const { atomicWriteWithBackup, recoverMissingPrimary } = require("./durable-store");
const { summarizeExitQueue } = require("./exit-queue");
// Apollo PDV — Windows desktop shell (Electron).
// Online: opens the published system (always the latest version, same data as browsers and phones).
// Offline: opens the copy of the screens bundled in the installer (pdv://app) so counter sales keep being
// recorded; they are stored encrypted on disk and synced automatically when the connection returns.
const { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell, Menu, dialog, session } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const { cleanUrl, allowedServerUrl, resolveServerConfig, probeServer, HOMOLOGATION_URL, parseConfig } = require("./server-connection");

const CHECK_MS = 15000;
let win = null;
let mode = "online";

// Updates are delivered only through official published GitHub releases.
// Test builds, unpackaged development and CI smoke runs never auto-update.
function enableProductionUpdates() {
  if (!app.isPackaged || cfg.testBuild === true || process.env.PDV_SMOKE) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // Never restart an active sale.
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("update-available", (info) => console.log("Apollo: atualizacao disponivel", info.version));
  autoUpdater.on("update-downloaded", (info) => console.log("Apollo: atualizacao pronta para o proximo encerramento", info.version));
  autoUpdater.on("error", (err) => console.error("Apollo: falha ao verificar atualizacoes", err.message));
  const check = () => autoUpdater.checkForUpdates().catch((err) => console.error("Apollo: consulta de atualizacao falhou", err.message));
  setTimeout(check, 30000);
  setInterval(check, 6 * 60 * 60 * 1000);
}


// ---------- config (userData/config.json, editable without reinstalling) ----------
const userDir = () => app.getPath("userData");
const configPath = () => path.join(userDir(), "config.json");
let configIssue = "";
let preserveConfig = false;
function loadConfig() {
  const defaults = parseConfig(fs.readFileSync(path.join(__dirname, "config.default.json"), "utf8"));
  let saved = {};
  try {
    saved = parseConfig(fs.readFileSync(configPath(), "utf8"));
    if (Object.hasOwn(saved, "serverUrl") && !allowedServerUrl(cleanUrl(saved.serverUrl), defaults)) {
      configIssue = "O endereço salvo no config.json é inválido para este instalador. Confirme o endereço antes de conectar.";
      preserveConfig = true;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      configIssue = "Não foi possível ler o config.json. Confira o endereço abaixo. O arquivo original será preservado ao salvar.";
      preserveConfig = true;
    }
  }
  if (configIssue) console.warn("Apollo: " + configIssue);
  return resolveServerConfig(defaults, saved);
}
let cfg;
function saveConfig(next = cfg) {
  if (preserveConfig) {
    fs.copyFileSync(configPath(), configPath() + ".preservado-" + crypto.randomUUID(), fs.constants.COPYFILE_EXCL);
  }
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  preserveConfig = false;
  configIssue = "";
}

// ---------- encrypted key/value store (offline queue, cached menu, last operator) ----------
const kvFile = () => path.join(userDir(), "pdv-dados.bin");
let kvCache = null;
function kvDecode(raw) {
  const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
  const value = JSON.parse(txt);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Formato de dados offline invalido");
  return value;
}
function kvLoad() {
  if (kvCache) return kvCache;
  const primary = kvFile();
  if (!fs.existsSync(primary)) recoverMissingPrimary(primary, kvDecode);
  if (!fs.existsSync(primary)) {
    kvCache = {};
    return kvCache;
  }
  try {
    kvCache = kvDecode(fs.readFileSync(primary));
    return kvCache;
  } catch (err) {
    // Never replace a corrupted queue with an empty object: unsynced sales
    // may still be recoverable from the original file or its backup.
    console.error("Apollo: dados offline indisponiveis; arquivo original preservado", err.message);
    throw new Error("Nao foi possivel ler as vendas offline. Nenhum dado foi apagado. Procure suporte antes de continuar.");
  }
}
function kvSave() {
  const primary = kvFile();
  const txt = JSON.stringify(kvCache || {});
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, "utf8");
  atomicWriteWithBackup(primary, data, kvDecode);
}
function deviceId() {
  const s = kvLoad();
  if (!s.__device) {
    s.__device = "pc-" + crypto.randomBytes(3).toString("hex");
    kvSave();
  }
  return s.__device;
}

// ---------- bundled offline copy of the screens ----------
protocol.registerSchemesAsPrivileged([{ scheme: "pdv", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
function registerAppProtocol() {
  const webRoot = path.join(__dirname, "web");
  protocol.handle("pdv", async (req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      // Offline copy: try the real server (works if internet came back); otherwise fail like a network error
      return net.fetch(cfg.serverUrl + url.pathname + url.search, { method: req.method, headers: req.headers, body: req.body, duplex: "half" });
    }
    let file = path.normalize(path.join(webRoot, decodeURIComponent(url.pathname)));
    if (!file.startsWith(webRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(webRoot, "index.html"); // SPA routes
    return net.fetch("file://" + file);
  });
}

let connectionError = "";
const testConnection = (url = cfg.serverUrl) => probeServer(url, net.fetch, { checkLogin: cfg.testBuild });

async function openBest(offlineOnly = false, confirmed = null) {
  if (!offlineOnly) {
    const result = confirmed ?? (cfg.testBuild && configIssue
      ? { ok: false, error: configIssue }
      : await testConnection());
    if (result.ok) {
      try {
        await win.loadURL(cfg.serverUrl + "/pdv");
        mode = "online";
        return;
      } catch {
        connectionError = "A API respondeu, mas o painel não carregou. Confira a instalação do frontend no servidor.";
      }
    } else {
      connectionError = result.error;
    }
    if (cfg.testBuild) {
      mode = "diagnostic";
      await win.loadFile(path.join(__dirname, "offline.html"), { query: { diagnose: "1" } });
      return;
    }
  }
  mode = "offline";
  await win.loadURL("pdv://app/pdv");
}

function watchConnection() {
  let probing = false;
  setInterval(async () => {
    if (!win || mode !== "offline" || probing) return;
    probing = true;
    try {
      if (!(await testConnection()).ok || mode !== "offline" || win.isDestroyed()) return;
      const route = new URL(win.webContents.getURL()).pathname || "/pdv";
      await win.loadURL(cfg.serverUrl + route);
      mode = "online";
    } catch {
      mode = "offline";
    } finally {
      probing = false;
    }
  }, CHECK_MS);
}

function isInternal(url) {
  try {
    const target = new URL(url);
    if (target.protocol === "pdv:") return target.hostname === "app";
    if (target.protocol === "file:") return false;
    const server = new URL(cfg.serverUrl);
    return target.origin === server.origin &&
      target.username === "" && target.password === "";
  } catch {
    return false;
  }
}
function openTrustedExternal(url) {
  try {
    const target = new URL(url);
    if (target.protocol === "https:" || target.protocol === "http:") {
      shell.openExternal(target.href).catch((err) => console.error("Falha ao abrir link externo:", err.message));
    }
  } catch {
    // Ignore invalid or unsafe navigation targets.
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 800, minHeight: 540, backgroundColor: "#0b0b0f", show: false,
    title: "Apollo PDV", icon: path.join(__dirname, "build", "icon.png"),
    fullscreen: !!cfg.fullscreen,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.loadFile(path.join(__dirname, "offline.html"));
  win.once("ready-to-show", () => win.show());
  let exitConfirmed = false;
  let exitPromptOpen = false;
  const appWindow = win;
  appWindow.on("close", (event) => {
    if (process.env.PDV_SMOKE || exitConfirmed) return;
    event.preventDefault();
    if (exitPromptOpen) return;
    exitPromptOpen = true;
    let queue;
    try {
      queue = summarizeExitQueue(kvLoad());
    } catch {
      queue = { pending: 0, review: 0, unreadable: true };
    }
    const notices = [];
    if (queue.pending) notices.push(`${queue.pending} venda(s) aguardam sincronização.`);
    if (queue.review) notices.push(`${queue.review} registro(s) aguardam revisão.`);
    if (queue.unreadable) notices.push("Não foi possível verificar toda a fila offline.");
    if (notices.length) notices.push("Confira a fila em Configurações. Os registros locais ficam neste dispositivo ao fechar.");
    void dialog.showMessageBox(appWindow, {
      type: notices.length ? "warning" : "question",
      title: "Apollo PDV",
      message: "Deseja fechar o Apollo PDV?",
      detail: notices.join("\n"),
      buttons: ["Continuar no Apollo", notices.length ? "Fechar mesmo assim" : "Fechar Apollo"],
      defaultId: 0,
      cancelId: 0,
    }).then(async ({ response }) => {
      if (response === 1 && !appWindow.isDestroyed()) {
        exitConfirmed = true;
        try {
          kvLoad()["apollo-operator-locked"] = "1";
          kvSave();
          await clearAuthCookie(appWindow.webContents.session);
        } catch (error) {
          console.error("Apollo: falha ao encerrar a sessão local", error.message);
        }
        appWindow.close();
      }
    }).catch((error) => console.error("Apollo: falha ao confirmar fechamento", error.message))
      .finally(() => { exitPromptOpen = false; });
  });
  // external links (Google Drive, WhatsApp, Google login) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (!isInternal(url)) openTrustedExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!isInternal(url)) { e.preventDefault(); openTrustedExternal(url); } });
  win.webContents.on("will-redirect", (event, url) => {
    if (!isInternal(url)) event.preventDefault();
  });
  win.webContents.on("did-fail-load", (_e, code, _d, url, isMain) => {
    if (isMain && code !== -3 && mode === "online" && !cfg.testBuild && isInternal(url)) {
      mode = "offline";
      void win.loadURL("pdv://app/pdv");
    }
  });
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F11") win.setFullScreen(!win.isFullScreen());
    if (input.type === "keyDown" && input.key === "F5" && mode !== "diagnostic") win.webContents.reload();
  });
  if (process.env.PDV_SMOKE) {
    // CI/dev smoke test: report what loaded and whether the bridge is present, then quit
    win.webContents.on("did-finish-load", async () => {
      const url = win.webContents.getURL();
      if (process.env.PDV_SMOKE === "diagnostic") {
        if (url.includes("offline.html?diagnose=1")) {
          const ready = await win.webContents.executeJavaScript(
            'new Promise(resolve => { const wait = () => { const form = document.querySelector("#connection"); if (form && !form.hidden) { const expected = document.querySelector("#status").textContent.includes("serviço de login"); if (expected) document.querySelector("#connect").click(); resolve(expected); } else setTimeout(wait, 50); }; wait(); })',
          ).catch(() => false);
          if (!ready && mode === "diagnostic") app.exit(2);
        } else if (url === cfg.serverUrl + "/pdv") {
          const connected = await win.webContents.executeJavaScript('!!document.querySelector("#smoke-connected") && typeof window.pdvDesktop === "object"');
          if (!connected) { app.exit(2); return; }
          console.log("PDV_SMOKE_DIAGNOSTIC_PASS");
          setTimeout(() => app.quit(), 500);
        }
        return;
      }
      if (url.endsWith("offline.html")) return;
      const bridge = await win.webContents.executeJavaScript("typeof window.pdvDesktop + ' ' + (window.pdvDesktop && window.pdvDesktop.deviceId)");
      console.log("PDV_SMOKE", mode, url, bridge);
      if (mode !== "offline" || !url.startsWith("pdv://") || !bridge.startsWith("object ")) {
        console.error("PDV_SMOKE_FAIL: tela offline ou ponte desktop indisponivel");
        app.exit(2);
        return;
      }
      const loginReady = await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const deadline = Date.now() + 15000;
          const check = () => {
            const login = document.querySelector('[data-testid="pin-panel"]');
            const ribbon = document.querySelector('[data-testid="apollo-ribbon"]');
            if (login && !ribbon && login.textContent.includes(${JSON.stringify("Versão " + app.getVersion())})) {
              resolve(true);
            } else if (Date.now() >= deadline) {
              resolve(false);
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        })
      `).catch(() => false);
      if (!loginReady) {
        console.error("PDV_SMOKE_FAIL: login inicial ou versao do instalador indisponivel");
        app.exit(2);
        return;
      }
      console.log("PDV_SMOKE_LOGIN_PASS");
      console.log("PDV_SMOKE_VERSION", app.getVersion());
      console.log("PDV_SMOKE_PASS");
      setTimeout(() => app.quit(), 1500);
    });
  }
  void openBest(process.env.PDV_SMOKE?.startsWith("offline"));
}

// At every installed-app launch, lock the renderer and remove only Apollo's
// authentication cookie. Other server preferences and remembered usernames stay intact.
async function clearAuthCookie(targetSession = session.defaultSession) {
  if (!cfg?.serverUrl || !targetSession) return;
  const cookies = await targetSession.cookies.get({ url: cfg.serverUrl, name: "pdv_session" });
  for (const cookie of cookies) {
    const cookieUrl = new URL(cfg.serverUrl);
    cookieUrl.pathname = cookie.path || "/";
    await targetSession.cookies.remove(cookieUrl.href, cookie.name);
  }
}

// ---------- IPC ----------
ipcMain.on("pdv:info", (e) => { e.returnValue = { version: app.getVersion(), deviceId: deviceId() }; });
ipcMain.on("pdv:kv-get", (e, key) => { const v = kvLoad()[key]; e.returnValue = v === undefined ? null : v; });
ipcMain.on("pdv:kv-set", (e, key, value) => {
  // A failed disk write must not look successful to the cashier or poison
  // the in-memory queue with data that was never persisted.
  try {
    const store = kvLoad();
    const existed = Object.prototype.hasOwnProperty.call(store, key);
    const previous = store[key];
    store[key] = value;
    try {
      kvSave();
      e.returnValue = true;
    } catch (err) {
      if (existed) store[key] = previous;
      else delete store[key];
      console.error("Apollo: falha ao salvar dados offline", err.message);
      e.returnValue = false;
    }
  } catch (err) {
    console.error("Apollo: armazenamento offline indisponivel", err.message);
    e.returnValue = false;
  }
});
ipcMain.handle("pdv:config", () => ({ serverUrl: cfg.serverUrl, servers: cfg.servers, startWithWindows: !!cfg.startWithWindows, mode, connectionError, defaultServerUrl: HOMOLOGATION_URL }));
ipcMain.handle("pdv:connect-server", async (event, value) => {
  const source = event.senderFrame?.url;
  if (!cfg.testBuild || mode !== "diagnostic" || event.sender !== win?.webContents
      || !source?.startsWith("file:") || new URL(source).pathname.split("/").pop() !== "offline.html") {
    return { ok: false, error: "Abra o diagnóstico de homologação no aplicativo." };
  }
  const url = cleanUrl(value);
  if (!allowedServerUrl(url, cfg)) {
    return { ok: false, error: "Use o endereço HTTPS de homologação ou um túnel local autorizado." };
  }
  const result = await testConnection(url);
  if (!result.ok) return result;
  const servers = cfg.servers.some((server) => server.url === url)
    ? cfg.servers : [...cfg.servers, { name: "Homologação", url }];
  const next = { ...cfg, serverUrl: url, serverSelected: true, servers };
  saveConfig(next);
  cfg = next;
  await openBest(false, result);
  return { ok: mode === "online", error: connectionError };
});
ipcMain.handle("pdv:test-server", (_e, url) => {
  const serverUrl = cleanUrl(url);
  if (!allowedServerUrl(serverUrl, cfg)) return { ok: false, error: "Endereço inválido: use HTTPS (HTTP apenas para testes locais)" };
  return testConnection(serverUrl);
});
ipcMain.handle("pdv:add-server", (_e, s) => {
  const url = cleanUrl(s.url);
  if (!allowedServerUrl(url, cfg)) return false;
  cfg.servers = [...cfg.servers.filter((x) => x.url !== url), { name: s.name || url, url }];
  saveConfig();
  return true;
});
ipcMain.handle("pdv:remove-server", (_e, url) => {
  if (cleanUrl(url) === cfg.serverUrl) return false;
  cfg.servers = cfg.servers.filter((x) => x.url !== cleanUrl(url));
  saveConfig();
  return true;
});
ipcMain.handle("pdv:use-server", async (_e, url) => {
  const u = cleanUrl(url);
  if (!allowedServerUrl(u, cfg) || !cfg.servers.some((x) => x.url === u)) return false;
  if (!(await testConnection(u)).ok) return false;
  cfg.serverUrl = u;
  cfg.serverSelected = true;
  saveConfig();
  await openBest();
  return true;
});
ipcMain.handle("pdv:printers", async () => {
  const list = await win.webContents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
});
ipcMain.handle("pdv:print", async (_e, { html, deviceName, copies = 1, paper = "80mm" }) => {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(String(html)));
    const microns = paper === "58mm" ? 58000 : paper === "A4" ? 210000 : 80000;
    const opts = { silent: true, printBackground: false, copies: Math.max(1, Math.min(5, copies)), margins: { marginType: "none" } };
    if (deviceName) opts.deviceName = deviceName;
    if (paper !== "A4") opts.pageSize = { width: microns, height: 297000 };
    return await new Promise((resolve) => w.webContents.print(opts, (ok, error) => resolve({ ok, error: ok ? undefined : String(error) })));
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    setTimeout(() => w.destroy(), 1000);
  }
});

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  cfg = loadConfig();
  if (process.env.PDV_SMOKE === "offline-with-server") {
    if (cfg.testBuild || cfg.startWithWindows !== false || !cfg.serverUrl.startsWith("https://")) {
      console.error("PDV_SMOKE_FAIL: configuracao antiga nao foi recuperada corretamente");
      app.exit(2);
      return;
    }
    const result = await probeServer(cfg.serverUrl, net.fetch);
    if (!result.ok) {
      console.error("PDV_SMOKE_FAIL: API HTTPS indisponivel", result.error);
      app.exit(2);
      return;
    }
    console.log("PDV_SMOKE_HTTPS_PASS");
  }
  try {
    kvLoad()["apollo-operator-locked"] = "1";
    kvSave();
    await clearAuthCookie();
  } catch (error) {
    console.error("Apollo: não foi possível preparar uma sessão bloqueada", error.message);
    app.exit(1);
    return;
  }
  Menu.setApplicationMenu(null);
  app.setLoginItemSettings({ openAtLogin: !!cfg.startWithWindows });
  registerAppProtocol();
  createWindow();
  watchConnection();
  enableProductionUpdates();
});
app.on("window-all-closed", () => app.quit());
