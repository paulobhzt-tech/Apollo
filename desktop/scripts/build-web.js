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
const url = channel === "test" ? HOMOLOGATION_URL : cleanUrl(process.env.PDV_SERVER_URL || "");
if (!allowedServerUrl(url, { testBuild: channel === "test" })) {
  throw new Error("PDV_SERVER_URL deve apontar a uma origem HTTPS válida.");
}
const configPath = path.join(root, "config.default.json");
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
cfg.serverUrl = url;
cfg.testBuild = channel === "test";
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");
console.log("Canal:", channel, "| Servidor:", url);

// Emergent's preview-only tarballs are not required by the production build.
// They are hosted externally and can make Windows installer CI fail even when
// the application itself compiles. Match the dependency strategy of PWA CI.
// Restore package.json after the build so local developer configuration remains intact.
const manifest = path.join(front, "package.json");
const originalManifest = fs.readFileSync(manifest, "utf8");
try {
  const pkg = JSON.parse(originalManifest);
  if (pkg.devDependencies) {
    delete pkg.devDependencies["@emergentbase/overlay"];
    delete pkg.devDependencies["@emergentbase/visual-edits"];
  }
  fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2) + "\n");
  execSync("npm install --no-audit --no-fund --legacy-peer-deps", { cwd: front, stdio: "inherit", shell: true });
  execSync("npm run build", { cwd: front, stdio: "inherit", shell: true });
} finally {
  fs.writeFileSync(manifest, originalManifest);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(front, "dist"), out, { recursive: true });
console.log("Telas integradas ao instalador:", out);
