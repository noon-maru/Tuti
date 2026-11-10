import assert from "node:assert/strict";
import test from "node:test";
import { ensureSession } from "../src/lib/auth/session";
import { preferencesStorage } from "../src/lib/storage/preferencesStorage";
import { fetchRecentHarumadis } from "../src/lib/harumadis";

test("최근 조회는 현재 계정에 고정하고 1.2초 제한을 넘으면 중단해 일반 목록 진행을 허용한다", async t => {
  const session = { userId: "recent-owner", accessToken: "r".repeat(40) };
  t.mock.method(preferencesStorage, "getItem", async () => JSON.stringify(session));
  t.mock.method(preferencesStorage, "setItem", async () => {});
  await ensureSession();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let started!: () => void, calls = 0;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    calls++; assert.match(String(url), /harumadis\/recent$/);
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${session.accessToken}`);
    started();
    return await new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  });
  const pending = fetchRecentHarumadis(session.userId);
  await waiting; t.mock.timers.tick(1200);
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(fetchRecentHarumadis("other-owner"), /계정/);
  assert.equal(calls, 1);
});
