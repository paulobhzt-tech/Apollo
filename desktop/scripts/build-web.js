// Builds the React frontend and copies it to desktop/web (the offline copy shipped inside the installer).
// Optional: set PDV_SERVER_URL to write the published address into config.default.json.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const front = path.resolve(root, "..", "frontend");
const out = path.join(root, "web");

const url = process.env.PDV_SERVER_URL;
if (url) {
  const f = path.join(root, "config.default.json");
  const cfg = JSON.parse(fs.readFileSync(f, "utf8"));
  cfg.serverUrl = url.replace(/\/+$/, "");
  fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + "\n");
  console.log("Servidor:", cfg.serverUrl);
}

execSync("yarn install --frozen-lockfile", { cwd: front, stdio: "inherit", shell: true });
execSync("yarn vite build", { cwd: front, stdio: "inherit", shell: true });
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(front, "dist"), out, { recursive: true });
console.log("Cópia offline da tela pronta em", out);
