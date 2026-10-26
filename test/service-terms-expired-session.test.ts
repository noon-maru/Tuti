import assert from "node:assert/strict";
import test from "node:test";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { ensureSession, getSessionSnapshot } from "@/lib/auth/session";
import { submitServiceTerms, ServiceTermsSessionExpiredError } from "@/lib/serviceTerms";
import documents from "@/shared/legal/finalizedDocuments.json";

test("동의가 401이면 정확한 세션만 비우고 자동 계정 생성·동의 재전송 없이 직접 재확인을 요구한다", async t => {
  const original = { userId: "deleted-user", accessToken: "x".repeat(40) };
  const data = new Map([["tuti-session", JSON.stringify(original)], ["tuti-harumadi-pdf-v1:deleted-user", "draft"]]);
  t.mock.method(preferencesStorage, "getItem", async (key: string) => data.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { data.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { data.delete(key); });
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(input));
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${original.accessToken}`);
    return Response.json({ error: "expired" }, { status: 401 });
  });
  await ensureSession();
  const offer = { ...documents["service-terms"], publishedAt: "2026-10-23T05:11:40.612Z", effectiveAt: "2026-10-23T05:11:40.612Z", accepted: false };
  await assert.rejects(submitServiceTerms(offer, { ageConfirmed: true, importantTermsConfirmed: true }), ServiceTermsSessionExpiredError);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith("/service-terms"));
  assert.equal(data.has("tuti-session"), false);
  assert.equal(getSessionSnapshot(), null);
  assert.equal(data.get("tuti-harumadi-pdf-v1:deleted-user"), "draft");
});
