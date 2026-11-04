// Apollo PDV — Windows desktop shell (Electron).
// Online: opens the published system (always the latest version, same data as browsers and phones).
// Offline: opens the copy of the screens bundled in the installer (pdv://app) so counter sales keep being
// recorded; they are stored encrypted on disk and synced automatically when the connection returns.
const { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell, Menu } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CHECK_MS = 15000;
let win = null;
let mode = "online";

// ---------- config (userData/config.json, editable without reinstalling) ----------
const userDir = () => app.getPath("userData");
function loadConfig() {
  const def = JSON.parse(fs.readFileSync(path.join(__dirname, "config.default.json"), "utf8"));
  const f = path.join(userDir(), "config.json");
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(def, null, 2));
  try {
    const cfg = { ...def, ...JSON.parse(fs.readFileSync(f, "utf8")) };
    cfg.serverUrl = String(cfg.serverUrl).replace(/\/+$/, "");
    cfg.servers = Array.isArray(cfg.servers) && cfg.servers.length ? cfg.servers : [{ name: "Servidor na nuvem", url: cfg.serverUrl }];
    if (!cfg.servers.some((s) => s.url === cfg.serverUrl)) cfg.servers.push({ name: "Servidor", url: cfg.serverUrl });
    return cfg;
  } catch {
    return def;
  }
}
let cfg;
function saveConfig() {
  fs.writeFileSync(path.join(userDir(), "config.json"), JSON.stringify(cfg, null, 2));
}
const cleanUrl = (u) => String(u).trim().replace(/\/+$/, "");

// ---------- encrypted key/value store (offline queue, cached menu, last operator) ----------
const kvFile = () => path.join(userDir(), "pdv-dados.bin");
let kvCache = null;
function kvLoad() {
  if (kvCache) return kvCache;
  try {
    const raw = fs.readFileSync(kvFile());
    const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
    kvCache = JSON.parse(txt);
  } catch {
    kvCache = {};
  }
  return kvCache;
}
function kvSave() {
  const txt = JSON.stringify(kvCache || {});
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, "utf8");
  const tmp = kvFile() + ".tmp";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, kvFile()); // atomic replace: a power cut never leaves a half-written queue
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

async function serverReachable() {
  try {
    const r = await net.fetch(cfg.serverUrl + "/api/", { method: "GET", cache: "no-store" });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function openBest() {
  const online = await serverReachable();
  const target = online ? cfg.serverUrl + "/pdv" : "pdv://app/pdv";
  mode = online ? "online" : "offline";
  await win.loadURL(target).catch(() => win.loadURL("pdv://app/pdv"));
}

function watchConnection() {
  setInterval(async () => {
    if (!win || mode !== "offline") return;
    if (await serverReachable()) {
      mode = "online";
      const route = new URL(win.webContents.getURL()).pathname || "/pdv";
      win.loadURL(cfg.serverUrl + route); // the web app flushes the shared offline queue on load
    }
  }, CHECK_MS);
}

function isInternal(url) {
  return url.startsWith(cfg.serverUrl) || url.startsWith("pdv://") || url.startsWith("file://");
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 1024, minHeight: 640, backgroundColor: "#0b0b0f", show: false,
    title: "Apollo PDV", icon: path.join(__dirname, "build", "icon.png"),
    fullscreen: !!cfg.fullscreen,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.loadFile(path.join(__dirname, "offline.html"));
  win.once("ready-to-show", () => win.show());
  // external links (Google Drive, WhatsApp, Google login) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (!isInternal(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!isInternal(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on("did-fail-load", (_e, code, _d, url, isMain) => {
    if (isMain && code !== -3 && url.startsWith(cfg.serverUrl)) { mode = "offline"; win.loadURL("pdv://app/pdv"); }
  });
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F11") win.setFullScreen(!win.isFullScreen());
    if (input.type === "keyDown" && input.key === "F5") win.webContents.reload();
  });
  openBest();
  if (process.env.PDV_SMOKE) {
    // CI/dev smoke test: report what loaded and whether the bridge is present, then quit
    win.webContents.on("did-finish-load", async () => {
      const url = win.webContents.getURL();
      if (url.endsWith("offline.html")) return;
      const bridge = await win.webContents.executeJavaScript("typeof window.pdvDesktop + ' ' + (window.pdvDesktop && window.pdvDesktop.deviceId)");
      console.log("PDV_SMOKE", mode, url, bridge);
      setTimeout(() => app.quit(), 1500);
    });
  }
}

// ---------- IPC ----------
ipcMain.on("pdv:info", (e) => { e.returnValue = { version: app.getVersion(), deviceId: deviceId() }; });
ipcMain.on("pdv:kv-get", (e, key) => { const v = kvLoad()[key]; e.returnValue = v === undefined ? null : v; });
ipcMain.on("pdv:kv-set", (e, key, value) => { kvLoad()[key] = value; kvSave(); e.returnValue = true; });
ipcMain.handle("pdv:config", () => ({ serverUrl: cfg.serverUrl, servers: cfg.servers, startWithWindows: !!cfg.startWithWindows, mode }));
ipcMain.handle("pdv:test-server", async (_e, url) => {
  try {
    const r = await net.fetch(cleanUrl(url) + "/api/", { cache: "no-store" });
    return { ok: r.status < 500, error: r.status >= 500 ? "HTTP " + r.status : undefined };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});
ipcMain.handle("pdv:add-server", (_e, s) => {
  const url = cleanUrl(s.url);
  if (!/^https?:\/\/[^\s]+$/.test(url)) return false;
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
  if (!cfg.servers.some((x) => x.url === u)) return false;
  cfg.serverUrl = u;
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
app.whenReady().then(() => {
  cfg = loadConfig();
  Menu.setApplicationMenu(null);
  app.setLoginItemSettings({ openAtLogin: !!cfg.startWithWindows });
  registerAppProtocol();
  createWindow();
  watchConnection();
});
app.on("window-all-closed", () => app.quit());
