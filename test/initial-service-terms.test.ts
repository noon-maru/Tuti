import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { preferencesStorage } from "@/lib/storage/preferencesStorage";
import { discardInvalidSession, getSessionSnapshot, readStoredSession } from "@/lib/auth/session";
import { acceptInitialServiceTerms, isInitialTermsRightsPath, loadInitialServiceTerms, startInitialServiceTerms } from "@/lib/initialServiceTerms";
import { serviceTermsAcceptanceCache, type CachedTermsAcceptance } from "@/lib/serviceTermsAcceptanceCache";
import type { ServiceTermsOffer } from "@/shared/legal/serviceTerms";

const offer: ServiceTermsOffer = {
  version: "test-effective-terms", documentHash: "a".repeat(64), accepted: false,
  publishedAt: "2026-09-01T00:00:00Z", effectiveAt: "2026-10-01T00:00:00Z",
  document: { title: "서비스 이용약관", summary: "기록과 계정의 이용 범위입니다.", importantTerms: ["기록의 권리는 이용자에게 남습니다."],
    sections: [{ title: "기록", paragraphs: ["기록과 디지털 하루마디를 제공합니다."] }] },
};

test("최초 약관 진입은 시행 원문과 실제 동의만 허용하며 구서버 응답으로 통과하지 않는다", async t => {
  const storage = new Map<string, string>();
  const cachedReceipts = new Map<string, CachedTermsAcceptance>();
  t.mock.method(serviceTermsAcceptanceCache, "read", async (id: string) => cachedReceipts.get(id) ?? null);
  t.mock.method(serviceTermsAcceptanceCache, "write", async (receipt: CachedTermsAcceptance) => { cachedReceipts.set(receipt.userId, receipt); });
  t.mock.method(serviceTermsAcceptanceCache, "clear", async (id: string) => { cachedReceipts.delete(id); });
  let lookupWait: Promise<void> | null = null;
  const requests: Array<{ path: string; method: string; authorization: string | null }> = [];
  let current: ServiceTermsOffer | null = offer;
  let accepted = false;
  let failSubmission = false;
  let failLookup = false;
  let discardReceipt = false;
  let enforcementEnabled: unknown = undefined;
  let compactReceipt = true;
  let corruptCompact = false;
  t.mock.method(preferencesStorage, "getItem", async (key: string) => storage.get(key) ?? null);
  t.mock.method(preferencesStorage, "setItem", async (key: string, value: string) => { storage.set(key, value); });
  t.mock.method(preferencesStorage, "removeItem", async (key: string) => { storage.delete(key); });
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input), "https://tuti.today").pathname;
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
    if (lookupWait) await lookupWait;
    if (failLookup) return Response.json({}, { status: 503 });
    const currentOffer = current ? { ...current, accepted } : null;
    if (compactReceipt && currentOffer?.accepted) {
      const { document: omitted, ...reference } = currentOffer;
      void omitted;
      return Response.json({ current: corruptCompact ? { ...reference, documentHash: "invalid" } : reference, upcoming: null, required: false });
    }
    return Response.json({ current: currentOffer, upcoming: null, required: Boolean(current && !accepted), ...(enforcementEnabled === undefined ? {} : { enforcementEnabled }) });
  });

  await t.test("최초 조회는 저장소를 쓰거나 세션·분석을 생성하지 않는다", async () => {
    assert.equal(await readStoredSession(), null);
    const state = await loadInitialServiceTerms();
    assert.equal(state.allowed, false);
    assert.equal(state.hasStoredSession, false);
    assert.equal(state.offer?.version, offer.version);
    assert.equal(getSessionSnapshot(), null);
    assert.equal(storage.size, 0);
    assert.equal(cachedReceipts.size, 0);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].authorization, null);
  });
  await t.test("구서버의 빈 응답도 일반 이용을 허용하지 않으며 동의·세션을 생성하지 않는다", async () => {
    current = null;
    await assert.rejects(loadInitialServiceTerms);
    failLookup = true;
    await assert.rejects(loadInitialServiceTerms);
    failLookup = false;
    current = offer;
    assert.equal(storage.size, 0);
    assert.ok(requests.every(request => request.method === "GET"));
  });
  await t.test("서버 강제 플래그를 끄더라도 실제 영수증 없이는 진입하지 않는다", async () => {
    enforcementEnabled = false;
    assert.equal((await loadInitialServiceTerms()).allowed, false);
    enforcementEnabled = true;
    assert.equal((await loadInitialServiceTerms()).allowed, false);
    current = null;
    await assert.rejects(loadInitialServiceTerms);
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
    await assert.rejects(loadInitialServiceTerms);
    current = offer;
    failSubmission = false;
    assert.equal(cachedReceipts.size, 0);
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
  await t.test("동의 완료 계정은 원문 없이 버전·해시를 확인하고 변조 응답은 거절한다", async () => {
    const state = await loadInitialServiceTerms();
    assert.equal(state.allowed, true);
    assert.equal(state.offer, null);
    assert.deepEqual(state.acceptedTerms, { version: offer.version, documentHash: offer.documentHash });
    corruptCompact = true;
    await assert.rejects(loadInitialServiceTerms);
    corruptCompact = false;
    compactReceipt = false;
    assert.equal((await loadInitialServiceTerms()).offer?.accepted, true);
    compactReceipt = true;
  });
  await t.test("저장된 동의는 네트워크 대기 전에 전달하고 통신 실패만으로 지우지 않는다", { timeout: 3000 }, async () => {
    let release!: () => void;
    lookupWait = new Promise<void>(resolve => { release = resolve; });
    let cachedReady!: (state: Awaited<ReturnType<typeof loadInitialServiceTerms>>) => void;
    const ready = new Promise<Awaited<ReturnType<typeof loadInitialServiceTerms>>>(resolve => { cachedReady = resolve; });
    const pending = startInitialServiceTerms(cachedReady);
    assert.equal((await ready).allowed, true);
    release();
    assert.equal((await pending).allowed, true);
    lookupWait = null;
    failLookup = true;
    let admittedFromCache = false;
    await assert.rejects(startInitialServiceTerms(state => { admittedFromCache = state.allowed; }));
    assert.equal(admittedFromCache, true);
    assert.equal(cachedReceipts.has("first-user"), true);
    failLookup = false;
  });
  await t.test("서버가 미동의를 확인하면 캐시를 지우고 원문을 제공하며 강제 재확인은 캐시를 건너뛴다", async () => {
    accepted = false;
    let sawCache = false;
    const state = await startInitialServiceTerms(() => { sawCache = true; });
    assert.equal(sawCache, true);
    assert.equal(state.allowed, false);
    assert.ok(state.offer);
    assert.equal(cachedReceipts.has("first-user"), false);
    accepted = true;
    await loadInitialServiceTerms();
    sawCache = false;
    await startInitialServiceTerms(() => { sawCache = true; }, false);
    assert.equal(sawCache, false);
  });
  await t.test("기존 계정의 조회 장애는 권리 행사에 필요한 저장 계정 여부만 유지한다", async () => {
    failLookup = true;
    await assert.rejects(loadInitialServiceTerms(), error => error instanceof Error && "hasStoredSession" in error && error.hasStoredSession === true);
    failLookup = false;
  });
  await t.test("조회 도중 세션을 지우면 이전 계정의 늦은 응답으로 진입을 허용하지 않는다", async () => {
    let release!: () => void;
    lookupWait = new Promise<void>(resolve => { release = resolve; });
    const pending = loadInitialServiceTerms();
    await discardInvalidSession(getSessionSnapshot()!);
    release();
    await assert.rejects(pending);
    assert.equal(cachedReceipts.has("first-user"), false);
    lookupWait = null;
  });
});

test("최초 약관 화면은 Providers 바깥에서 자식 마운트를 제어하고 기존 권리 경로는 유지한다", () => {
  const shell = readFileSync("src/features/tuti/components/TutiAppShell.tsx", "utf8");
  assert.ok(shell.indexOf("<InitialServiceTermsGate") < shell.indexOf("<Providers"));
  assert.match(shell, /activityEnabled=\{false\}/);
  assert.match(shell, /rightsOnly/);
  assert.doesNotMatch(shell, /ServiceTermsNotice/);
  assert.match(shell, /<NativeAppUpdateNotice>/);
  assert.match(shell, /<InitialServiceTermsGate renderContent=\{content => <NativeAppUpdateNotice>/);
  const gate = readFileSync("src/features/legal/InitialServiceTermsGate.tsx", "utf8");
  assert.match(gate, /state\?\.allowed\) return renderContent\(children\)/);
  assert.match(gate, /\$fullWidth disabled=\{saving\}/);
  assert.match(gate, /await animateRequiredConsents/);
  assert.match(gate, /displayedDocument\.importantTerms\.map/);
  assert.doesNotMatch(gate, /localStorage\.setItem|accepted:\s*true/);
  assert.match(gate, /addEventListener\(SERVICE_TERMS_REQUIRED_EVENT, requireTerms\)/);
  assert.match(gate, /removeEventListener\(SERVICE_TERMS_REQUIRED_EVENT, requireTerms\)/);
  assert.match(gate, /allowed: false, offer: null/);
  assert.match(gate, /active && !usedCache/);
  assert.match(gate, /if \(entryRedirect \|\| \(!state && !error\)\) return renderContent\(<LoadingBrand/);
  assert.match(gate, /role=\{reconsentDialog \? "dialog"/);
  const main = readFileSync("src/features/tuti/flows/MainFlow.tsx", "utf8");
  assert.doesNotMatch(main, /<RecommendationsFlow/);
  assert.match(main, /rightsOnly \|\| !hasHydrated \|\| !entryRecord \|\| pathname !== "\/explore"/);
  for (const path of ["/login", "/inquiry", "/journal", "/journal/detail", "/location", "/notifications"]) assert.equal(isInitialTermsRightsPath(path), true);
  for (const path of ["/", "/entry", "/journal/new", "/journal/edit"]) assert.equal(isInitialTermsRightsPath(path), false);
});
