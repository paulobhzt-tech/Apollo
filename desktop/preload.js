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
});
