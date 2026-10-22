import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { getSessionSnapshot, readStoredSession } from "@/lib/auth/session";
import { acceptInitialServiceTerms, isInitialTermsRightsPath, loadInitialServiceTerms } from "@/lib/initialServiceTerms";
import type { ServiceTermsOffer } from "@/shared/legal/serviceTerms";

const offer: ServiceTermsOffer = {
  version: "test-effective-terms", documentHash: "a".repeat(64), accepted: false,
  publishedAt: "2026-09-01T00:00:00Z", effectiveAt: "2026-10-01T00:00:00Z",
  document: { title: "서비스 이용약관", summary: "기록과 계정의 이용 범위입니다.", importantTerms: ["기록의 권리는 이용자에게 남습니다."],
    sections: [{ title: "기록", paragraphs: ["기록과 디지털 기록집을 제공합니다."] }] },
};

test("최초 약관 진입은 서버 전환 전 기존 흐름을 허용하고 전환 후에는 실제 동의를 요구한다", async t => {
  const storage = new Map<string, string>();
  const requests: Array<{ path: string; method: string; authorization: string | null }> = [];
  let current: ServiceTermsOffer | null = offer;
  let accepted = false;
  let failSubmission = false;
  let failLookup = false;
  let discardReceipt = false;
  let enforcementEnabled: unknown = undefined;
  t.mock.method(preferencesStorage, "getItem", async (key: string) => storage.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { storage.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { storage.delete(key); });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("Authorization");
    requests.push({ path, method, authorization });
    if (path.endsWith("anonymous-session")) return Response.json({ session: { userId: "first-user", accessToken: "s".repeat(40) } });
    assert.ok(path.endsWith("service-terms"), "약관 조회와 명시적 계정 발급 외의 요청을 보내지 않는다");
    if (method === "POST") {
      assert.equal(authorization, `Bearer ${"s".repeat(40)}`);
      if (failSubmission) return Response.json({ error: "test failure" }, { status: 503 });
      const body = JSON.parse(String(init?.body));
      assert.equal(body.ageConfirmed, true);
      assert.equal(body.importantTermsConfirmed, true);
      assert.equal(body.documentHash, offer.documentHash);
      if (!discardReceipt) accepted = true;
      return Response.json({ receipt: { termsVersion: offer.version } });
    }
    if (failLookup) return Response.json({}, { status: 503 });
    return Response.json({ current: current ? { ...current, accepted } : null, upcoming: null, required: Boolean(current && !accepted), ...(enforcementEnabled === undefined ? {} : { enforcementEnabled }) });
  });

  await t.test("최초 조회는 저장소를 쓰거나 세션·분석을 생성하지 않는다", async () => {
    assert.equal(await readStoredSession(), null);
    const state = await loadInitialServiceTerms();
    assert.equal(state.allowed, false);
    assert.equal(state.hasStoredSession, false);
    assert.equal(state.offer?.version, offer.version);
    assert.equal(getSessionSnapshot(), null);
    assert.equal(storage.size, 0);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].authorization, null);
  });
  await t.test("전환 전 구서버의 정확한 빈 응답은 기존 진입을 허용하되 동의·세션을 생성하지 않는다", async () => {
    current = null;
    assert.equal((await loadInitialServiceTerms()).allowed, true);
    failLookup = true;
    await assert.rejects(loadInitialServiceTerms);
    failLookup = false;
    current = offer;
    assert.equal(storage.size, 0);
    assert.ok(requests.every(request => request.method === "GET"));
  });
  await t.test("새 서버는 강제 플래그가 꺼졌을 때만 통과하며 활성 상태의 문서 누락·잘못된 플래그는 통과하지 않는다", async () => {
    enforcementEnabled = false;
    assert.equal((await loadInitialServiceTerms()).allowed, true, "문서가 공개됐어도 서버 전환 전에는 첫 동의를 강제하지 않는다");
    enforcementEnabled = true;
    assert.equal((await loadInitialServiceTerms()).allowed, false);
    current = null;
    assert.equal((await loadInitialServiceTerms()).allowed, false, "명시적 활성 상태는 빈 문서여도 구서버 호환으로 통과하지 않는다");
    enforcementEnabled = "false";
    await assert.rejects(loadInitialServiceTerms);
    enforcementEnabled = undefined;
    current = offer;
    assert.equal(storage.size, 0);
    assert.ok(requests.every(request => request.method === "GET"));
  });
  await t.test("연령·중요 내용 중 하나라도 미확인이면 네트워크 요청 전 거절한다", async () => {
    const before = requests.length;
    await assert.rejects(acceptInitialServiceTerms(offer, { ageConfirmed: false, importantTermsConfirmed: true }));
    await assert.rejects(acceptInitialServiceTerms(offer, { ageConfirmed: true, importantTermsConfirmed: false }));
    assert.equal(requests.length, before);
  });
  await t.test("계정 발급 뒤 동의 저장이 실패해도 재시작 시 자동 통과하지 않는다", async () => {
    failSubmission = true;
    await assert.rejects(acceptInitialServiceTerms(offer, { ageConfirmed: true, importantTermsConfirmed: true }));
    const state = await loadInitialServiceTerms();
    assert.equal(state.hasStoredSession, true);
    assert.equal(state.allowed, false);
    current = null;
    assert.equal((await loadInitialServiceTerms()).allowed, false, "동의 저장 중 생성한 계정은 공고가 사라져도 기존 계정으로 우회하지 않는다");
    current = offer;
    failSubmission = false;
  });
  await t.test("전환 비활성으로 진입이 허용돼도 실제 영수증 없이는 동의 저장 성공으로 처리하지 않는다", async () => {
    enforcementEnabled = false;
    discardReceipt = true;
    await assert.rejects(acceptInitialServiceTerms(offer, { ageConfirmed: true, importantTermsConfirmed: true }));
    assert.equal(storage.get("tuti-initial-terms-pending"), "true");
    enforcementEnabled = true;
    discardReceipt = false;
  });
  await t.test("동의 저장과 계정별 서버 확인이 모두 성공해야 시작하며 다음 접속은 재동의하지 않는다", async () => {
    assert.equal((await acceptInitialServiceTerms(offer, { ageConfirmed: true, importantTermsConfirmed: true })).allowed, true);
    assert.equal((await loadInitialServiceTerms()).allowed, true);
    assert.equal(requests.filter(request => request.path.endsWith("anonymous-session")).length, 1);
    const last = requests.at(-1)!;
    assert.equal(last.authorization, `Bearer ${"s".repeat(40)}`);
  });
  await t.test("기존 계정의 조회 장애는 권리 행사에 필요한 저장 계정 여부만 유지한다", async () => {
    failLookup = true;
    await assert.rejects(loadInitialServiceTerms(), error => error instanceof Error && "hasStoredSession" in error && error.hasStoredSession === true);
    failLookup = false;
  });
});

test("최초 약관 화면은 Providers 바깥에서 자식 마운트를 제어하고 기존 권리 경로는 유지한다", () => {
  const shell = readFileSync("src/features/tuti/components/TutiAppShell.tsx", "utf8");
  assert.ok(shell.indexOf("<InitialServiceTermsGate") < shell.indexOf("<Providers"));
  assert.match(shell, /activityEnabled=\{false\}/);
  assert.match(shell, /rightsOnly/);
  const gate = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  assert.match(gate, /state\?\.allowed\) return children/);
  assert.match(gate, /saving \|\| !ageConfirmed \|\| !termsConfirmed/);
  assert.match(gate, /offer\.document\.importantTerms\.map/);
  assert.doesNotMatch(gate, /localStorage\.setItem|accepted:\s*true/);
  const main = readFileSync("src/features/tuti/flows/MainFlow.tsx", "utf8");
  assert.match(main, /!rightsOnly && <RecommendationsFlow/);
  assert.match(main, /!rightsOnly && hasHydrated && !entryRecord/);
  for (const path of ["/login", "/inquiry", "/journal", "/journal/detail", "/location", "/notifications"]) assert.equal(isInitialTermsRightsPath(path), true);
  for (const path of ["/", "/entry", "/journal/new", "/journal/edit"]) assert.equal(isInitialTermsRightsPath(path), false);
});
