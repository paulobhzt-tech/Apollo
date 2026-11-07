// Build the React frontend bundled with Apollo PDV for offline display.
// Production requires HTTPS. A loopback HTTP endpoint is allowed ONLY for an
// explicitly selected Windows testing build, reached through an SSH tunnel.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const front = path.resolve(root, "..", "frontend");
const out = path.join(root, "web");

const channel = process.env.PDV_BUILD_CHANNEL || "production";
const url = String(process.env.PDV_SERVER_URL || "").trim().replace(/[/]+$/, "");
if (!["production", "test"].includes(channel)) {
  throw new Error("PDV_BUILD_CHANNEL deve ser production ou test.");
}
function allowedServer(value, mode) {
  try {
    const target = new URL(value);
    if (target.username || target.password || target.search || target.hash) return false;
    if (target.pathname !== "/") return false;
    if (mode === "production") return target.protocol === "https:" && !!target.hostname;
    return (target.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) ||
      (target.protocol === "https:" && !!target.hostname);
  } catch {
    return false;
  }
}
if (!allowedServer(url, channel)) {
  throw new Error(channel === "production"
    ? "Versao comercial exige PDV_SERVER_URL HTTPS real."
    : "Versao de teste aceita apenas HTTPS ou HTTP local (localhost/127.0.0.1).");
}
const configPath = path.join(root, "config.default.json");
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
cfg.serverUrl = url;
cfg.testBuild = channel === "test";
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");
console.log("Canal:", channel, "| Servidor:", url);

// Install with Yarn in the frontend directory: npm Arborist can fail on Windows
// with "Cannot read properties of null (reading edgesOut)" for this dependency tree.
execSync("yarn install --non-interactive --no-progress", { cwd: front, stdio: "inherit", shell: true });
execSync("npm run build", { cwd: front, stdio: "inherit", shell: true });
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(front, "dist"), out, { recursive: true });
console.log("Telas integradas ao instalador:", out);
