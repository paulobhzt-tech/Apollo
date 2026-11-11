// Test-only HTTP fixture bound to a free loopback port on the Windows runner.
const { createServer } = require("node:http");
const { writeFileSync } = require("node:fs");

let profileChecks = 0;
const server = createServer((request, response) => {
  if (request.url === "/api/") {
    response.writeHead(200, { "Content-Type": "application/json" }).end('{"message":"Apollo PDV API"}');
  } else if (request.url === "/api/auth/profiles") {
    response.writeHead(++profileChecks === 1 ? 503 : 200, { "Content-Type": "application/json" }).end("[]");
  } else if (request.url === "/pdv") {
    response.writeHead(200, { "Content-Type": "text/html" }).end('<title>Apollo smoke</title><main id="smoke-connected">Apollo</main>');
  } else {
    response.writeHead(404).end();
  }
});
server.listen(0, "127.0.0.1", () => writeFileSync(process.argv[2], String(server.address().port)));
