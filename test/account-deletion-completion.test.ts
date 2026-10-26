import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { deleteAccount, ensureSession, getSessionSnapshot } from "@/lib/auth/session";

test("일반 이용과 권리 행사 모드의 화면 키를 고정해 삭제 완료 상태와 세션 훅을 유지한다", () => {
  const shell = readFileSync("src/features/tuti/components/TutiAppShell.tsx", "utf8");
  const providers = [...shell.matchAll(/<LocationAccessProvider([^>]*)>\{children\}<\/LocationAccessProvider>/g)];
  assert.equal(providers.length, 2);
  for (const provider of providers) assert.match(provider[1], /key="tuti-content"/);
  assert.doesNotMatch(providers.map(provider => provider[1]).join(""), /userId|accessToken/);
  const screen = readFileSync("src/features/tuti/screens/account/AccountScreen.tsx", "utf8");
  assert.match(screen, /setDeletionReference\(result.deletionReference\)/);
  assert.match(screen, /계정과 데이터를 삭제했어요/);
});

test("삭제 완료의 다시 시작은 entry로 이동하고 일반 뒤로가기는 설정으로 이동한다", () => {
  const flow = readFileSync("src/features/tuti/flows/AccountFlow.tsx", "utf8");
  const screen = readFileSync("src/features/tuti/screens/account/AccountScreen.tsx", "utf8");
  assert.match(flow, /onRestart=\{\(\) => router.replace\("\/entry"\)\}/);
  assert.match(flow, /onBack=\{\(\) => router.replace\("\/settings"\)\}/);
  assert.match(screen, /<DeletionCompleteButton type="button" onClick=\{onRestart\}>/);
});

test("삭제 실패는 기존 세션을 유지하고 성공 시 한 요청으로 영수증 반환·로컬 정리를 끝낸다", async t => {
  const session = { userId: "delete-user", accessToken: "d".repeat(40) };
  const stored = new Map([
    ["tuti-session", JSON.stringify(session)],
    ["tuti-harumadi-pdf-v1:delete-user", "draft"],
    ["tuti-service-terms-acceptance:delete-user", "receipt"],
  ]);
  t.mock.method(preferencesStorage, "getItem", async (key: string) => stored.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { stored.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { stored.delete(key); });
  // 약관 캐시는 별도 저장소를 사용하므로 해당 정리도 같은 테스트 저장소에서 관찰한다.
  const { serviceTermsAcceptanceCache } = await import("@/lib/serviceTermsAcceptanceCache");
  t.mock.method(serviceTermsAcceptanceCache, "clear", async (id: string) => { stored.delete(`tuti-service-terms-acceptance:${id}`); });
  let fail = true, deletes = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.ok(String(input).endsWith("/account"), "삭제 완료 전후 새 익명 계정을 생성하지 않는다");
    assert.equal(init?.method, "DELETE");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${session.accessToken}`);
    deletes++;
    return fail ? Response.json({ error: "test failure" }, { status: 500 }) : Response.json({ deleted: true, deletionReference: "single-delete-receipt" });
  });
  await ensureSession();
  await assert.rejects(deleteAccount(), /test failure/);
  assert.equal(getSessionSnapshot()?.userId, session.userId);
  assert.equal(stored.has("tuti-session"), true);
  fail = false;
  const before = deletes;
  const result = await deleteAccount();
  assert.equal(deletes - before, 1);
  assert.equal(result.deletionReference, "single-delete-receipt");
  assert.equal(result.pushCleanupPending, false);
  assert.equal(getSessionSnapshot(), null);
  assert.equal(stored.has("tuti-session"), false);
  assert.equal(stored.has("tuti-harumadi-pdf-v1:delete-user"), false);
  assert.equal(stored.has("tuti-service-terms-acceptance:delete-user"), false);
});
