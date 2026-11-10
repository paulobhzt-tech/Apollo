const assert = require("node:assert/strict");
const test = require("node:test");
const { createPkce, authorizeUrl, validateCallback, SCOPE } = require("../google-drive-oauth");
test("PKCE generates unique verifier/state and correct challenge", () => {
  const a = createPkce(), b = createPkce();
  assert.notEqual(a.state,b.state);
  assert.notEqual(a.verifier,b.verifier);
  assert.match(a.challenge,/^[A-Za-z0-9_-]{43}$/);
});
test("authorization uses drive.file scope, state and localhost callback", () => {
  const p=createPkce();
  const url=new URL(authorizeUrl({clientId:"test-client",port:54321,challenge:p.challenge,state:p.state}));
  assert.equal(url.origin,"https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"),SCOPE);
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("redirect_uri"),"http://127.0.0.1:54321/oauth/google/callback");
});
test("callback rejects CSRF and missing code", () => {
  assert.throws(()=>validateCallback({expectedState:"abc",receivedState:"xyz",code:"code"}));
  assert.throws(()=>validateCallback({expectedState:"abc",receivedState:"abc"}));
  assert.equal(validateCallback({expectedState:"abc",receivedState:"abc",code:"ok"}),"ok");
});
