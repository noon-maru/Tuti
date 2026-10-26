import assert from "node:assert/strict";
import test from "node:test";
import { preferencesStorage } from "../src/lib/storage/preferencesStorage";
import { serviceTermsAcceptanceCache } from "../src/lib/serviceTermsAcceptanceCache";
import { discardInvalidSession, ensureSession, getSessionSnapshot, logoutAccount } from "../src/lib/auth/session";

test("로그아웃·세션 무효화는 이전 계정 캐시를 지우고 다른 계정으로 넘기지 않는다", async t => {
  const accountA = { userId: "account-a", accessToken: "a".repeat(40) };
  const accountB = { userId: "account-b", accessToken: "b".repeat(40) };
  const stored = new Map([["tuti-session", JSON.stringify(accountA)]]);
  const cleared: string[] = [];
  t.mock.method(preferencesStorage, "getItem", async (key: string) => stored.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { stored.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { stored.delete(key); });
  t.mock.method(serviceTermsAcceptanceCache, "clear", async (userId: string) => { cleared.push(userId); });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.ok(String(input).endsWith("auth/logout"));
    return Response.json({ session: accountB });
  });
  await ensureSession();
  assert.equal(getSessionSnapshot()?.userId, accountA.userId);
  await logoutAccount();
  assert.deepEqual(cleared, [accountA.userId]);
  assert.equal(getSessionSnapshot()?.userId, accountB.userId);
  await discardInvalidSession(accountB);
  assert.deepEqual(cleared, [accountA.userId, accountB.userId]);
  assert.equal(getSessionSnapshot(), null);
  assert.equal(stored.has("tuti-session"), false);
});
