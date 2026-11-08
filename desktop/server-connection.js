const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];
const APOLLO_MESSAGES = ["Apollo PDV API", "API Apollo PDV"];
const cleanUrl = (value) => String(value).trim().replace(/\/+$/, "");

function validServerUrl(value, testBuild) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return false;
    if (url.protocol === "https:") return !!url.hostname;
    return testBuild === true && url.protocol === "http:" && LOOPBACK.includes(url.hostname);
  } catch {
    return false;
  }
}

function resolveServerConfig(defaults, saved) {
  const config = { ...defaults, ...saved, testBuild: defaults.testBuild === true };
  const savedUrl = cleanUrl(config.serverUrl);
  config.serverUrl = validServerUrl(savedUrl, config.testBuild) ? savedUrl : defaults.serverUrl;
  config.servers = Array.isArray(config.servers)
    ? config.servers.filter((server) => validServerUrl(server?.url, config.testBuild))
    : [];
  if (!config.servers.some((server) => server.url === config.serverUrl)) {
    config.servers.push({ name: "Servidor", url: config.serverUrl });
  }
  return config;
}

async function probeServer(serverUrl, fetch) {
  try {
    const response = await fetch(serverUrl + "/api/", {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, error: "HTTP " + response.status };
    if (response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      const payload = await response.json();
      if (APOLLO_MESSAGES.includes(payload?.message)) return { ok: true };
    }
    return { ok: false, error: "O endereço não retornou a API Apollo PDV." };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

module.exports = { cleanUrl, validServerUrl, resolveServerConfig, probeServer };
