import assert from "node:assert/strict";
import test from "node:test";
import { preferencesStorage } from "../src/lib/storage/preferencesStorage";
import { ensureSession, logoutAccount } from "../src/lib/auth/session";
import { fetchJournalPlaceSuggestions } from "../src/lib/placeSuggestions";

test("계정이 바뀌면 늦은 개인 장소 제안과 이전 계정의 검색 요청을 버린다", async t => {
  const original = { userId: "old-owner", accessToken: "a".repeat(40) }, replacement = { userId: "new-owner", accessToken: "b".repeat(40) };
  t.mock.method(preferencesStorage, "getItem", async () => JSON.stringify(original));
  t.mock.method(preferencesStorage, "setItem", async () => {}); t.mock.method(preferencesStorage, "removeItem", async () => {});
  await ensureSession();
  let resolve!: (data: unknown) => void, notify!: () => void;
  const started = new Promise<void>(done => { notify = done; });
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (String(url).endsWith("auth/logout")) return Response.json({ session: replacement });
    assert.equal(new URL(String(url), "https://tuti.test").searchParams.get("q"), "양평");
    const response = Response.json({}); response.json = () => { notify(); return new Promise(done => { resolve = done; }); }; return response;
  });
  const pending = fetchJournalPlaceSuggestions(original, " 양평 ");
  await started; await logoutAccount(); resolve({ history: [{ name: "old-private-place" }], places: [] });
  await assert.rejects(pending, /계정이 변경/);
  let requests = 0; t.mock.method(globalThis, "fetch", async () => { requests++; return Response.json({}); });
  await assert.rejects(fetchJournalPlaceSuggestions(original, "양평"), /계정이 변경/);
  assert.equal(requests, 0);
});
