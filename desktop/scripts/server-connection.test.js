const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("node:http");
const { test } = require("node:test");
const { resolveServerConfig, probeServer } = require("../server-connection");

const defaults = { serverUrl: "https://pdv.apollo-pdv.com", startWithWindows: true };
const local = "http://localhost:18080";

test("a production upgrade replaces a saved test tunnel and preserves other settings", () => {
  const backup = { name: "Reserva", url: "https://reserva.example.com" };
  const config = resolveServerConfig(defaults, {
    testBuild: true,
    serverUrl: local,
    servers: [{ name: "Teste", url: local }, backup],
    startWithWindows: false,
  });
  assert.equal(config.testBuild, false);
  assert.equal(config.serverUrl, defaults.serverUrl);
  assert.equal(config.startWithWindows, false);
  assert.deepEqual(config.servers, [backup, { name: "Servidor", url: defaults.serverUrl }]);
  assert.equal(resolveServerConfig(defaults, { serverUrl: backup.url }).serverUrl, backup.url);
});

test("a test installer can still use its local tunnel", () => {
  const config = resolveServerConfig({ serverUrl: local, testBuild: true }, {
    serverUrl: local,
    testBuild: false,
  });
  assert.equal(config.testBuild, true);
  assert.equal(config.serverUrl, local);
});

test("the loopback probe recognizes both Apollo responses and rejects unrelated HTTP services", async (t) => {
  let reply = { status: 200, body: { message: "Apollo PDV API" } };
  const server = createServer((request, response) => {
    if (request.url !== "/api/") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(reply.status, { "Content-Type": "application/json", ...reply.headers });
    response.end(JSON.stringify(reply.body));
  });
  t.after(() => server.close());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = "http://127.0.0.1:" + server.address().port;
  assert.deepEqual(await probeServer(url, fetch), { ok: true });
  reply.body.message = "API Apollo PDV";
  assert.deepEqual(await probeServer(url, fetch), { ok: true });
  reply.body.message = "Outro serviço";
  assert.equal((await probeServer(url, fetch)).ok, false);
  reply.status = 404;
  assert.deepEqual(await probeServer(url, fetch), { ok: false, error: "HTTP 404" });
  reply = { status: 302, headers: { Location: "/api/" } };
  assert.equal((await probeServer(url, fetch)).ok, false);
});

test("the homologation installer replaces the obsolete tunnel default and rejects saved production URLs", () => {
  const { HOMOLOGATION_URL, allowedServerUrl } = require("../server-connection");
  const testDefaults = { serverUrl: HOMOLOGATION_URL, testBuild: true };
  const config = resolveServerConfig(testDefaults, {
    serverUrl: local, testBuild: true, startWithWindows: false,
    servers: [{ name: "Produção", url: defaults.serverUrl }, { name: "Túnel", url: local }],
  });
  assert.equal(config.serverUrl, HOMOLOGATION_URL);
  assert.equal(config.startWithWindows, false);
  assert.equal(config.servers.some((server) => server.url === defaults.serverUrl), false);
  assert.equal(resolveServerConfig(testDefaults, { serverUrl: local, testBuild: true, serverSelected: true }).serverUrl, local);
  assert.equal(resolveServerConfig(testDefaults, { serverUrl: defaults.serverUrl }).serverUrl, HOMOLOGATION_URL);
  assert.equal(allowedServerUrl("http://192.168.0.10:8001", testDefaults), false);
  assert.equal(allowedServerUrl("https://teste.apollo-pdv.com.evil.example", testDefaults), false);
});

test("the readiness probe blocks login when the API can identify itself but the database route fails", async () => {
  const visited = [];
  const reply = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
  let profiles = reply({}, 503);
  const mockedFetch = async (url) => {
    visited.push(new URL(url).pathname);
    return url.endsWith("/api/") ? reply({ message: "Apollo PDV API" }) : profiles;
  };
  assert.match((await probeServer(local, mockedFetch, { checkLogin: true })).error, /serviço de login/);
  assert.deepEqual(visited, ["/api/", "/api/auth/profiles"]);
  profiles = reply([]);
  assert.deepEqual(await probeServer(local, mockedFetch, { checkLogin: true }), { ok: true });
});

test("connection errors distinguish an absent listener, timeout and invalid certificate", async () => {
  for (const [code, expected] of [
    ["ECONNREFUSED", /Conexão recusada/],
    ["ERR_TIMED_OUT", /Tempo limite/],
    ["ERR_CERT_AUTHORITY_INVALID", /certificado HTTPS/],
    ["ERR_NAME_NOT_RESOLVED", /Confira o DNS/],
  ]) {
    const result = await probeServer(local, async () => { throw Object.assign(new Error("network"), { code }); });
    assert.equal(result.ok, false);
    assert.match(result.error, expected);
  }
});

test("reads a Windows UTF-8 BOM config without replacing the selected server", () => {
  const { HOMOLOGATION_URL, parseConfig } = require("../server-connection");
  const serverUrl = "http://127.0.0.1:18081";
  const saved = parseConfig("\uFEFF" + JSON.stringify({ serverUrl, serverSelected: true, fullscreen: true }));
  const config = resolveServerConfig({ serverUrl: HOMOLOGATION_URL, testBuild: true }, saved);
  assert.equal(config.serverUrl, serverUrl);
  assert.equal(config.fullscreen, true);
});

test("malformed or non-object config never masquerades as an empty config", () => {
  const { parseConfig } = require("../server-connection");
  for (const input of ["\uFEFF{", "null", "[]", "18080"]) {
    assert.throws(() => parseConfig(input));
  }
});
