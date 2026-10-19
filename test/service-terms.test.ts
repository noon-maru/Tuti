import assert from "node:assert/strict";
import test from "node:test";
import { parseServiceTermsDocument, requiresServiceTerms } from "@/shared/legal/serviceTerms";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
const now = new Date("2026-10-19T00:00:00Z");
const document = { title: "Tuti 서비스 이용약관", summary: "서비스 이용 범위와 책임을 확인해주세요.", importantTerms: ["기록의 권리는 이용자에게 남습니다."], sections: [{ title: "이용 범위", paragraphs: ["기록·기록집 기능을 제공합니다."] }] };
type Release = { version: string; document: typeof document; documentHash: string; publishedAt: Date; effectiveAt: Date };
let releases: Release[] = [];
const receipts: Array<{ userId: string; termsVersion: string; documentHash: string; acceptedAt: Date }> = [];
let queries = 0;
const database = {
  $queryRaw: async () => [{ id: "subject" }],
  user: { findUnique: async () => ({ id: "subject", role: "user", lastAccessedAt: new Date(), authIdentities: [] }) },
  serviceTermsRelease: {
    findFirst: async ({ where }: { where: { effectiveAt: { lte?: Date; gt?: Date } } }) => {
      queries += 1;
      return releases.find((release) => where.effectiveAt.lte ? release.effectiveAt <= where.effectiveAt.lte : release.effectiveAt > where.effectiveAt.gt!) ?? null;
    },
    findUnique: async ({ where }: { where: { version: string } }) => releases.find((release) => release.version === where.version) ?? null,
  },
  serviceTermsAcceptance: {
    findMany: async () => receipts,
    upsert: async ({ create }: { create: typeof receipts[number] }) => {
      const existing = receipts.find((receipt) => receipt.userId === create.userId && receipt.termsVersion === create.termsVersion);
      if (existing) return existing;
      receipts.push(create);
      return create;
    },
  },
};
(globalThis as { prisma?: unknown }).prisma = { ...database, $transaction: (operation: (client: typeof database) => Promise<unknown>) => operation(database) };
const { hashServiceTerms, getServiceTermsStatus, acceptServiceTerms } = await import("@/server/legal/serviceTerms");
const { prepareServiceTermsRelease, RELEASE_READINESS_CHECKS } = await import("@/server/legal/releaseApproval");
const { guardServiceTerms, isLegalRightsRequest, isLegalRightsPath } = await import("@/server/legal/requestGuard");
const hash = hashServiceTerms(document);
const body = { version: "2026-11-19", documentHash: hash, accepted: true, ageConfirmed: true, importantTermsConfirmed: true };

test("일반약관의 공고·명시적 동의·미동의 접근 통제", async (t) => {
  await t.test("비활성 상태에서는 약관 테이블을 조회하거나 동의를 생성하지 않는다", async () => {
    delete process.env.SERVICE_TERMS_WORKFLOW_ENABLED;
    assert.equal((await getServiceTermsStatus("subject", now)).required, false);
    assert.equal(queries, 0);
    await assert.rejects(acceptServiceTerms("subject", body, now), { status: 409 });
    assert.equal(receipts.length, 0);
  });
  await t.test("미확정 문구·누락된 승인·30일 미만 공고를 거부한다", () => {
    const input = { version: body.version, approvalReference: "APPROVAL-123", effectiveAt: "2026-11-19T00:00:00Z", document, readiness: Object.fromEntries(RELEASE_READINESS_CHECKS.map((key) => [key, true])) };
    assert.throws(() => prepareServiceTermsRelease({ ...input, readiness: {} }, now), /완료되지/);
    assert.throws(() => prepareServiceTermsRelease({ ...input, effectiveAt: "2026-10-20" }, now), /30일/);
    assert.throws(() => parseServiceTermsDocument({ ...document, summary: "공개 전 확정할 초안" }), /draft/);
    const prepared = prepareServiceTermsRelease(input, now);
    assert.equal(prepared.documentHash, hash);
    assert.equal(prepared.publishedAt.toISOString(), now.toISOString());
  });
  await t.test("시행 전 공고는 안내하되 동의를 강제하지 않는다", async () => {
    process.env.SERVICE_TERMS_WORKFLOW_ENABLED = "true";
    releases = [{ version: body.version, document, documentHash: hash, publishedAt: now, effectiveAt: new Date("2026-11-19T00:00:00Z") }];
    const state = await getServiceTermsStatus("subject", now);
    assert.equal(state.required, false);
    assert.equal(state.upcoming?.version, body.version);
  });
  await t.test("동의 전·문서 해시 불일치·연령 확인 누락은 동의로 취급하지 않는다", async () => {
    releases[0].effectiveAt = now;
    assert.equal((await getServiceTermsStatus("subject", now)).required, true);
    for (const invalid of [{ ...body, accepted: false }, { ...body, ageConfirmed: false }, { ...body, importantTermsConfirmed: false }, { ...body, documentHash: "bad-hash" }]) {
      await assert.rejects(acceptServiceTerms("subject", invalid, now));
    }
    assert.equal(receipts.length, 0);
  });
  await t.test("미동의 쓰기는 428, 공개 중지·삭제·기존 기록 읽기는 허용한다", async () => {
    process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = "true";
    const headers = { Authorization: `Bearer ${"a".repeat(40)}`, "Content-Type": "application/json" };
    const request = new Request("https://tuti.today/api/journal-entries", { method: "POST", headers });
    assert.equal((await guardServiceTerms(request))?.status, 428);
    const unpublish = new Request("https://tuti.today/api/journal-entries/entry/publication", { method: "PATCH", headers, body: JSON.stringify({ published: false }) });
    assert.equal(await guardServiceTerms(unpublish), null);
    assert.deepEqual(await unpublish.json(), { published: false });
    const trailing = new Request("https://tuti.today/api/journal-entries/entry/publication/", { method: "PATCH", headers, body: JSON.stringify({ published: false }) });
    assert.equal(await guardServiceTerms(trailing), null);
    const publish = new Request(unpublish.url, { method: "PATCH", headers, body: JSON.stringify({ published: true }) });
    assert.equal((await guardServiceTerms(publish))?.status, 428);
    assert.equal(await guardServiceTerms(new Request(request.url, { method: "DELETE", headers })), null);
    assert.equal(await guardServiceTerms(new Request(request.url, { headers })), null);
  });
  await t.test("차단만 비활성화해도 공고 문서와 명시적 동의 저장은 유지한다", async () => {
    process.env.SERVICE_TERMS_ENFORCEMENT_ENABLED = "false";
    assert.equal((await getServiceTermsStatus("subject", now)).current?.version, body.version);
    const request = new Request("https://tuti.today/api/journal-entries", { method: "POST" });
    assert.equal(await guardServiceTerms(request), null);
    assert.equal(receipts.length, 0);
    await acceptServiceTerms("subject", body, now);
    assert.equal((await getServiceTermsStatus("subject", now)).current?.accepted, true);
    assert.equal(receipts.length, 1);
  });
  await t.test("명시적 동의 후에는 통과하며 재시도해도 최초 시각은 보존한다", async () => {
    const first = await acceptServiceTerms("subject", body, now);
    const second = await acceptServiceTerms("subject", body, new Date(now.getTime() + 1000));
    assert.equal(first.acceptedAt, second.acceptedAt);
    assert.equal(receipts.length, 1);
    assert.equal((await getServiceTermsStatus("subject", now)).required, false);
  });
  await t.test("원문이 변조되면 저장된 동의가 있어도 정상 상태로 보지 않는다", async () => {
    releases[0].document = { ...document, summary: "다른 내용" };
    await assert.rejects(getServiceTermsStatus("subject", now), /integrity/);
  });
});

test("보안 차단 중에도 권리 행사 경로만 예외로 두고 새 공개·작성은 예외로 두지 않는다", async () => {
  for (const path of ["/api/location-consent/", "/api/%6cocation-consent", "/api/reports", "/api/inquiries", "/legal/privacy"]) assert.equal(isLegalRightsPath(path, "POST"), true, path);
  for (const path of ["/api/account", "/api/journal-entries/entry", "/api/journal-books/book"]) {
    assert.equal(isLegalRightsPath(path, "DELETE"), true, path);
    assert.equal(isLegalRightsPath(path, "PATCH"), false, path);
  }
  assert.equal(isLegalRightsPath("/api/reports-extra", "POST"), false);
  assert.equal(isLegalRightsPath("/api/%zz", "POST"), false);
  const request = (published: unknown, suffix = "") => new Request(`https://tuti.today/api/journal-entries/entry/publication${suffix}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published }) });
  const unpublish = request(false, "/");
  assert.equal(await isLegalRightsRequest(unpublish), true);
  assert.deepEqual(await unpublish.json(), { published: false }, "원래 API가 읽을 본문을 소비하지 않는다.");
  for (const value of [true, "false", null, 0]) assert.equal(await isLegalRightsRequest(request(value)), false);
  assert.equal(await isLegalRightsRequest(new Request("https://tuti.today/api/journal-entries/entry/publication", { method: "PATCH", body: "invalid json" })), false);
});

test("권리 행사 경로와 자료 내보내기는 약관 게이트에서 제외한다", () => {
  for (const path of ["/api/service-terms", "/api/inquiries", "/api/reports", "/api/account-deletion-requests", "/api/location-consent", "/api/auth/logout", "/api/auth/email/verify-code", "/api/journal-entries/entry/share-traces", "/api/journal-entries/entry/share-traces/trace/finalize"]) assert.equal(requiresServiceTerms(path, "POST"), false, path);
  for (const path of ["/api/journal-entries", "/api/journal-books/preview", "/api/product-activity", "/api/recommendation-actions", "/api/recommendations/", "/api/%6aournal-entries"]) assert.equal(requiresServiceTerms(path, "POST"), true, path);
});
