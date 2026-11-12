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

const HOMOLOGATION_URL = "https://teste.apollo-pdv.com";

function allowedServerUrl(value, config) {
  if (!validServerUrl(value, config.testBuild)) return false;
  if (!config.testBuild) return true;
  const target = new URL(value);
  return target.origin === HOMOLOGATION_URL || LOOPBACK.includes(target.hostname);
}

function parseConfig(raw) {
  const config = JSON.parse(raw.replace(/^\uFEFF/, ""));
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("A configuração precisa ser um objeto JSON.");
  }
  return config;
}

function resolveServerConfig(defaults, saved) {
  const config = { ...defaults, ...saved, testBuild: defaults.testBuild === true };
  const obsoleteTunnel = config.testBuild && saved.testBuild === true && !saved.serverSelected
    && ["http://localhost:18080", "http://127.0.0.1:18080"].includes(saved.serverUrl);
  const savedUrl = cleanUrl(obsoleteTunnel ? defaults.serverUrl : config.serverUrl);
  config.serverUrl = allowedServerUrl(savedUrl, config) ? savedUrl : defaults.serverUrl;
  config.servers = Array.isArray(config.servers)
    ? config.servers.filter((server) => allowedServerUrl(server?.url, config))
    : [];
  if (!config.servers.some((server) => server.url === config.serverUrl)) {
    config.servers.push({ name: "Servidor", url: config.serverUrl });
  }
  return config;
}

async function probeServer(serverUrl, fetch, { checkLogin = false } = {}) {
  try {
    const options = {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    };
    const response = await fetch(serverUrl + "/api/", options);
    if (!response.ok) return { ok: false, error: "HTTP " + response.status };
    if (response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      const payload = await response.json();
      if (APOLLO_MESSAGES.includes(payload?.message)) {
        if (!checkLogin) return { ok: true };
        const profiles = await fetch(serverUrl + "/api/auth/profiles", options);
        if (profiles.ok && profiles.headers.get("content-type")?.toLowerCase().includes("application/json")
            && Array.isArray(await profiles.json())) return { ok: true };
        return { ok: false, error: "A API respondeu, mas o serviço de login está indisponível. Confira o backend e o banco de homologação." };
      }
    }
    return { ok: false, error: "O endereço não retornou a API Apollo PDV." };
  } catch (err) {
    const details = [err.name, err.code, err.cause?.code, err.message].filter(Boolean).join(" ");
    if (/timeout|timed out|ERR_TIMED_OUT/i.test(details)) {
      return { ok: false, error: "Tempo limite ao consultar o servidor. Confira a rede, o túnel e o backend de homologação." };
    }
    if (/certificate|cert_|ERR_SSL/i.test(details)) {
      return { ok: false, error: "Falha no certificado HTTPS do servidor. Confira a validade do certificado de homologação." };
    }
    if (/ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(details)) {
      return { ok: false, error: "Endereço do servidor não encontrado. Confira o DNS de homologação." };
    }
    if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(details)) {
      return { ok: false, error: "Conexão recusada. Confira se o servidor ou o túnel de homologação está iniciado." };
    }
    return { ok: false, error: "Não foi possível acessar o servidor. Confira o endereço e a conexão de homologação." };
  }
}

module.exports = { cleanUrl, validServerUrl, resolveServerConfig, probeServer, allowedServerUrl, HOMOLOGATION_URL, parseConfig };
