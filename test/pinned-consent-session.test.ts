import assert from "node:assert/strict";
import test from "node:test";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { ensureSession, fetchWithPinnedSession, getSessionSnapshot, logoutAccount } from "@/lib/auth/session";

test("위치 동의 요청을 다른 계정으로 자동 재전송하지 않는다", async (t) => {
  const original = { userId: "original-user", accessToken: "a".repeat(40) };
  const replacement = { userId: "new-user", accessToken: "b".repeat(40) };
  t.mock.method(preferencesStorage, "getItem", async () => JSON.stringify(original));
  t.mock.method(preferencesStorage, "setItem", async () => {});
  await ensureSession();

  await t.test("401이어도 새 익명 세션을 만들거나 철회를 재전송하지 않는다", async (t) => {
    const requests: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(String(url));
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${original.accessToken}`);
      return Response.json({ error: "expired" }, { status: 401 });
    });
    const response = await fetchWithPinnedSession("location-consent", { method: "POST" });
    assert.equal(response.status, 401);
    assert.deepEqual(requests, ["/api/location-consent"]);
    assert.equal(getSessionSnapshot()?.userId, original.userId);
  });

  await t.test("응답 전에 계정이 바뀌면 이전 계정 응답을 반영하지 않는다", async (t) => {
    let complete!: (response: Response) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
      if (String(url).endsWith("auth/logout")) return Response.json({ session: replacement });
      started();
      return new Promise<Response>((resolve) => { complete = resolve; });
    });
    const pending = fetchWithPinnedSession("location-consent", { method: "POST" });
    await ready;
    await logoutAccount();
    complete(Response.json({ consent: { status: "accepted" } }));
    await assert.rejects(pending, /계정이 변경/);
    assert.equal(getSessionSnapshot()?.userId, replacement.userId);
  });
});
