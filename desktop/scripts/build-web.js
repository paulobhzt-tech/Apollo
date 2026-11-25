// Build the React frontend bundled with Apollo PDV for offline display.
// Production requires HTTPS. A loopback HTTP endpoint is allowed ONLY for an
// explicitly selected Windows testing build, reached through an SSH tunnel.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const front = path.resolve(root, "..", "frontend");
const out = path.join(root, "web");

const { allowedServerUrl, cleanUrl, HOMOLOGATION_URL } = require("../server-connection");
const channel = process.env.PDV_BUILD_CHANNEL || "production";
if (!["production", "test"].includes(channel)) {
  throw new Error("PDV_BUILD_CHANNEL deve ser production ou test.");
}
// A test package starts on the isolated HTTPS endpoint. A tunnel can be
// selected in the app once the operator has started it.
const url = channel === "test" ? cleanUrl(process.env.PDV_HOMOLOGATION_URL || HOMOLOGATION_URL) : cleanUrl(process.env.PDV_SERVER_URL || "");
if (!allowedServerUrl(url, { testBuild: channel === "test" })) {
  throw new Error("PDV_SERVER_URL deve apontar a uma origem HTTPS válida.");
}
const defaults = fs.readFileSync(path.join(root, "config.default.json"), "utf8");
const cfg = { ...JSON.parse(defaults), serverUrl: url, testBuild: channel === "test" };
console.log("Canal:", channel, "| Servidor:", url);

execSync("npm ci --no-audit --no-fund --legacy-peer-deps", { cwd: front, stdio: "inherit" });
execSync("npm run build", { cwd: front, stdio: "inherit" });
fs.writeFileSync(path.join(root, "config.build.json"), JSON.stringify(cfg, null, 2) + "\n");
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(front, "dist"), out, { recursive: true });
console.log("Telas integradas ao instalador:", out);
