// Exposes a minimal, typed bridge (window.pdvDesktop). No Node APIs reach the web page.
const { contextBridge, ipcRenderer } = require("electron");

const info = ipcRenderer.sendSync("pdv:info");

contextBridge.exposeInMainWorld("pdvDesktop", {
  isDesktop: true,
  version: info.version,
  deviceId: info.deviceId,
  kvGet: (key) => ipcRenderer.sendSync("pdv:kv-get", String(key)),
  kvSet: (key, value) => ipcRenderer.sendSync("pdv:kv-set", String(key), String(value)),
  printers: () => ipcRenderer.invoke("pdv:printers"),
  print: (opts) => ipcRenderer.invoke("pdv:print", opts),
  config: () => ipcRenderer.invoke("pdv:config"),
  testServer: (url) => ipcRenderer.invoke("pdv:test-server", String(url)),
  addServer: (s) => ipcRenderer.invoke("pdv:add-server", { name: String(s.name), url: String(s.url) }),
  removeServer: (url) => ipcRenderer.invoke("pdv:remove-server", String(url)),
  useServer: (url) => ipcRenderer.invoke("pdv:use-server", String(url)),
});
