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
