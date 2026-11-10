"use strict";
// Native desktop OAuth callback: listens on loopback only, never logs authorization codes.
const http = require("node:http");
const { createPkce, authorizeUrl, validateCallback } = require("./google-drive-oauth");
const CALLBACK_PATH = "/oauth/google/callback";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TIMEOUT_MS = 120000;

async function exchangeCode({ clientId, code, verifier, redirectUri, fetchImpl = fetch }) {
  const body = new URLSearchParams({
    client_id: clientId, code, code_verifier: verifier,
    redirect_uri: redirectUri, grant_type: "authorization_code"
  });
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Google recusou a troca do codigo OAuth");
  const data = await response.json();
  if (!data.access_token || data.token_type?.toLowerCase() !== "bearer") {
    throw new Error("Resposta OAuth invalida");
  }
  return data;
}

async function connectGoogleDrive({ clientId, openExternal, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  if (typeof clientId !== "string" || !clientId.trim()) throw new Error("Client ID Google ausente");
  if (typeof openExternal !== "function") throw new Error("Abertura do navegador indisponivel");
  const pkce = createPkce();
  let server;
  let timer;
  try {
    const result = new Promise((resolve, reject) => {
      server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, "http://127.0.0.1");
          if (req.method !== "GET" || url.pathname !== CALLBACK_PATH) {
            res.writeHead(404); res.end(); return;
          }
          const code = validateCallback({
            expectedState: pkce.state, receivedState: url.searchParams.get("state"),
            code: url.searchParams.get("code"), error: url.searchParams.get("error")
          });
          // Return a generic page; never expose tokens or codes in HTML.
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          res.end("<!doctype html><html lang='pt-br'><meta charset='utf-8'><body>Autorização recebida. Você pode fechar esta janela.</body></html>");
          resolve(code);
        } catch (err) {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          res.end("Autorização inválida. Volte ao Apollo.");
          reject(err);
        }
      });
      server.once("error", reject);
    });
    await new Promise((resolve, reject) => {
      server.listen(0, "127.0.0.1", resolve);
      server.once("error", reject);
    });
    const port = server.address().port;
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
    const url = authorizeUrl({ clientId, port, challenge: pkce.challenge, state: pkce.state });
    const codePromise = Promise.race([
      result,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Tempo de autorização esgotado")), timeoutMs); })
    ]);
    await openExternal(url);
    const code = await codePromise;
    return await exchangeCode({ clientId, code, verifier: pkce.verifier, redirectUri, fetchImpl });
  } finally {
    if (timer) clearTimeout(timer);
    if (server?.listening) server.close();
  }
}
module.exports = { connectGoogleDrive, exchangeCode };
