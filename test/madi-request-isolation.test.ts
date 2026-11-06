import assert from "node:assert/strict";
import test from "node:test";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { ensureSession, logoutAccount } from "@/lib/auth/session";
import { createJournalEntry, fetchJournalEntries } from "@/lib/tutiApi";

test("마디 API는 요청 시작부터 본문 해독 완료까지 같은 세션에 고정한다", async t => {
  const original = { userId: "madi-original", accessToken: "a".repeat(40) };
  const replacement = { userId: "madi-next", accessToken: "b".repeat(40) };
  t.mock.method(preferencesStorage, "getItem", async () => JSON.stringify(original));
  t.mock.method(preferencesStorage, "setItem", async () => {});
  t.mock.method(preferencesStorage, "removeItem", async () => {});
  await ensureSession();
  let complete!: (value: unknown) => void, start!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (String(url).endsWith("auth/logout")) return Response.json({ session: replacement });
    const response = Response.json({});
    response.json = () => { start(); return new Promise(resolve => { complete = resolve; }); };
    return response;
  });
  const pending = fetchJournalEntries(original);
  await started; await logoutAccount(); complete({ entries: [] });
  await assert.rejects(pending, /계정이 변경/);
  let posts = 0;
  t.mock.method(globalThis, "fetch", async () => { posts++; return Response.json({}); });
  await assert.rejects(createJournalEntry({ title: "", content: "synthetic", placeName: "", image: null }, original), /계정이 변경/);
  assert.equal(posts, 0, "늦은 작성 요청을 다음 계정으로 보내지 않는다");
});
