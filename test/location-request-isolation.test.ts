import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { TutiSession } from "@/shared/api/session";

const source = readFileSync("src/lib/tutiApi.ts", "utf8");
function load(name: string, end: string, bindings: Record<string, unknown>) {
  const code = source.slice(source.indexOf(`export async function ${name}(`), source.indexOf(`export async function ${end}(`)).replace(/^export /, "");
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${compiled};return ${name};`)(...Object.values(bindings));
}

test("약관 확인 중 계정이 바뀌면 새 계정으로 동의를 보내지 않는다", async () => {
  const original = { userId: "location-a", accessToken: "a" }, replacement = { userId: "location-b", accessToken: "b" };
  let current = original, complete!: () => void, posts = 0;
  const checking = new Promise<void>(resolve => { complete = resolve; });
  const update = load("updateLocationConsent", "fetchLocationConsent", {
    getSessionSnapshot: () => current, ensureSession: async () => current,
    isSessionCurrent: (session: TutiSession) => session.accessToken === current.accessToken,
    getLocationTermsVersion: () => "2026-10-22", fetchServiceTerms: () => checking, Capacitor: { getPlatform: () => "web" },
    fetchWithPinnedSession: async () => { posts++; return Response.json({}); },
  });
  const pending = update("accepted", true);
  current = replacement; complete();
  await assert.rejects(pending, /계정이 변경/);
  assert.equal(posts, 0);
});

test("위치 동의·조회·이력은 응답 본문 대기 중의 세션 교체도 차단한다", async () => {
  for (const [name, end, args] of [["updateLocationConsent", "fetchLocationConsent", ["declined"]], ["fetchLocationConsent", "fetchLocationHistory", []], ["fetchLocationHistory", "fetchRecommendations", []]] as const) {
    let current = { userId: "same-owner", accessToken: "old-token" }, complete!: (value: unknown) => void, start!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const run = load(name, end, {
      getSessionSnapshot: () => current, ensureSession: async () => current,
      isSessionCurrent: (session: TutiSession) => session.userId === current.userId && session.accessToken === current.accessToken,
      getLocationTermsVersion: () => "2026-10-22", Capacitor: { getPlatform: () => "web" }, syncLegalPolicyRelease() {},
      fetchWithPinnedSession: async (_path: string, _init: unknown, owner: string) => {
        assert.equal(owner, "same-owner");
        return { ok: true, json: () => { start(); return new Promise(resolve => { complete = resolve; }); } };
      },
    });
    const pending = run(...args);
    await started; current = { userId: "same-owner", accessToken: "new-token" }; complete({ consent: null });
    await assert.rejects(pending, /계정이 변경/);
  }
});
