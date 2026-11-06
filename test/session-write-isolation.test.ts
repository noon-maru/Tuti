import assert from "node:assert/strict";
import test from "node:test";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { ensureSession, getSessionSnapshot, logoutAccount, refreshAccountProfile, updateAccountDisplayName, unlinkAccountIdentity, verifyEmailLoginCode } from "@/lib/auth/session";

test("세션 저장은 이전 요청의 계정·토큰·갱신 세대를 확인한다", async t => {
  const account = { displayName: "synthetic", providers: ["email" as const] };
  const original = { userId: "isolation-original", accessToken: "a".repeat(40), account };
  let stored = JSON.stringify(original);
  t.mock.method(preferencesStorage, "getItem", async () => stored);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { if (key === "tuti-session") stored = value; });
  t.mock.method(preferencesStorage, "removeItem", async () => {});
  await ensureSession();

  await t.test("로그인 전환 뒤 도착한 프로필은 이전 세션을 부활시키지 않는다", async t => {
    let complete!: (value: Response) => void, start!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const next = { userId: "isolation-next", accessToken: "b".repeat(40), account };
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
      if (String(url).endsWith("auth/logout")) return Response.json({ session: next });
      start(); return new Promise<Response>(resolve => { complete = resolve; });
    });
    const pending = refreshAccountProfile();
    await started; await logoutAccount(); complete(Response.json({ account }));
    await assert.rejects(pending, /계정이 변경/);
    assert.equal(getSessionSnapshot()?.userId, next.userId);
    assert.equal(JSON.parse(stored).userId, next.userId);
  });

  await t.test("같은 계정의 이름 수정 뒤 늦은 프로필이 예전 이름을 덮어쓰지 않는다", async t => {
    let complete!: (value: Response) => void, start!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") return Response.json({ displayName: "new-name" });
      start(); return new Promise<Response>(resolve => { complete = resolve; });
    });
    const pending = refreshAccountProfile();
    await started; await updateAccountDisplayName("new-name"); complete(Response.json({ account }));
    await assert.rejects(pending, /계정이 변경/);
    assert.equal(getSessionSnapshot()?.account?.displayName, "new-name");
  });

  await t.test("늦은 로그인 수단 해제도 다음 계정의 세션을 덮어쓰지 않는다", async t => {
    let complete!: (value: Response) => void, start!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const next = { userId: "isolation-third", accessToken: "c".repeat(40), account };
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
      if (String(url).endsWith("auth/logout")) return Response.json({ session: next });
      start(); return new Promise<Response>(resolve => { complete = resolve; });
    });
    const pending = unlinkAccountIdentity("synthetic-identity");
    await started; await logoutAccount(); complete(Response.json({ unlinked: true, account }));
    await assert.rejects(pending, /계정이 변경/);
    assert.equal(getSessionSnapshot()?.userId, next.userId);
  });

  await t.test("겹친 로그인 응답 중 이미 전환된 계정의 과거 응답은 저장하지 않는다", async t => {
    let complete!: (value: Response) => void, start!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const next = { userId: "isolation-final", accessToken: "d".repeat(40), account };
    t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      if (JSON.parse(String(init?.body)).email === "fast@example.test") return Response.json({ status: "authenticated", session: next });
      start(); return new Promise<Response>(resolve => { complete = resolve; });
    });
    const pending = verifyEmailLoginCode({ email: "slow@example.test", code: "123456" });
    await started; await verifyEmailLoginCode({ email: "fast@example.test", code: "123456" });
    complete(Response.json({ status: "authenticated", session: original }));
    await assert.rejects(pending, /계정이 변경/);
    assert.equal(JSON.parse(stored).userId, next.userId);
  });
});
