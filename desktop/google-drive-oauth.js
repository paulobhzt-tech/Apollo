"use strict";
// Isolated OAuth2 PKCE helpers for a per-establishment Google Drive connection.
// No tokens or client secrets are stored by this module.
const crypto = require("node:crypto");
const CALLBACK_HOST = "127.0.0.1";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
function createPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: base64url(crypto.randomBytes(24)) };
}
function authorizeUrl({ clientId, port, challenge, state }) {
  if (!/^[0-9]{4,5}$/.test(String(port)) || Number(port) > 65535) throw new Error("Porta de retorno invalida");
  if (!clientId || !challenge || !state) throw new Error("OAuth nao configurado");
  const redirect = `http://${CALLBACK_HOST}:${port}/oauth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [k,v] of Object.entries({
    client_id: clientId, redirect_uri: redirect, response_type: "code",
    scope: SCOPE, code_challenge: challenge, code_challenge_method: "S256",
    state, access_type: "offline", prompt: "consent"
  })) url.searchParams.set(k,v);
  return url.toString();
}
function validateCallback({ expectedState, receivedState, code, error }) {
  if (!expectedState || !receivedState ||
      !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(receivedState))) {
    throw new Error("OAuth state invalido");
  }
  if (error) throw new Error("Autorizacao Google recusada");
  if (typeof code !== "string" || !code.trim()) throw new Error("Codigo OAuth ausente");
  return code;
}
module.exports = { SCOPE, createPkce, authorizeUrl, validateCallback };
