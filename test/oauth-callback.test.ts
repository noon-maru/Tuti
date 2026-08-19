import assert from "node:assert/strict";
import test from "node:test";
import { readOAuthCallbackParameters } from "../src/server/auth/oauthCallback";

test("OAuth GET 콜백의 쿼리 파라미터를 읽는다", async () => {
  const parameters = await readOAuthCallbackParameters(
    new Request("https://tuti.today/api/auth/oauth/google/callback?code=code&state=state"),
  );

  assert.equal(parameters.get("code"), "code");
  assert.equal(parameters.get("state"), "state");
});

test("Apple form_post 콜백의 폼 파라미터를 읽는다", async () => {
  const parameters = await readOAuthCallbackParameters(
    new Request("https://tuti.today/api/auth/oauth/apple/callback", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: "apple-code", state: "apple-state" }),
    }),
  );

  assert.equal(parameters.get("code"), "apple-code");
  assert.equal(parameters.get("state"), "apple-state");
});
