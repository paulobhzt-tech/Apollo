"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { exchangeCode } = require("../google-drive-auth-client");

test("troca de codigo usa PKCE e endpoint Google, sem client secret", async () => {
  const response = await exchangeCode({
    clientId:"desktop-id",code:"auth-code",verifier:"verifier",
    redirectUri:"http://127.0.0.1:12345/oauth/google/callback",
    fetchImpl:async (url, opts) => {
      assert.equal(url,"https://oauth2.googleapis.com/token");
      assert.equal(opts.method,"POST");
      assert.equal(opts.body.get("code_verifier"),"verifier");
      assert.equal(opts.body.get("grant_type"),"authorization_code");
      assert.equal(opts.body.has("client_secret"),false);
      return {ok:true,json:async()=>({access_token:"token",token_type:"Bearer"})};
    }
  });
  assert.equal(response.access_token,"token");
});
test("falha do Google nao expoe resposta sensivel", async () => {
  await assert.rejects(exchangeCode({
    clientId:"id",code:"c",verifier:"v",redirectUri:"http://127.0.0.1:12345/oauth/google/callback",
    fetchImpl:async()=>({ok:false,status:400})
  }),/Google recusou/);
});
